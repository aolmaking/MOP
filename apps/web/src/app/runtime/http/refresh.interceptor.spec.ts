import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { SessionContext } from '@mop/shared';
import { AuthStore } from '../../identity/auth.store';
import { errorInterceptor } from './error.interceptor';
import { refreshInterceptor, resetRefreshFlight } from './refresh.interceptor';

const SESSION = { accountId: 'a1', role: 'TECHNICIAN', displayName: 'Hassan' } as unknown as SessionContext;

/**
 * Let the refresh promise settle.
 *
 * The interceptor bridges through a Promise so that concurrent callers
 * can share one flight, and a promise resolves on a microtask -- so the
 * replayed request does not reach the testing backend in the same tick
 * as the `flush()` that completed the refresh. Without this the retry
 * looks as though it never happened.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The outcome of a request, as a promise that never itself rejects.
 *
 * Necessary because these tests deliberately let a rejection happen
 * during a `settle()` window, before any assertion has attached a
 * handler to it -- which Node reports as an unhandled rejection even
 * though the test goes on to assert it. Capturing the reason at
 * subscribe time keeps the failure legible and the run clean.
 */
function outcome(observable: { subscribe(o: { next(v: unknown): void; error(e: unknown): void }): void }) {
  return new Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>((resolve) =>
    observable.subscribe({
      next: (value) => resolve({ ok: true, value }),
      error: (error) => resolve({ ok: false, error }),
    }),
  );
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withFetch(), withInterceptors([refreshInterceptor, errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    store: TestBed.inject(AuthStore),
  };
}

describe('refreshInterceptor', () => {
  beforeEach(() => resetRefreshFlight());

  it('refreshes once and replays the request that hit the expired cookie', async () => {
    const { http, backend, store } = setup();
    const result = outcome(http.get('/api/v1/technician/my-work'));

    backend.expectOne('/api/v1/technician/my-work').flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();

    backend.expectOne('/api/v1/auth/refresh').flush(SESSION);
    await settle();

    backend.expectOne('/api/v1/technician/my-work').flush({ jobs: [] });

    await expect(result).resolves.toEqual({ ok: true, value: { jobs: [] } });
    // The refresh answer is the server's, and it may differ from what was
    // held before, so the store takes it rather than assuming continuity.
    expect(store.session()).toEqual(SESSION);
    backend.verify();
  });

  /**
   * The case the single flight exists for. `AuthService.refresh` rotates
   * the refresh token: a second concurrent refresh carrying the one the
   * first just invalidated is refused, and the user is logged out by the
   * mechanism meant to keep them signed in. The work card asks for its
   * card and its journey together, so this is the FIRST expiry a real
   * technician would hit, not an edge case.
   */
  it('sends exactly one refresh when several requests expire together', async () => {
    const { http, backend } = setup();
    const first = outcome(http.get('/api/v1/technician/my-work'));
    const second = outcome(http.get('/api/v1/technician/active'));

    backend.expectOne('/api/v1/technician/my-work').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/technician/active').flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();

    // One, not two. `expectOne` is the assertion.
    backend.expectOne('/api/v1/auth/refresh').flush(SESSION);
    await settle();

    backend.expectOne('/api/v1/technician/my-work').flush({ jobs: [] });
    backend.expectOne('/api/v1/technician/active').flush({ job: null });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, value: { jobs: [] } },
      { ok: true, value: { job: null } },
    ]);
    backend.verify();
  });

  it('gives up and surfaces the original refusal when the refresh is itself refused', async () => {
    const { http, backend } = setup();
    const result = outcome(http.get('/api/v1/technician/my-work'));

    backend.expectOne('/api/v1/technician/my-work').flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();

    // Fourteen days elapsed, session revoked, tenant frozen -- all the
    // same answer, and all of them mean sign in again.
    backend.expectOne('/api/v1/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();

    await expect(result).resolves.toMatchObject({ ok: false, error: { httpStatus: 401 } });
    backend.verify();
  });

  /**
   * A 401 from `login` means the password was wrong. Refreshing on it
   * would turn a wrong password into a confusing second request and,
   * worse, hide the real answer from the form.
   */
  it('never tries to refresh a failed login', async () => {
    const { http, backend } = setup();
    const result = outcome(http.post('/api/v1/auth/login', {}));

    backend.expectOne('/api/v1/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(result).resolves.toMatchObject({ ok: false, error: { httpStatus: 401 } });
    backend.expectNone('/api/v1/auth/refresh');
    backend.verify();
  });

  it('leaves every other failure alone', async () => {
    const { http, backend } = setup();
    const result = outcome(http.get('/api/v1/technician/work-orders/wo1'));

    backend
      .expectOne('/api/v1/technician/work-orders/wo1')
      .flush({ code: 'forbidden', message: 'Not yours.' }, { status: 403, statusText: 'Forbidden' });

    await expect(result).resolves.toMatchObject({ ok: false, error: { httpStatus: 403, code: 'forbidden' } });
    backend.expectNone('/api/v1/auth/refresh');
    backend.verify();
  });
});

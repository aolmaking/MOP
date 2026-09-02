import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { refreshInterceptor } from './refresh.interceptor';

describe('refreshInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([refreshInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('refreshes once and retries the original request on a 401', async () => {
    const pending = firstValueFrom(http.get('/api/v1/technician/active'));

    httpMock.expectOne('/api/v1/technician/active').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/v1/auth/refresh').flush({ accountId: 'a1' });
    httpMock.expectOne('/api/v1/technician/active').flush({ job: null });

    expect(await pending).toEqual({ job: null });
  });

  it('surfaces the ORIGINAL 401 when the refresh itself fails, not the refresh error', async () => {
    const pending = firstValueFrom(http.get('/api/v1/technician/active')).catch((err: unknown) => err);

    httpMock
      .expectOne('/api/v1/technician/active')
      .flush({ code: 'session_expired' }, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/v1/auth/refresh').flush({ code: 'refresh_expired' }, { status: 401, statusText: 'Unauthorized' });

    const result = await pending;
    expect(result).toBeInstanceOf(HttpErrorResponse);
    expect((result as HttpErrorResponse).error).toEqual({ code: 'session_expired' });
  });

  it('surfaces the ORIGINAL 401 when the retry fails too, without a second refresh call', async () => {
    const pending = firstValueFrom(http.get('/api/v1/technician/active')).catch((err: unknown) => err);

    httpMock
      .expectOne('/api/v1/technician/active')
      .flush({ code: 'first' }, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/v1/auth/refresh').flush({ accountId: 'a1' });
    // The retry -- same URL, matched again -- fails too.
    httpMock
      .expectOne('/api/v1/technician/active')
      .flush({ code: 'second' }, { status: 401, statusText: 'Unauthorized' });

    const result = await pending;
    expect((result as HttpErrorResponse).error).toEqual({ code: 'first' });
    // No further request was made -- verified implicitly by afterEach's
    // httpMock.verify(), which fails the test on any unmatched request.
  });

  it('shares one refresh call across two requests that 401 concurrently', async () => {
    const first = firstValueFrom(http.get('/api/v1/a'));
    const second = firstValueFrom(http.get('/api/v1/b'));

    httpMock.expectOne('/api/v1/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/v1/b').flush(null, { status: 401, statusText: 'Unauthorized' });

    // Exactly one refresh call for both -- expectOne fails if there are two.
    httpMock.expectOne('/api/v1/auth/refresh').flush({ accountId: 'a1' });

    httpMock.expectOne('/api/v1/a').flush({ ok: 'a' });
    httpMock.expectOne('/api/v1/b').flush({ ok: 'b' });

    expect(await first).toEqual({ ok: 'a' });
    expect(await second).toEqual({ ok: 'b' });
  });

  it('does not touch a non-401 error', async () => {
    const pending = firstValueFrom(http.get('/api/v1/technician/active')).catch((err: unknown) => err);

    httpMock.expectOne('/api/v1/technician/active').flush({ code: 'forbidden' }, { status: 403, statusText: 'Forbidden' });

    const result = await pending;
    expect((result as HttpErrorResponse).status).toBe(403);
  });

  it('never retries a 401 from the auth endpoints themselves', async () => {
    const pending = firstValueFrom(http.post('/api/v1/auth/login', {})).catch((err: unknown) => err);

    httpMock
      .expectOne('/api/v1/auth/login')
      .flush({ code: 'invalid_credentials' }, { status: 401, statusText: 'Unauthorized' });

    const result = await pending;
    expect((result as HttpErrorResponse).status).toBe(401);
    // httpMock.verify() in afterEach fails if a refresh call was made.
  });
});

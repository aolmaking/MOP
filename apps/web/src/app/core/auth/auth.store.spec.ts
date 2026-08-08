import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { SessionContext } from '@mop/shared';
import { AuthStore } from './auth.store';
import { errorInterceptor } from '../api/error.interceptor';

const SESSION: SessionContext = {
  accountId: 'account-1',
  accountType: 'TENANT_STAFF',
  displayName: 'Test Branch Manager',
  tenantId: 'tenant-1',
  role: 'BRANCH_MANAGER',
  staffUserId: 'staff-1',
  branchScope: ['branch-1'],
  warehouseScope: [],
  categoryScope: [],
  teamScope: [],
  managedTechnicianIds: [],
  permissions: [],
  enabledModules: [],
  enabledFeatures: [],
  tenantStatus: 'ACTIVE',
  landingPage: 'branch-home',
};

describe('AuthStore', () => {
  let store: AuthStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Mirrors app.config.ts's real provideHttpClient wiring -- AuthStore
    // relies on the interceptor to normalize errors into PresentedError
    // before they reach it, so the test setup must match production here.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts idle with no session', () => {
    expect(store.status()).toBe('idle');
    expect(store.session()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('bootstrap() stores the session on success', async () => {
    const pending = store.bootstrap();
    httpMock.expectOne('/api/v1/auth/me').flush(SESSION);

    const result = await pending;

    expect(result).toEqual(SESSION);
    expect(store.session()).toEqual(SESSION);
    expect(store.status()).toBe('authenticated');
  });

  it('bootstrap() clears the session and resolves null on a 401 (never throws to the caller)', async () => {
    const pending = store.bootstrap();
    httpMock.expectOne('/api/v1/auth/me').flush({ code: 'unauthorized', message: 'Not authenticated' }, { status: 401, statusText: 'Unauthorized' });

    const result = await pending;

    expect(result).toBeNull();
    expect(store.session()).toBeNull();
    expect(store.status()).toBe('unauthenticated');
  });

  it('login() stores the session and posts the given credentials', async () => {
    const pending = store.login('owner@example.com', 'secret');

    const req = httpMock.expectOne('/api/v1/auth/login');
    expect(req.request.body).toEqual({ email: 'owner@example.com', password: 'secret' });
    req.flush(SESSION);

    const result = await pending;

    expect(result).toEqual(SESSION);
    expect(store.isAuthenticated()).toBe(true);
  });

  it('login() clears state and rethrows the presented error on failure, so the caller (e.g. the login form) can show it', async () => {
    const pending = store.login('owner@example.com', 'wrong').catch((err) => err);

    httpMock.expectOne('/api/v1/auth/login').flush({ code: 'unauthorized', message: 'Incorrect email or password' }, { status: 401, statusText: 'Unauthorized' });

    const result = await pending;

    expect(result).toMatchObject({ code: 'unauthorized', message: 'Incorrect email or password' });
    expect(store.session()).toBeNull();
    expect(store.status()).toBe('unauthenticated');
  });

  it('logout() clears the session even if the server call fails', async () => {
    // Seed an authenticated state first.
    const bootstrapPending = store.bootstrap();
    httpMock.expectOne('/api/v1/auth/me').flush(SESSION);
    await bootstrapPending;

    const logoutPending = store.logout();
    httpMock.expectOne('/api/v1/auth/logout').flush(null, { status: 500, statusText: 'Internal Server Error' });
    await logoutPending;

    expect(store.session()).toBeNull();
    expect(store.status()).toBe('unauthenticated');
  });
});

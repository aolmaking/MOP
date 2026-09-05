import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { SessionContext } from '@mop/shared';
import { rootRedirectGuard } from './root-redirect.guard';
import { AuthStore } from './auth.store';

describe('rootRedirectGuard', () => {
  function configure(session: SessionContext | null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            session: () => session,
            bootstrap: async () => session,
          },
        },
      ],
    });
  }

  it('redirects an authenticated technician to /tech', async () => {
    configure({ role: 'TECHNICIAN', landingPage: 'technician-home' } as SessionContext);

    const result = await TestBed.runInInjectionContext(() => rootRedirectGuard({} as never, {} as never));
    const router = TestBed.inject(Router);

    expect(result).toEqual(router.parseUrl('/tech'));
  });

  it('redirects an authenticated branch manager to /branch/attention', async () => {
    configure({ role: 'BRANCH_MANAGER', landingPage: 'branch-home' } as SessionContext);

    const result = await TestBed.runInInjectionContext(() => rootRedirectGuard({} as never, {} as never));
    const router = TestBed.inject(Router);

    expect(result).toEqual(router.parseUrl('/branch/attention'));
  });

  it('allows fallthrough when no session exists or role has no built landing page', async () => {
    configure(null);

    const result = await TestBed.runInInjectionContext(() => rootRedirectGuard({} as never, {} as never));

    expect(result).toBe(true);
  });
});

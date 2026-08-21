import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { authGuard } from './auth.guard';
import { AuthStore } from './auth.store';

describe('authGuard', () => {
  function configure(bootstrapResult: SessionContext | null) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { bootstrap: vi.fn().mockResolvedValue(bootstrapResult) } }],
    });
  }

  it('allows navigation through when a real session resolves', async () => {
    configure({ landingPage: 'branch-home' } as SessionContext);

    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/' } as never));

    expect(result).toBe(true);
  });

  it('redirects to /login with the attempted URL preserved when no session resolves', async () => {
    configure(null);
    const router = TestBed.inject(Router);
    const expectedTree = router.createUrlTree(['/login'], { queryParams: { redirectTo: '/some/protected/page' } });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/some/protected/page' } as never),
    );

    expect(result.toString()).toBe(expectedTree.toString());
  });
});

import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { Shell } from './shell';
import { AuthStore } from '../../../identity/auth.store';

describe('Shell', () => {
  function configure(session: SessionContext | null) {
    const authStoreStub = {
      session: () => session,
      logout: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });
    return authStoreStub;
  }

  it('shows the signed-in role and a logout button when a session exists', () => {
    configure({ role: 'BRANCH_MANAGER' } as SessionContext);
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.shell-user')?.textContent).toContain('BRANCH_MANAGER');
    expect(el.querySelector('.shell-logout')).not.toBeNull();
  });

  it('logging out calls AuthStore.logout() and navigates to /login', async () => {
    const authStoreStub = configure({ role: 'BRANCH_MANAGER' } as SessionContext);
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.logout();

    expect(authStoreStub.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });
});

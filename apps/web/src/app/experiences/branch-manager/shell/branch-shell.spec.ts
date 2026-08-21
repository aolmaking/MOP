import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { BranchShell } from './branch-shell';
import { AuthStore } from '../../../identity/auth.store';

describe('BranchShell', () => {
  function configure(session: SessionContext | null) {
    const authStoreStub = { session: () => session, logout: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });
    return authStoreStub;
  }

  function render(session: SessionContext | null) {
    const stub = configure(session);
    const fixture = TestBed.createComponent(BranchShell);
    fixture.detectChanges();
    return { fixture, stub, element: fixture.nativeElement as HTMLElement };
  }

  it('names the person, not just their role', () => {
    // The rail is also how a manager confirms which account they are in
    // after switching -- a role alone does not distinguish two managers.
    const { element } = render({ displayName: 'Mona Adel', role: 'BRANCH_MANAGER' } as SessionContext);

    expect(element.querySelector('.rail-account-name')?.textContent).toContain('Mona Adel');
  });

  it('shows the role from the session, never one hardcoded to the page', () => {
    // Anyone can reach /branch/attention; they get the no-access state.
    // The rail previously said "Branch Manager" to all of them, which is
    // the interface stating something false.
    const { element } = render({ displayName: 'Platform Admin', role: 'PLATFORM_SUPER_ADMIN' } as SessionContext);

    expect(element.querySelector('.rail-account-role')?.textContent?.trim()).toBe('platform super admin');
  });

  it('links only to pages that exist', () => {
    // A rail entry pointing at an unbuilt route teaches the manager that
    // navigation is unreliable, after which they stop reading it.
    const { element } = render({ displayName: 'M', role: 'BRANCH_MANAGER' } as SessionContext);

    const routes = [...element.querySelectorAll('.rail-link')].map((a) => a.getAttribute('href'));
    expect(routes).toEqual([
      '/branch/attention',
      '/branch/work-orders',
      '/branch/approvals',
      '/branch/delivery',
      '/branch/intake',
    ]);
  });

  it('logging out clears the session and returns to /login', async () => {
    const { fixture, stub } = render({ displayName: 'M', role: 'BRANCH_MANAGER' } as SessionContext);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.logout();

    expect(stub.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('renders no account block when there is no session', () => {
    const { element } = render(null);

    expect(element.querySelector('.rail-account')).toBeNull();
  });
});

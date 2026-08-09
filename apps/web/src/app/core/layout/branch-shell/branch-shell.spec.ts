import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { BranchShell } from './branch-shell';
import { AuthStore } from '../../auth/auth.store';

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
    const { element } = render({ displayName: 'Branch Manager', role: 'BRANCH_MANAGER' } as SessionContext);

    expect(element.querySelector('.rail-account-name')?.textContent).toContain('Branch Manager');
  });

  it('links only to pages that exist', () => {
    // A rail entry pointing at an unbuilt route teaches the manager that
    // navigation is unreliable, after which they stop reading it.
    const { element } = render({ displayName: 'M', role: 'BRANCH_MANAGER' } as SessionContext);

    const routes = [...element.querySelectorAll('.rail-link')].map((a) => a.getAttribute('href'));
    expect(routes).toEqual(['/branch/attention']);
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

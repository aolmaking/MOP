import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { TeamLeaderShell } from './team-leader-shell';
import { AuthStore } from '../../../identity/auth.store';

describe('TeamLeaderShell', () => {
  function render(session: SessionContext | null) {
    const authStoreStub = { session: () => session, logout: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });

    const fixture = TestBed.createComponent(TeamLeaderShell);
    fixture.detectChanges();
    return { fixture, stub: authStoreStub, element: fixture.nativeElement as HTMLElement };
  }

  it('links to all four pages, none of them dead', () => {
    const { element } = render({ displayName: 'T', role: 'TEAM_LEADER' } as SessionContext);

    const routes = [...element.querySelectorAll('.rail-link')].map((a) => a.getAttribute('href'));
    expect(routes).toEqual([
      '/team-leader',
      '/team-leader/technicians',
      '/team-leader/work-orders',
      '/team-leader/reports',
    ]);
  });

  it('names the signed-in person', () => {
    const { element } = render({ displayName: 'Sara Naguib', role: 'TEAM_LEADER' } as SessionContext);

    expect(element.querySelector('.rail-account-name')?.textContent).toContain('Sara Naguib');
  });

  it('logging out clears the session and returns to /login', async () => {
    const { fixture, stub } = render({ displayName: 'T', role: 'TEAM_LEADER' } as SessionContext);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.logout();

    expect(stub.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});

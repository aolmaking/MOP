import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeamLeaderHome } from './team-leader-home';
import { TeamLeaderApi, type TeamLeaderHome as HomeData } from './team-leader.api';

function data(overrides: Partial<HomeData> = {}): HomeData {
  return {
    managedCount: 3,
    activeWork: 0,
    blockedTechnicians: 0,
    waitingParts: 0,
    waitingCustomer: 0,
    reworkIssues: 0,
    recentActivity: [],
    ...overrides,
  };
}

function render(response: Partial<HomeData> | { error: unknown }) {
  const api = { home: () => ('error' in response ? throwError(() => response.error) : of(data(response))) };

  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TeamLeaderApi, useValue: api }] });
  const fixture = TestBed.createComponent(TeamLeaderHome);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('TeamLeaderHome', () => {
  it('shows the no-team state distinctly when nobody is managed yet', () => {
    const { element } = render({ managedCount: 0 });

    expect(element.textContent).toContain('No technicians are on your team yet');
  });

  it('renders the five triage cards for a team with something outstanding', () => {
    const { element } = render({ blockedTechnicians: 2 });

    expect(element.querySelectorAll('.card').length).toBe(5);
    const blocked = [...element.querySelectorAll('.card')].find((c) => c.textContent?.includes('Blocked technicians'));
    expect(blocked?.getAttribute('data-tone')).toBe('urgent');
  });

  it('never renders an action for the rework/QC card -- it is a link, not a decision', () => {
    const { element } = render({ reworkIssues: 1 });

    const card = [...element.querySelectorAll('.card')].find((c) => c.textContent?.includes('Rework'));
    expect(card?.querySelector('button')).toBeNull();
    expect(card?.querySelector('a')).not.toBeNull();
  });

  it('shows a distinct no-access state on 403', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });

    expect(element.textContent).toContain("don't have access");
  });
});

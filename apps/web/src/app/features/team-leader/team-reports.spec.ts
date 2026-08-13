import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TeamReports } from './team-reports';
import { TeamLeaderApi, type TechnicianPerformanceRow } from './team-leader.api';

function row(overrides: Partial<TechnicianPerformanceRow> = {}): TechnicianPerformanceRow {
  return {
    staffUserId: 'tech-1',
    fullName: 'Omar Khaled',
    tasksCompleted: 12,
    activeTasks: 1,
    blockers: 0,
    reworkCount: 0,
    ...overrides,
  };
}

function render(response: readonly TechnicianPerformanceRow[] | { readonly error: unknown }) {
  const api = { reports: () => ('error' in response ? throwError(() => response.error) : of(response)) };
  TestBed.configureTestingModule({ providers: [{ provide: TeamLeaderApi, useValue: api }] });
  const fixture = TestBed.createComponent(TeamReports);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('TeamReports', () => {
  it('shows the empty state for a leader with no managed technicians', () => {
    const { element } = render([]);
    expect(element.textContent).toContain('No technicians are on your team yet');
  });

  it('lists every managed technician with no finance or inventory figure', () => {
    const { element } = render([row()]);

    expect(element.textContent).toContain('Omar Khaled');
    expect(element.textContent).not.toMatch(/\$|price|cost|revenue/i);
  });

  it('flags a nonzero rework count', () => {
    const { element } = render([row({ reworkCount: 2 })]);
    expect(element.querySelector('.col-num--flag')).not.toBeNull();
  });

  it('shows a distinct no-access state on 403', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });
    expect(element.textContent).toContain("don't have access");
  });
});

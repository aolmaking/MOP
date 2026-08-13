import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TeamWorkOrders } from './team-work-orders';
import { TeamLeaderApi, type ManagedWorkOrder } from './team-leader.api';

function row(overrides: Partial<ManagedWorkOrder> = {}): ManagedWorkOrder {
  return {
    workOrderId: 'wo-1',
    status: 'IN_PROGRESS',
    technicianId: 'tech-1',
    technicianName: 'Omar Khaled',
    taskCount: 3,
    openBlockers: 0,
    ...overrides,
  };
}

function render(response: readonly ManagedWorkOrder[] | { readonly error: unknown }) {
  const api = { workOrders: () => ('error' in response ? throwError(() => response.error) : of(response)) };
  TestBed.configureTestingModule({ providers: [{ provide: TeamLeaderApi, useValue: api }] });
  const fixture = TestBed.createComponent(TeamWorkOrders);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('TeamWorkOrders', () => {
  it('shows the empty state when nothing is being worked', () => {
    const { element } = render([]);
    expect(element.textContent).toContain('Nothing your team is touching');
  });

  it('lists every managed work order with no price or payment figure', () => {
    const { element } = render([row()]);

    expect(element.textContent).toContain('Omar Khaled');
    expect(element.textContent).not.toMatch(/\$|price|payment|balance/i);
  });

  it('marks a blocked row distinctly', () => {
    const { element } = render([row({ openBlockers: 2 })]);

    expect(element.querySelector('.row--blocked')).not.toBeNull();
  });

  it('shows a distinct no-access state on 403', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });
    expect(element.textContent).toContain("don't have access");
  });
});

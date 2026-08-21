import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WorkOrdersBoard } from './work-orders-board';
import { WorkOrdersApi, type BoardResult, type BoardRow } from './work-orders.api';

function row(overrides: Partial<BoardRow> = {}): BoardRow {
  return {
    id: 'wo1',
    status: 'IN_PROGRESS',
    lane: 'WITH_US',
    identifier: 'DEMO-4471',
    customerName: 'Mona Adel',
    branchId: 'b1',
    sinceHours: 3,
    assignedTo: null,
    inspectionDeclined: false,
    ...overrides,
  };
}

function render(result: Partial<BoardResult> | { error: unknown }) {
  const api = {
    board: () =>
      'error' in result ? throwError(() => result.error) : of({ lanes: [], total: 0, unlaned: [], ...result }),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: WorkOrdersApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(WorkOrdersBoard);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('WorkOrdersBoard', () => {
  it('groups by holder and names whose move it is', () => {
    // The lane label alone ("With us") does not teach a new manager what
    // the lane means; the holder line does.
    const { element } = render({ lanes: [{ key: 'WITH_US', rows: [row()] }], total: 1 });

    expect(element.textContent).toContain('With us');
    expect(element.textContent).toContain('Ours to move');
  });

  it('orders lanes by the shared definition, not by what the API returned', () => {
    // Two screens disagreeing about lane order would make the board feel
    // like it reshuffles itself between loads.
    const { element } = render({
      lanes: [
        { key: 'READY_TO_LEAVE', rows: [row({ id: 'a', status: 'READY_FOR_DELIVERY' })] },
        { key: 'WITH_US', rows: [row({ id: 'b' })] },
      ],
      total: 2,
    });

    const titles = [...element.querySelectorAll('.lane-title')].map((n) => n.textContent?.trim());
    expect(titles).toEqual(['With us', 'Ready to leave']);
  });

  it('hides lanes with nothing in them', () => {
    // An empty lane is a heading that costs a line and says nothing.
    const { element } = render({ lanes: [{ key: 'WITH_US', rows: [row()] }], total: 1 });

    expect(element.textContent).not.toContain('Waiting on the customer');
  });

  it('states an unmapped status loudly instead of dropping the job', () => {
    // A work order in no lane would otherwise vanish from the board while
    // still existing in the yard.
    const { element } = render({ lanes: [{ key: 'WITH_US', rows: [row()] }], total: 1, unlaned: ['SOMETHING_NEW'] });

    expect(element.querySelector('.unlaned')?.textContent).toContain('SOMETHING_NEW');
  });

  it('separates an empty yard from a search that matched nothing', () => {
    const { element } = render({ lanes: [], total: 0 });

    expect(element.textContent).toContain('Nothing open');
    expect(element.textContent).not.toContain('No jobs match');
  });

  it('flags a job the customer refused inspection on', () => {
    // It changes what the Finish Gate accepts, so it travels with the row.
    const { element } = render({
      lanes: [{ key: 'WITH_US', rows: [row({ inspectionDeclined: true })] }],
      total: 1,
    });

    expect(element.querySelector('.row-flag')?.textContent?.trim()).toBe('no inspection');
  });

  it('rounds waiting time to words rather than false precision', () => {
    const { element } = render({ lanes: [{ key: 'WITH_US', rows: [row({ sinceHours: 50 })] }], total: 1 });

    expect(element.querySelector('.row-waited')?.textContent?.trim()).toBe('2 days');
  });

  it('shows the no-access state without a retry control', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'no' } });

    expect(element.textContent).toContain("don't have access");
    expect(element.textContent).not.toContain('Try again');
  });
});

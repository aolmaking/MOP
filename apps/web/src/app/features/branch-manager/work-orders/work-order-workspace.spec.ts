import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WorkOrderWorkspace } from './work-order-workspace';
import { WorkOrdersApi, type WorkOrderDetail } from './work-orders.api';

function detail(overrides: Partial<WorkOrderDetail> = {}): WorkOrderDetail {
  return {
    id: 'wo1',
    status: 'IN_PROGRESS',
    lane: 'WITH_US',
    branchId: 'b1',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    closedAt: null,
    inspectionDeclined: false,
    asset: { id: 'a1', category: 'CARS', plateNumber: 'DEMO-4471', serialNumber: null, vinOrChassisNumber: null },
    customer: { id: 'c1', fullName: 'Mona Adel', phone: '01002030424' },
    assignments: [],
    tasks: [],
    decisionRequests: [],
    ...overrides,
  };
}

async function render(result: WorkOrderDetail | { error: unknown }) {
  const api = {
    detail: () => ('error' in result ? throwError(() => result.error) : of(result)),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: WorkOrdersApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(WorkOrderWorkspace);
  fixture.componentRef.setInput('id', 'wo1');
  fixture.detectChanges();
  // The initial load is queued as a microtask so the route input is set
  // before it runs.
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('WorkOrderWorkspace', () => {
  it('leads with the plate, so the manager can confirm they opened the right car', async () => {
    const { element } = await render(detail());

    expect(element.querySelector('.job-plate')?.textContent).toContain('DEMO-4471');
  });

  it('states whose move it is, not just the status code', async () => {
    const { element } = await render(detail());

    expect(element.textContent).toContain('Ours to move');
  });

  it('puts an unacknowledged critical rejection above the work', async () => {
    // It is a liability, not a delay -- it does not improve by waiting,
    // so it must not sit inside the decision list with everything else.
    const { element } = await render(
      detail({
        decisionRequests: [
          {
            id: 'd1',
            status: 'RESOLVED',
            sentAt: null,
            createdAt: new Date().toISOString(),
            items: [
              {
                id: 'i1',
                name: 'Front brake pads',
                importance: 'CRITICAL',
                decision: 'REJECTED',
                warningAcknowledged: false,
                total: '1800.00',
              },
            ],
          },
        ],
      }),
    );

    const critical = element.querySelector('.critical');
    expect(critical).not.toBeNull();
    expect(critical?.textContent).toContain('Front brake pads');
  });

  it('does not raise a critical block once the warning is acknowledged', async () => {
    const { element } = await render(
      detail({
        decisionRequests: [
          {
            id: 'd1',
            status: 'RESOLVED',
            sentAt: null,
            createdAt: new Date().toISOString(),
            items: [
              {
                id: 'i1',
                name: 'Front brake pads',
                importance: 'CRITICAL',
                decision: 'REJECTED',
                warningAcknowledged: true,
                total: '1800.00',
              },
            ],
          },
        ],
      }),
    );

    expect(element.querySelector('.critical')).toBeNull();
  });

  it('collects blockers from every task into one answer for "why is this stuck"', async () => {
    const { element } = await render(
      detail({
        tasks: [
          {
            id: 't1',
            title: 'Replace alternator',
            status: 'BLOCKED',
            updatedAt: new Date().toISOString(),
            blockers: [
              { id: 'b1', reason: 'TOOL_MISSING', note: 'Torque wrench on loan', createdAt: new Date().toISOString() },
            ],
          },
        ],
      }),
    );

    expect(element.querySelector('.blocker-reason')?.textContent?.trim()).toBe('tool missing');
    expect(element.querySelector('.task--blocked')).not.toBeNull();
  });

  it('prints money exactly as the API sent it', async () => {
    // Money is a string across the API. Reformatting it as a number here
    // is the bug that contract exists to prevent.
    const { element } = await render(
      detail({
        decisionRequests: [
          {
            id: 'd1',
            status: 'SENT',
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            items: [
              {
                id: 'i1',
                name: 'Oil change',
                importance: 'LOW',
                decision: 'APPROVED',
                warningAcknowledged: false,
                total: '1800.50',
              },
            ],
          },
        ],
      }),
    );

    expect(element.querySelector('.decision-total')?.textContent?.trim()).toBe('1800.50');
  });

  it('says the job is not in your branches rather than confirming it exists', async () => {
    const { element } = await render({ error: { httpStatus: 404, code: 'work_order_not_found', message: 'no' } });

    expect(element.textContent).toContain("isn't in your branches");
  });

  it('explains the declined inspection instead of just flagging it', async () => {
    const { element } = await render(detail({ inspectionDeclined: true }));

    expect(element.querySelector('.job-note')?.textContent).toContain('declined inspection');
  });
});

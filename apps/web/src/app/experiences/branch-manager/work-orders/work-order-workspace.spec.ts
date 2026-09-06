import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { WorkOrderWorkspace } from './work-order-workspace';
import { WorkOrdersApi, type WorkOrderDetail } from './work-orders.api';
import { journeyFixture } from '../../../domain/journey/journey.fixture';
import type { PresentedJourney } from '../../../domain/journey/workflow-strip';

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

/**
 * "Ask the customer" is offered by the JOURNEY now, not by this page
 * reading the status. Only the journey's action list has asked both
 * halves -- whether the workshop's graph allows the move from here, and
 * whether this manager holds the permission -- so a test that wants the
 * button supplies a journey that offers it.
 */
const askAction = { key: 'request_approval', label: 'Ask the customer', hint: null };

async function render(result: WorkOrderDetail | { error: unknown }, options: { journey?: PresentedJourney } = {}) {
  const api = {
    detail: () => ('error' in result ? throwError(() => result.error) : of(result)),
    journey: () => of(options.journey ?? journeyFixture()),
    createTask: vi.fn(() => of({ id: 't9', title: 'Wiper blades', status: 'ASSIGNED', updatedAt: new Date().toISOString(), blockers: [] })),
    requestApproval: vi.fn(() => of({ workOrderId: 'wo1', status: 'AWAITING_CUSTOMER_APPROVAL' })),
    advance: vi.fn(() => of({})),
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
  return { fixture, api, element: fixture.nativeElement as HTMLElement };
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

  describe("the manager's own doors", () => {
    function press(element: HTMLElement, label: string): HTMLButtonElement {
      const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
      if (!button) throw new Error(`no button starting "${label}"`);
      return button as HTMLButtonElement;
    }

    it('adds the task the customer mentioned at the desk', async () => {
      const { api, fixture, element } = await render(detail());

      press(element, 'Add a task').click();
      fixture.detectChanges();

      const input = element.querySelector('.add-task-field input') as HTMLInputElement;
      input.value = 'Wiper blades';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      press(element, 'Add it').click();

      expect(api.createTask).toHaveBeenCalledWith('wo1', { title: 'Wiper blades' });
    });

    it('refuses to send an empty task title to the server', async () => {
      const { fixture, element } = await render(detail());

      press(element, 'Add a task').click();
      fixture.detectChanges();

      expect(press(element, 'Add it').disabled).toBe(true);
    });

    /**
     * The refusal is the server's sentence, shown as written. Rewriting
     * it into something friendlier would hide which move the workshop's
     * own graph actually has.
     */
    it("shows the workflow's own refusal when the move is not available", async () => {
      const { api, fixture, element } = await render(detail(), {
        journey: journeyFixture({ actions: [askAction] }),
      });
      api.requestApproval.mockReturnValueOnce(
        throwError(() => ({
          httpStatus: 409,
          code: 'transition_not_allowed',
          message: 'REQUEST_APPROVAL is not available from WorkOrder.IN_PROGRESS.',
        })),
      );

      press(element, 'Ask the customer').click();
      fixture.detectChanges();

      expect(element.querySelector('.band-error')?.textContent).toContain(
        'REQUEST_APPROVAL is not available from WorkOrder.IN_PROGRESS.',
      );
    });

    /**
     * The whole point of moving this onto the journey: the page no longer
     * decides for itself. A job already with the customer has no
     * REQUEST_APPROVAL edge, so the server offers no action, so there is
     * no button -- rather than a button that would be refused.
     */
    it('does not offer to ask a customer who is already being asked', async () => {
      const { element } = await render(detail({ status: 'AWAITING_CUSTOMER_APPROVAL' }), {
        journey: journeyFixture({ actions: [] }),
      });

      expect([...element.querySelectorAll('button')].some((b) => b.textContent?.includes('Ask the customer'))).toBe(false);
    });
  });
});

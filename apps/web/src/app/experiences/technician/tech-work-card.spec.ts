import { journeyFixture } from '../../domain/journey/journey.fixture';
import type { PresentedJourney } from '../../domain/journey/workflow-strip';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechWorkCard } from './tech-work-card';
import { TechnicianApi, type WorkCard } from './technician.api';

function card(overrides: Partial<WorkCard> = {}): WorkCard {
  return {
    workOrderId: 'wo1',
    identifier: 'DEMO-4471',
    customerName: 'Mona Adel',
    status: 'IN_PROGRESS',
    complaint: null,
    inspectionDeclined: false,
    timeTracking: 'OPTIONAL',
    tasks: [],
    parts: [],
    finish: { available: false, passed: false, conditions: [] },
    primaryAction: null,
    ...overrides,
  };
}

async function render(
  result: WorkCard | { error: unknown },
  /**
   * The journey the server would return alongside the card. Its own
   * fixture, because the job-level action a technician can take lives
   * there now rather than on the card.
   */
  options: { journey?: PresentedJourney } = {},
) {
  const api = {
    workCard: vi.fn(() => ('error' in result ? throwError(() => result.error) : of(result))),
    startTask: vi.fn(() => of({})),
    completeTask: vi.fn(() => of({})),
    reportBlocker: vi.fn(() => of({})),
    createFault: vi.fn(() => of({})),
    partsCatalog: vi.fn(() => of({ items: [], total: 0, categories: [] })),
    journey: vi.fn(() => of(options.journey ?? journeyFixture({ headline: 'This job is yours to move.' }))),
    requestPart: vi.fn(() => of({})),
    receivePart: vi.fn(() => of({})),
    usePart: vi.fn(() => of({})),
    finishWorkOrder: vi.fn(() => of({})),
    startInspection: vi.fn(() => of({ workOrderId: 'wo1', status: 'UNDER_INSPECTION' })),
    startWork: vi.fn(() => of({ workOrderId: 'wo1', status: 'IN_PROGRESS' })),
    returnPart: vi.fn(() => of({})),
    answerClarification: vi.fn(() => of({})),
    addExternalPart: vi.fn(() => of({})),
    raiseDecision: vi.fn(() => of({ requestId: 'r1', secureToken: 't1' })),
    vehicleHistory: vi.fn(() => of({ assetId: 'a1', identifier: null, totalPriorVisits: 0, hasPriorOwnerHistory: false, visits: [] })),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: TechnicianApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(TechWorkCard);
  fixture.componentRef.setInput('id', 'wo1');
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, api, element: fixture.nativeElement as HTMLElement, page: fixture.componentInstance as never as Internals };
}

interface Internals {
  panel: { set(v: string): void };
  reportBlocker(reason: string): void;
  faultText: { set(v: string): void };
  logFault(): void;
}

describe('TechWorkCard', () => {
  it('shows the finish conditions BEFORE anything is pressed', async () => {
    // The technician's only encounter with the capability engine. Being
    // refused after the tap means they already put the tablet down.
    const { element } = await render(
      card({
        finish: {
          available: true,
          passed: false,
          conditions: [
            { satisfied: true, text: 'inspection completed' },
            { satisfied: false, text: 'A customer decision is still unanswered.' },
          ],
        },
      }),
    );

    expect(element.querySelectorAll('.check').length).toBe(2);
    expect(element.querySelector('.check--bad')?.textContent).toContain('still unanswered');
    expect(element.textContent).toContain('Clear the items above');
  });

  it('marks each condition with a symbol as well as colour', async () => {
    // Roughly 1 in 12 men has a colour-vision deficiency, which in a
    // workshop is most of the staff. Hue alone says nothing to them.
    const { element } = await render(
      card({
        finish: { available: true, passed: true, conditions: [{ satisfied: true, text: 'no open blocker' }] },
      }),
    );

    expect(element.querySelector('.check-mark')?.textContent?.trim()).toBe('✓');
  });

  it('offers blocker reasons as taps, never a text box', async () => {
    // A technician with one free hand and a glove on will not type.
    const { page, fixture, element } = await render(card());

    page.panel.set('blocker');
    fixture.detectChanges();

    const reasons = element.querySelectorAll('.reasons .tap');
    expect(reasons.length).toBeGreaterThan(3);
    expect(element.querySelector('.reasons textarea')).toBeNull();
  });

  it('reloads from the server after a write rather than patching local state', async () => {
    // The server decides what a write did -- completing a task may have
    // moved the whole job. Guessing is how a tablet shows a job that
    // finished only on the tablet.
    const { page, api, fixture } = await render(
      card({ tasks: [{ id: 't1', title: 'Brakes', status: 'IN_PROGRESS', blockedReason: null }] }),
    );
    const before = api.workCard.mock.calls.length;

    page.reportBlocker('TOOL_MISSING');
    fixture.detectChanges();

    expect(api.reportBlocker).toHaveBeenCalled();
    expect(api.workCard.mock.calls.length).toBeGreaterThan(before);
  });

  it('keeps a failed action on the page instead of in a toast', async () => {
    const { page, api, fixture, element } = await render(
      card({ tasks: [{ id: 't1', title: 'Brakes', status: 'IN_PROGRESS', blockedReason: null }] }),
    );
    api.reportBlocker.mockReturnValueOnce(throwError(() => ({ message: 'Resolve the blocker first.', httpStatus: 400 })));

    page.reportBlocker('TOOL_MISSING');
    fixture.detectChanges();

    expect(element.querySelector('.action-error')?.textContent).toContain('Resolve the blocker first');
  });

  it('says a job is not yours rather than confirming it exists', async () => {
    const { element } = await render({ error: { httpStatus: 404, code: 'work_order_not_found', message: 'no' } });

    expect(element.textContent).toContain("isn't yours");
  });

  it('repeats the declined-inspection instruction on the card', async () => {
    // The technician is the person who would otherwise do the extra work.
    const { element } = await render(card({ inspectionDeclined: true }));

    expect(element.querySelector('.card-note')?.textContent).toContain('refused inspection');
  });

  it('hides the finish section entirely when finishing is not available', async () => {
    // A finish button that cannot work is worse than no button.
    const { element } = await render(card());

    expect(element.querySelector('.checks')).toBeNull();
  });

  it('requires whole minutes before completing a task when TIME_TRACKING is required', async () => {
    const { api, fixture, element } = await render(
      card({
        timeTracking: 'REQUIRED',
        tasks: [{ id: 't1', title: 'Brakes', status: 'IN_PROGRESS', blockedReason: null }],
      }),
    );

    const done = [...element.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Done') as HTMLButtonElement;
    expect(done.disabled).toBe(true);

    const input = element.querySelector('.time-entry input') as HTMLInputElement;
    input.value = '25';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(done.disabled).toBe(false);
    done.click();
    fixture.detectChanges();

    expect(api.completeTask).toHaveBeenCalledWith('t1', 25);
  });

  it('hides time entry and sends no minutes when TIME_TRACKING is off', async () => {
    const { api, element } = await render(
      card({
        timeTracking: 'OFF',
        tasks: [{ id: 't1', title: 'Brakes', status: 'IN_PROGRESS', blockedReason: null }],
      }),
    );

    expect(element.querySelector('.time-entry')).toBeNull();

    const done = [...element.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Done') as HTMLButtonElement;
    done.click();

    expect(api.completeTask).toHaveBeenCalledWith('t1', undefined);
  });

  /**
   * The job-level move now comes from the JOURNEY's action list rather
   * than the work card's own `primaryAction`, because only the journey's
   * version has asked both questions -- does the workshop's graph allow
   * this move from here, AND does this technician hold the permission.
   * The card's version only ever asked the graph, so it could offer a
   * button the controller then refused.
   */
  describe('the one job-level move', () => {
    it("renders the action the server named, in the server's words", async () => {
      const { element } = await render(card({ status: 'REGISTERED' }), {
        journey: journeyFixture({
          actions: [{ key: 'start_inspection', label: 'Start inspection', hint: 'Waiting on you.' }],
        }),
      });

      expect(element.querySelector('.now-actions')?.textContent).toContain('Start inspection');
    });

    it('calls the endpoint that matches the action key, not the status', async () => {
      const { api, element } = await render(card({ status: 'APPROVED_FOR_WORK' }), {
        journey: journeyFixture({ actions: [{ key: 'start_work', label: 'Start work', hint: null }] }),
      });

      (element.querySelector('.now-action') as HTMLButtonElement).click();

      expect(api.startWork).toHaveBeenCalledWith('wo1');
      expect(api.startInspection).not.toHaveBeenCalled();
    });

    it('shows nothing when the server says there is no move for this technician', async () => {
      const { element } = await render(card({ status: 'READY_FOR_QC' }));

      expect(element.querySelector('.now-actions')).toBeNull();
    });
  });

  describe('parts', () => {
    const receivedPart = (overrides: Partial<WorkCard['parts'][number]> = {}) => ({
      partRequestId: 'pr1',
      name: 'Brake pad set',
      sku: 'BP-100',
      quantity: 1,
      issued: 1,
      status: 'RECEIVED_BY_TECHNICIAN',
      statusText: 'You have it. Fit it, then mark it used.',
      waitingOn: 'YOU' as const,
      action: 'MARK_USED' as const,
      returnable: true,
      clarificationPending: false,
      clarificationQuestion: null,
      ...overrides,
    });

    it('offers a return only when the server says the workshop has one', async () => {
      const { element } = await render(card({ parts: [receivedPart({ returnable: false })] }));

      expect([...element.querySelectorAll('button')].some((b) => b.textContent?.includes('Send it back'))).toBe(false);
    });

    it('sends the quantity and reason the technician actually typed', async () => {
      const { api, fixture, element } = await render(card({ parts: [receivedPart()] }));

      const open = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Send it back')) as HTMLButtonElement;
      open.click();
      fixture.detectChanges();

      const reason = element.querySelector('.part-panel-text') as HTMLTextAreaElement;
      reason.value = 'Wrong size for this model';
      reason.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const send = [...element.querySelectorAll('.part-panel button')].find((b) => b.textContent?.includes('Send it back')) as HTMLButtonElement;
      send.click();

      expect(api.returnPart).toHaveBeenCalledWith('pr1', 1, 'Wrong size for this model');
    });

    /**
     * Found by walking this in a browser. The graph genuinely allows
     * RETURN_CLARIFICATION_REQUESTED -> RETURN_REQUESTED, so `returnable`
     * is true here and the card offered "Send it back" beside "Answer
     * the store" -- two doors to the same room, and the wrong one
     * silently throws away the question the store asked.
     */
    it('does not offer to re-send a part while the store is waiting on an answer', async () => {
      const { element } = await render(
        card({
          parts: [
            receivedPart({
              status: 'RETURN_CLARIFICATION_REQUESTED',
              statusText: 'The store asked you a question about the return.',
              action: null,
              returnable: true,
              clarificationPending: true,
              clarificationQuestion: 'Which axle did you take these off?',
            }),
          ],
        }),
      );

      const labels = [...element.querySelectorAll('button')].map((b) => b.textContent?.trim());
      expect(labels).toContain('Answer the store');
      expect(labels).not.toContain('Send it back');
    });

    it("shows the store's actual question, not just that one was asked", async () => {
      const { element } = await render(
        card({
          parts: [
            receivedPart({
              status: 'RETURN_CLARIFICATION_REQUESTED',
              statusText: 'The store asked you a question about the return.',
              action: null,
              returnable: false,
              clarificationPending: true,
              clarificationQuestion: 'Which of the two did you fit?',
            }),
          ],
        }),
      );

      expect(element.querySelector('.part-said')?.textContent).toContain('Which of the two did you fit?');
    });
  });

  it('records a part the workshop never held', async () => {
    const { api, page, fixture, element } = await render(card());

    page.panel.set('external');
    fixture.detectChanges();

    const name = element.querySelector('input.fault-text') as HTMLInputElement;
    name.value = "Customer's own oil filter";
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const record = [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Record it') as HTMLButtonElement;
    record.click();

    expect(api.addExternalPart).toHaveBeenCalledWith('wo1', "Customer's own oil filter", 'CUSTOMER_SUPPLIED', 1);
  });
});

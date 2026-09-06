import { journeyFixture } from '../../domain/journey/journey.fixture';
import type { PresentedJourney } from '../../domain/journey/workflow-strip';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechWorkCard } from './tech-work-card';
import type { ComponentFixture } from '@angular/core/testing';
import {
  TechnicianApi,
  type HistoryRecommendation,
  type TechnicianHistoryBrief,
  type WorkCard,
} from './technician.api';

function card(overrides: Partial<WorkCard> = {}): WorkCard {
  return {
    workOrderId: 'wo1',
    identifier: 'DEMO-4471',
    customerName: 'Mona Adel',
    status: 'IN_PROGRESS',
    complaint: null,
    inspectionDeclined: false,
    timeTracking: 'OPTIONAL',
    // The default is a job past Mission 1, because that is what most of
    // these cases are about. The inspection-first cases below override it.
    inspection: { id: 'insp1', state: 'COMPLETED', completedAt: '2026-09-04T08:00:00.000Z', actualMinutes: 20, faultCount: 2 },
    findings: [],
    repairLocked: false,
    repairLockReason: null,
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
  options: { journey?: PresentedJourney; history?: TechnicianHistoryBrief } = {},
) {
  const api = {
    workCard: vi.fn(() => ('error' in result ? throwError(() => result.error) : of(result))),
    startTask: vi.fn(() => of({})),
    completeTask: vi.fn(() => of({})),
    reportBlocker: vi.fn(() => of({})),
    recordInspection: vi.fn(() => of({})),
    createFault: vi.fn(() => of({ id: 'fault1' })),
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
    vehicleHistory: vi.fn(() => of(options.history ?? brief())),
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
  faultSeverity: { set(v: string): void };
  askCustomer: { set(v: boolean): void };
  faultPrice: { set(v: string): void };
  faultLaborPrice: { set(v: string): void };
  logFault(): void;
  startInspection(): void;
  completeInspection(typeOverride?: 'QUICK' | 'FULL'): void;
  inspectionType: { set(v: 'QUICK' | 'FULL'): void; (): 'QUICK' | 'FULL' };
  inspectionOdometer: { set(v: string): void; (): string };
  inspectionMinutes: { set(v: string): void; (): string };
  inspectionNote: { set(v: string): void; (): string };
  missionFindingOpen: { set(v: boolean): void; (): boolean };
  actionError: { (): string | null };
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

// ── vehicle history: the decision-support surface ────────────────────

/**
 * A brief for one car. Money is deliberately absent from every shape
 * here, exactly as the server sends it -- if a price ever appears in
 * this fixture, the server contract has changed and the template is the
 * least of the problems.
 */
function brief(overrides: Partial<TechnicianHistoryBrief> = {}): TechnicianHistoryBrief {
  return {
    workOrderId: 'wo1',
    asset: { id: 'a1', category: 'CARS', identifier: 'DEMO-4471', plateNumber: 'DEMO-4471', vin: null },
    currentComplaint: 'Brake vibration above 80 km/h',
    currentInspectionDeclined: false,
    priorVisits: 0,
    visitsExamined: 0,
    hasPriorOwnerHistory: false,
    previousComplaints: [],
    previousFindings: [],
    previousRecommendations: [],
    unresolved: [],
    generatedAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

function recommendation(
  name: string,
  outcome: HistoryRecommendation['outcome'],
  outcomeLabel: string,
  overrides: Partial<HistoryRecommendation> = {},
): HistoryRecommendation {
  return {
    id: `rec-${name}`,
    workOrderId: 'wo-old',
    name,
    explanation: `${name} was explained to the customer.`,
    importance: 'HIGH',
    decision: 'APPROVED',
    decidedAt: '2026-08-01T09:00:00.000Z',
    outcome,
    outcomeLabel,
    evidence: [
      { at: '2026-08-01T08:00:00.000Z', text: 'Sent to the customer' },
      { at: '2026-08-01T09:00:00.000Z', text: 'Customer approved this item' },
    ],
    linkedTasks: [],
    ...overrides,
  };
}

const POPULATED = brief({
  priorVisits: 2,
  visitsExamined: 2,
  previousComplaints: [
    {
      workOrderId: 'wo-old',
      at: '2026-08-01T08:00:00.000Z',
      text: 'Grinding noise when braking',
      status: 'CLOSED',
      closedAt: '2026-08-02T08:00:00.000Z',
      sameOwnerAsCurrent: true,
    },
  ],
  previousFindings: [
    {
      id: 'f1',
      workOrderId: 'wo-old',
      at: '2026-08-01T09:00:00.000Z',
      code: null,
      description: 'Front brake discs worn',
      severity: 'HIGH',
      recommendedService: 'Replace front brake discs',
      inspectionId: 'i1',
      inspectionType: 'QUICK',
      inspectionNote: 'Discs below minimum thickness.',
      sameOwnerAsCurrent: true,
    },
  ],
  previousRecommendations: [
    recommendation('Replace front brake discs', 'PERFORMED', 'Performed', {
      linkedTasks: [{ id: 't1', title: 'Replace front brake discs', status: 'DONE' }],
    }),
    recommendation('Wheel alignment', 'NOT_PERFORMED', 'Not performed', {
      id: 'rec-align',
      linkedTasks: [{ id: 't2', title: 'Wheel alignment', status: 'ASSIGNED' }],
    }),
  ],
  unresolved: [
    recommendation('Wheel alignment', 'NOT_PERFORMED', 'Not performed', {
      id: 'rec-align',
      linkedTasks: [{ id: 't2', title: 'Wheel alignment', status: 'ASSIGNED' }],
    }),
  ],
});

/** Opens the history panel and lets the lazy fetch settle. */
async function openHistory(fixture: ComponentFixture<TechWorkCard>): Promise<HTMLElement> {
  const element = fixture.nativeElement as HTMLElement;
  element.querySelector<HTMLButtonElement>('.history-toggle')!.click();
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
  return element;
}

describe('TechWorkCard vehicle history', () => {
  it('says plainly when a vehicle has never been here before', async () => {
    const { fixture } = await render(card(), { history: brief() });
    const element = await openHistory(fixture);

    expect(element.querySelector('.history-empty')?.textContent).toContain('never been here before');
    expect(element.querySelector('.history-group')).toBeNull();
  });

  it('leads with what was agreed and never done', async () => {
    const { fixture } = await render(card(), { history: POPULATED });
    const element = await openHistory(fixture);

    const alert = element.querySelector('.history-alert');
    expect(alert?.textContent).toContain('Agreed before and not done');
    expect(alert?.textContent).toContain('Wheel alignment');
    // The performed one is NOT in the alert -- that is the whole point.
    expect(alert?.textContent).not.toContain('Replace front brake discs');
  });

  it('never labels a recommendation completed unless the server said so', async () => {
    const { fixture } = await render(card(), { history: POPULATED });
    const element = await openHistory(fixture);

    const outcomes = [...element.querySelectorAll('.history-outcome')].map((node) => node.textContent?.trim());
    expect(outcomes).toContain('Performed');
    expect(outcomes).toContain('Not performed');

    // Exactly one row is styled as good news.
    expect(element.querySelectorAll('.history-outcome--good')).toHaveLength(1);
    expect(element.querySelectorAll('.history-outcome--warn')).toHaveLength(1);
  });

  it('shows the evidence behind a status when the technician asks for it', async () => {
    const { fixture } = await render(card(), { history: POPULATED });
    const element = await openHistory(fixture);

    expect(element.querySelector('.history-evidence')).toBeNull();

    element.querySelectorAll<HTMLButtonElement>('.history-rec')[0].click();
    fixture.detectChanges();

    const evidence = element.querySelector('.history-evidence');
    expect(evidence?.textContent).toContain('Customer approved this item');
    expect(element.querySelector('.history-detail')?.textContent).toContain('Replace front brake discs');
  });

  it('carries no money onto a technician tablet', async () => {
    const { fixture } = await render(card(), { history: POPULATED });
    const element = await openHistory(fixture);
    element.querySelectorAll<HTMLButtonElement>('.history-rec')[0].click();
    fixture.detectChanges();

    // The server omits the price keys entirely for this reader. Asserting
    // on the rendered text as well means a future template that reaches
    // for one fails here rather than on a workshop tablet.
    expect(element.textContent).not.toMatch(/\d+\.\d{2}/);
  });

  it('drops one car’s history the moment another car is opened', async () => {
    // A -> B -> A. Angular reuses this component when only the route id
    // changes, so without a reset the second car shows the first car's
    // brake history -- a technician reading the wrong vehicle's past
    // while holding a different car's key.
    const { fixture, api } = await render(card(), { history: POPULATED });
    const element = await openHistory(fixture);
    expect(element.textContent).toContain('Grinding noise when braking');

    api.vehicleHistory.mockReturnValue(of(brief({ workOrderId: 'wo2', currentComplaint: 'Battery flat' })));
    api.workCard.mockReturnValue(of(card({ workOrderId: 'wo2', identifier: 'OTHER-1' })));

    fixture.componentRef.setInput('id', 'wo2');
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    // The panel is closed and empty again, not showing car A's story.
    expect(element.textContent).not.toContain('Grinding noise when braking');
    expect(element.querySelector('.history-alert')).toBeNull();

    const secondCar = await openHistory(fixture);
    expect(secondCar.textContent).not.toContain('Grinding noise when braking');
    expect(secondCar.querySelector('.history-empty')?.textContent).toContain('never been here before');

    // And back to A, which must be re-fetched rather than remembered.
    api.vehicleHistory.mockReturnValue(of(POPULATED));
    api.workCard.mockReturnValue(of(card()));
    fixture.componentRef.setInput('id', 'wo1');
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const backToA = await openHistory(fixture);
    expect(backToA.textContent).toContain('Grinding noise when braking');
    expect(backToA.textContent).not.toContain('Battery flat');
  });
});

/**
 * Mission 1 on the card.
 *
 * These prove the page SAYS the right thing. They deliberately do not
 * prove anything is prevented: enforcement lives in the API and is pinned
 * by `inspection-first.integration.spec.ts`, because a disabled button is
 * not a rule -- anyone can open developer tools on a workshop tablet.
 */
describe('the technician work card, inspection first', () => {
  it('puts the inspection first, above the tasks', async () => {
    const { element } = await render(card());

    const mission = element.querySelector('.mission');
    const tasks = element.querySelector('.tools');
    expect(mission).not.toBeNull();
    expect(tasks).not.toBeNull();

    // Position, not merely presence: "Mission 1" that renders below the
    // repair list is not a first mission.
    expect(mission!.compareDocumentPosition(tasks!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says why repair work is locked, in the server\'s own words', async () => {
    const { element } = await render(
      card({
        status: 'REGISTERED',
        inspection: { id: null, state: 'REQUIRED', completedAt: null, actualMinutes: null, faultCount: 0 },
        repairLocked: true,
        repairLockReason: 'Start and record the inspection before any repair work.',
        tasks: [{ id: 't1', title: 'Replace pads', status: 'ASSIGNED', blockedReason: null }],
      }),
    );

    expect(element.querySelector('.tools-locked-why')?.textContent).toContain(
      'Start and record the inspection before any repair work.',
    );

    // And the Start control is inert while it is locked.
    const start = element.querySelector('.task button.tap--primary') as HTMLButtonElement | null;
    expect(start?.disabled).toBe(true);
  });

  it('shows a completed inspection with what it found, and unlocks the work', async () => {
    const { element } = await render(
      card({ tasks: [{ id: 't1', title: 'Replace pads', status: 'ASSIGNED', blockedReason: null }] }),
    );

    expect(element.querySelector('.mission')?.getAttribute('data-state')).toBe('COMPLETED');
    expect(element.querySelector('.mission-note')?.textContent).toContain('2 findings');
    expect(element.querySelector('.tools-locked')).toBeNull();

    const start = element.querySelector('.task button.tap--primary') as HTMLButtonElement | null;
    expect(start?.disabled).toBe(false);
  });

  it('does not nag about an inspection the customer declined', async () => {
    const { element } = await render(
      card({
        inspectionDeclined: true,
        inspection: { id: null, state: 'DECLINED', completedAt: null, actualMinutes: null, faultCount: 0 },
      }),
    );

    expect(element.querySelector('.mission')?.getAttribute('data-state')).toBe('DECLINED');
    expect(element.querySelector('.mission-state')?.textContent).toContain('Declined');
    expect(element.querySelector('.tools-locked')).toBeNull();
  });

  it('accepts the findings projection on the WorkCard', async () => {
    const { fixture } = await render(
      card({
        findings: [
          {
            id: 'f1',
            description: 'Front brake pads worn',
            severity: 'HIGH',
            code: 'B-01',
            recommendedService: 'Pad replacement',
            inspectionId: 'insp1',
            decisionStatus: 'PENDING',
          },
        ],
      }),
    );

    const comp = fixture.componentInstance as any;
    expect(comp.card()?.findings).toHaveLength(1);
    expect(comp.card()?.findings[0].decisionStatus).toBe('PENDING');
  });

  describe('data lineage in logFault', () => {
    it('passes the active inspectionId to createFault', async () => {
      const { api, page } = await render(
        card({
          inspection: { id: 'insp_active_99', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
        }),
      );

      page.faultText.set('Leaking brake caliper');
      page.logFault();

      expect(api.createFault).toHaveBeenCalledWith(
        'wo1',
        'Leaking brake caliper',
        'MEDIUM',
        'insp_active_99',
      );
    });

    it('chains returned fault.id to raiseDecision when Ask Customer is enabled', async () => {
      const { api, page } = await render(
        card({
          inspection: { id: 'insp_active_99', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
        }),
      );

      page.faultText.set('Cracked brake rotor');
      page.faultSeverity.set('CRITICAL');
      page.askCustomer.set(true);
      page.faultPrice.set('150.00');
      page.faultLaborPrice.set('50.00');

      page.logFault();

      expect(api.createFault).toHaveBeenCalledWith(
        'wo1',
        'Cracked brake rotor',
        'CRITICAL',
        'insp_active_99',
      );
      expect(api.raiseDecision).toHaveBeenCalledWith('wo1', {
        name: 'Cracked brake rotor',
        explanation: 'Cracked brake rotor',
        importance: 'CRITICAL',
        price: '150.00',
        laborPrice: '50.00',
        faultId: 'fault1',
      });
    });

    it('preserves the logged fault and reloads state when raiseDecision fails', async () => {
      const { api, page, fixture } = await render(
        card({
          inspection: { id: 'insp_active_99', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
        }),
      );

      api.raiseDecision.mockReturnValue(throwError(() => ({ message: 'Decision service unreachable' })));

      page.faultText.set('Cracked brake rotor');
      page.askCustomer.set(true);
      page.faultPrice.set('150.00');

      page.logFault();

      expect(api.createFault).toHaveBeenCalled();
      expect(api.raiseDecision).toHaveBeenCalled();
      // Verifies authoritative reload occurred
      expect(api.workCard).toHaveBeenCalledTimes(2);
      // Verifies precise partial-success error surfaced
      fixture.detectChanges();
      const comp = fixture.componentInstance as any;
      expect(comp.actionError()).toContain('Logged finding, but asking the customer did not go through');
    });
  });

  describe('Mission 1 foundation (Step 5A)', () => {
    describe('Customer Complaint rendering', () => {
      it('renders customer complaint when non-null and non-empty', async () => {
        const { element } = await render(
          card({
            complaint: 'Front squeak when braking',
          }),
        );

        const complaintEl = element.querySelector('.card-complaint');
        expect(complaintEl).not.toBeNull();
        expect(complaintEl?.textContent).toContain('Customer reported:');
        expect(complaintEl?.textContent).toContain('Front squeak when braking');
      });

      it('does not render complaint section when complaint is null', async () => {
        const { element } = await render(
          card({
            complaint: null,
          }),
        );

        expect(element.querySelector('.card-complaint')).toBeNull();
      });

      it('does not render complaint section when complaint is empty whitespace', async () => {
        const { element } = await render(
          card({
            complaint: '   ',
          }),
        );

        expect(element.querySelector('.card-complaint')).toBeNull();
      });
    });

    describe('Start Inspection CTA visibility and interaction', () => {
      it('renders Start inspection CTA inside Mission 1 for REGISTERED + REQUIRED', async () => {
        const { element } = await render(
          card({
            status: 'REGISTERED',
            inspection: { id: null, state: 'REQUIRED', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        const startBtn = missionEl?.querySelector('button.tap--primary') as HTMLButtonElement | null;
        expect(startBtn).not.toBeNull();
        expect(startBtn?.textContent).toContain('Start inspection');
      });

      it('calls api.startInspection, enters busy state, and reloads on success', async () => {
        const { api, element, fixture } = await render(
          card({
            status: 'REGISTERED',
            inspection: { id: null, state: 'REQUIRED', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        const startBtn = element.querySelector('.mission button.tap--primary') as HTMLButtonElement;
        expect(startBtn).not.toBeNull();

        startBtn.click();
        fixture.detectChanges();

        expect(api.startInspection).toHaveBeenCalledTimes(1);
        expect(api.startInspection).toHaveBeenCalledWith('wo1');
        // Verifies reload occurred
        expect(api.workCard).toHaveBeenCalledTimes(2);
      });

      it('displays meaningful error and clears busy state when startInspection fails', async () => {
        const { api, element, fixture } = await render(
          card({
            status: 'REGISTERED',
            inspection: { id: null, state: 'REQUIRED', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        api.startInspection.mockReturnValue(throwError(() => ({ message: 'Cannot start inspection from this state.' })));

        const startBtn = element.querySelector('.mission button.tap--primary') as HTMLButtonElement;
        startBtn.click();
        fixture.detectChanges();

        expect(api.startInspection).toHaveBeenCalledWith('wo1');
        const errorEl = element.querySelector('.action-error');
        expect(errorEl?.textContent).toContain('Cannot start inspection from this state.');
        expect(startBtn.disabled).toBe(false);
      });
    });

    describe('State safety in REGISTERED + REQUIRED', () => {
      it('does not render inspection completion or record controls inside Mission 1', async () => {
        const { element } = await render(
          card({
            status: 'REGISTERED',
            inspection: { id: null, state: 'REQUIRED', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        // Mission 1 has no completion controls
        expect(missionEl?.textContent).not.toContain('Record inspection');
        expect(missionEl?.textContent).not.toContain('Quick check');
        expect(missionEl?.textContent).not.toContain('Full inspection');
        expect(missionEl?.querySelector('input[type="number"]')).toBeNull();
      });
    });
  });

  describe('Active Inspection Workspace (Step 5B)', () => {
    describe('A. Active workspace visibility', () => {
      it('renders findings section, log finding action, and completion controls when inspection is IN_PROGRESS', async () => {
        const { element } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_act_1', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
            findings: [],
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        expect(missionEl?.getAttribute('data-state')).toBe('IN_PROGRESS');

        // Findings section is visible
        const findingsSection = missionEl?.querySelector('.mission-findings');
        expect(findingsSection).not.toBeNull();

        // Log Finding action is visible
        const logFindingBtn = missionEl?.querySelector('.tap--log-finding');
        expect(logFindingBtn).not.toBeNull();
        expect(logFindingBtn?.textContent).toContain('+ Log finding');

        // Inspection completion controls are visible
        const completeSection = missionEl?.querySelector('.mission-complete-inspection');
        expect(completeSection).not.toBeNull();
        expect(completeSection?.textContent).toContain('Complete inspection');
      });
    });

    describe('B. Empty findings', () => {
      it('renders clear empty state and no error state when findings list is empty', async () => {
        const { element } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_act_1', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
            findings: [],
          }),
        );

        const emptyEl = element.querySelector('.findings-empty');
        expect(emptyEl).not.toBeNull();
        expect(emptyEl?.textContent).toContain('No findings recorded yet.');
        expect(element.querySelector('.action-error')).toBeNull();
      });
    });

    describe('C. Findings rendering', () => {
      it('renders correct descriptions, severity labels, and decision status labels for all variants', async () => {
        const { element } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_act_1', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 4 },
            findings: [
              {
                id: 'f1',
                description: 'Brake line severely cracked and leaking fluid',
                severity: 'CRITICAL',
                code: 'BRK-01',
                recommendedService: 'Replace front brake lines',
                inspectionId: 'insp_act_1',
                decisionStatus: 'PENDING',
              },
              {
                id: 'f2',
                description: 'Windshield wiper blade streaking slightly',
                severity: 'LOW',
                code: null,
                recommendedService: null,
                inspectionId: 'insp_act_1',
                decisionStatus: 'NOT_REQUESTED',
              },
              {
                id: 'f3',
                description: 'Front control arm bushing torn',
                severity: 'HIGH',
                code: 'SUS-03',
                recommendedService: 'Front control arm replacement',
                inspectionId: 'insp_act_1',
                decisionStatus: 'APPROVED',
              },
              {
                id: 'f4',
                description: 'Air filter heavily saturated with dust',
                severity: 'MEDIUM',
                code: null,
                recommendedService: 'Engine air filter replacement',
                inspectionId: 'insp_act_1',
                decisionStatus: 'REJECTED',
              },
            ],
          }),
        );

        const items = element.querySelectorAll('.finding-item');
        expect(items.length).toBe(4);

        // Finding 1: CRITICAL + PENDING
        expect(items[0].textContent).toContain('Brake line severely cracked and leaking fluid');
        expect(items[0].textContent).toContain('CRITICAL');
        expect(items[0].textContent).toContain('Pending customer');
        expect(items[0].textContent).toContain('BRK-01');
        expect(items[0].textContent).toContain('Replace front brake lines');

        // Finding 2: LOW + NOT_REQUESTED
        expect(items[1].textContent).toContain('Windshield wiper blade streaking slightly');
        expect(items[1].textContent).toContain('LOW');
        expect(items[1].textContent).toContain('Internal / No customer decision requested');

        // Finding 3: HIGH + APPROVED
        expect(items[2].textContent).toContain('Front control arm bushing torn');
        expect(items[2].textContent).toContain('HIGH');
        expect(items[2].textContent).toContain('Approved');
        expect(items[2].textContent).toContain('SUS-03');

        // Finding 4: MEDIUM + REJECTED
        expect(items[3].textContent).toContain('Air filter heavily saturated with dust');
        expect(items[3].textContent).toContain('MEDIUM');
        expect(items[3].textContent).toContain('Rejected');
        expect(items[3].textContent).toContain('Engine air filter replacement');
      });
    });

    describe('D. Lineage regression test', () => {
      it('associates created fault with the active inspectionId insp_123', async () => {
        const { api, page } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_123', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        page.faultText.set('Exhaust manifold leak detected');
        page.faultSeverity.set('HIGH');
        page.logFault();

        expect(api.createFault).toHaveBeenCalledWith(
          'wo1',
          'Exhaust manifold leak detected',
          'HIGH',
          'insp_123',
        );
      });
    });

    describe('E. Decision chaining', () => {
      it('chains returned fault_456 id into api.raiseDecision', async () => {
        const { api, page } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_123', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        api.createFault.mockReturnValue(of({ id: 'fault_456' }));

        page.faultText.set('Cracked cylinder head');
        page.faultSeverity.set('CRITICAL');
        page.askCustomer.set(true);
        page.faultPrice.set('450.00');
        page.faultLaborPrice.set('200.00');

        page.logFault();

        expect(api.createFault).toHaveBeenCalledWith(
          'wo1',
          'Cracked cylinder head',
          'CRITICAL',
          'insp_123',
        );
        expect(api.raiseDecision).toHaveBeenCalledWith('wo1', {
          name: 'Cracked cylinder head',
          explanation: 'Cracked cylinder head',
          importance: 'CRITICAL',
          price: '450.00',
          laborPrice: '200.00',
          faultId: 'fault_456',
        });
      });
    });

    describe('F. Partial success', () => {
      it('retains finding, triggers reload, and shows partial success error when raiseDecision fails', async () => {
        const { api, page, fixture, element } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_123', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        api.createFault.mockReturnValue(of({ id: 'fault_789' }));
        api.raiseDecision.mockReturnValue(throwError(() => ({ message: 'Decision gateway timeout' })));

        page.faultText.set('Worn serpentine belt');
        page.askCustomer.set(true);
        page.faultPrice.set('65.00');

        page.logFault();
        fixture.detectChanges();

        expect(api.createFault).toHaveBeenCalledTimes(1);
        expect(api.raiseDecision).toHaveBeenCalledTimes(1);
        // Work card reload occurred
        expect(api.workCard).toHaveBeenCalledTimes(2);

        const errorEl = element.querySelector('.action-error');
        expect(errorEl?.textContent).toContain('Logged finding, but asking the customer did not go through: Decision gateway timeout');
      });
    });

    describe('G. Complete inspection payload', () => {
      it('submits canonical RecordInspection payload with type, odometer, actualMinutes, and note', async () => {
        const { api, page } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_123', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 1 },
          }),
        );

        page.inspectionType.set('FULL');
        page.inspectionOdometer.set('54000');
        page.inspectionMinutes.set('25');
        page.inspectionNote.set('Inspection completed');

        page.completeInspection();

        expect(api.recordInspection).toHaveBeenCalledWith('wo1', {
          type: 'FULL',
          odometerOrHours: 54000,
          actualMinutes: 25,
          note: 'Inspection completed',
        });
        expect(api.workCard).toHaveBeenCalledTimes(2);
      });
    });

    describe('H. Quick inspection', () => {
      it('submits canonical payload with type QUICK', async () => {
        const { api, page } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_123', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        page.completeInspection('QUICK');

        expect(api.recordInspection).toHaveBeenCalledWith('wo1', {
          type: 'QUICK',
        });
      });
    });

    describe('I. State safety', () => {
      it('does not render Active Inspection Workspace controls when inspection is REQUIRED', async () => {
        const { element } = await render(
          card({
            status: 'REGISTERED',
            inspection: { id: null, state: 'REQUIRED', completedAt: null, actualMinutes: null, faultCount: 0 },
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        expect(missionEl?.querySelector('.tap--log-finding')).toBeNull();
        expect(missionEl?.querySelector('.mission-fault-form')).toBeNull();
        expect(missionEl?.querySelector('.mission-complete-inspection')).toBeNull();
        expect(missionEl?.querySelector('.completion-input')).toBeNull();
      });

      it('does not render Active Inspection Workspace controls when inspection is COMPLETED', async () => {
        const { element } = await render(
          card({
            status: 'IN_PROGRESS',
            inspection: {
              id: 'insp_past',
              state: 'COMPLETED',
              completedAt: '2026-09-04T08:00:00.000Z',
              actualMinutes: 30,
              faultCount: 0,
            },
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        expect(missionEl?.querySelector('.tap--log-finding')).toBeNull();
        expect(missionEl?.querySelector('.mission-fault-form')).toBeNull();
        expect(missionEl?.querySelector('.mission-complete-inspection')).toBeNull();
        expect(missionEl?.querySelector('.completion-input')).toBeNull();
      });

      it('does not render Active Inspection Workspace controls when inspection is DECLINED', async () => {
        const { element } = await render(
          card({
            status: 'IN_PROGRESS',
            inspection: {
              id: 'insp_past',
              state: 'DECLINED',
              completedAt: null,
              actualMinutes: null,
              faultCount: 0,
            },
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        expect(missionEl?.querySelector('.tap--log-finding')).toBeNull();
        expect(missionEl?.querySelector('.mission-fault-form')).toBeNull();
        expect(missionEl?.querySelector('.mission-complete-inspection')).toBeNull();
        expect(missionEl?.querySelector('.completion-input')).toBeNull();
      });
    });
  });

  describe('Post-Inspection UX Continuity and Context (Step 5C)', () => {
    describe('A & B. Completed inspection findings and decision status persistence', () => {
      it('renders findings with all decision statuses when inspection.state is COMPLETED', async () => {
        const { element } = await render(
          card({
            status: 'APPROVED_FOR_WORK',
            inspection: { id: 'insp_c1', state: 'COMPLETED', completedAt: '2026-09-05T10:00:00.000Z', actualMinutes: 25, faultCount: 4 },
            findings: [
              {
                id: 'f1',
                description: 'Severely cracked brake disc',
                severity: 'CRITICAL',
                code: 'BRK-01',
                recommendedService: 'Rotor replacement',
                inspectionId: 'insp_c1',
                decisionStatus: 'PENDING',
              },
              {
                id: 'f2',
                description: 'Worn air filter',
                severity: 'LOW',
                code: null,
                recommendedService: null,
                inspectionId: 'insp_c1',
                decisionStatus: 'NOT_REQUESTED',
              },
              {
                id: 'f3',
                description: 'Leaking water pump',
                severity: 'HIGH',
                code: 'COOL-02',
                recommendedService: 'Water pump replacement',
                inspectionId: 'insp_c1',
                decisionStatus: 'APPROVED',
              },
              {
                id: 'f4',
                description: 'Torn CV boot',
                severity: 'MEDIUM',
                code: null,
                recommendedService: 'Axle assembly replacement',
                inspectionId: 'insp_c1',
                decisionStatus: 'REJECTED',
              },
            ],
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        expect(missionEl?.textContent).toContain('Completed');
        expect(missionEl?.textContent).toContain('4 findings recorded');

        const items = missionEl?.querySelectorAll('.finding-item');
        expect(items?.length).toBe(4);

        // Finding 1: CRITICAL + PENDING
        expect(items![0].textContent).toContain('Severely cracked brake disc');
        expect(items![0].textContent).toContain('CRITICAL');
        expect(items![0].textContent).toContain('Pending customer');
        expect(items![0].textContent).toContain('BRK-01');
        expect(items![0].textContent).toContain('Rotor replacement');

        // Finding 2: LOW + NOT_REQUESTED
        expect(items![1].textContent).toContain('Worn air filter');
        expect(items![1].textContent).toContain('LOW');
        expect(items![1].textContent).toContain('Internal / No customer decision requested');

        // Finding 3: HIGH + APPROVED
        expect(items![2].textContent).toContain('Leaking water pump');
        expect(items![2].textContent).toContain('HIGH');
        expect(items![2].textContent).toContain('Approved');
        expect(items![2].textContent).toContain('COOL-02');

        // Finding 4: MEDIUM + REJECTED
        expect(items![3].textContent).toContain('Torn CV boot');
        expect(items![3].textContent).toContain('MEDIUM');
        expect(items![3].textContent).toContain('Rejected');
        expect(items![3].textContent).toContain('Axle assembly replacement');
      });
    });

    describe('C. Completed inspection safety', () => {
      it('ensures log finding controls, form, and complete inspection controls are absent in COMPLETED', async () => {
        const { element } = await render(
          card({
            status: 'APPROVED_FOR_WORK',
            inspection: { id: 'insp_c1', state: 'COMPLETED', completedAt: '2026-09-05T10:00:00.000Z', actualMinutes: 20, faultCount: 1 },
            findings: [
              {
                id: 'f1',
                description: 'Worn brake pads',
                severity: 'HIGH',
                code: null,
                recommendedService: null,
                inspectionId: 'insp_c1',
                decisionStatus: 'APPROVED',
              },
            ],
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        // Finding remains visible
        expect(missionEl?.querySelector('.finding-item')).not.toBeNull();
        // Safety: log finding controls absent
        expect(missionEl?.querySelector('.tap--log-finding')).toBeNull();
        expect(missionEl?.querySelector('.mission-fault-form')).toBeNull();
        // Safety: complete inspection controls absent
        expect(missionEl?.querySelector('.mission-complete-inspection')).toBeNull();
        expect(missionEl?.querySelector('.completion-input')).toBeNull();
      });
    });

    describe('D. Awaiting customer approval context', () => {
      it('renders waiting for customer decision banner, keeps findings visible, and keeps repair locked', async () => {
        const { element } = await render(
          card({
            status: 'AWAITING_CUSTOMER_APPROVAL',
            inspection: { id: 'insp_c1', state: 'COMPLETED', completedAt: '2026-09-05T10:00:00.000Z', actualMinutes: 30, faultCount: 1 },
            findings: [
              {
                id: 'f1',
                description: 'Front suspension strut bent',
                severity: 'CRITICAL',
                code: 'SUS-01',
                recommendedService: 'Front strut replacement',
                inspectionId: 'insp_c1',
                decisionStatus: 'PENDING',
              },
            ],
            repairLocked: true,
            repairLockReason: 'This job still needs approval before work can start.',
            tasks: [{ id: 't1', title: 'Replace strut', status: 'ASSIGNED', blockedReason: null }],
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        expect(missionEl?.textContent).toContain('Completed');

        // Contextual banner for AWAITING_CUSTOMER_APPROVAL
        const banner = missionEl?.querySelector('.mission-locked-banner');
        expect(banner).not.toBeNull();
        expect(banner?.textContent).toContain('Waiting for customer decision');
        expect(banner?.textContent).toContain("Inspection is complete. Repair work is waiting for the customer's decision.");

        // Findings remain visible
        const finding = missionEl?.querySelector('.finding-item');
        expect(finding).not.toBeNull();
        expect(finding?.textContent).toContain('Front suspension strut bent');
        expect(finding?.textContent).toContain('Pending customer');

        // Repair remains locked
        expect(element.querySelector('.tools-locked')).not.toBeNull();
        const startBtn = element.querySelector('.task button.tap--primary') as HTMLButtonElement | null;
        expect(startBtn?.disabled).toBe(true);
      });
    });

    describe('E. Post-completion UNDER_INSPECTION context', () => {
      it('renders authorization required banner with repairLockReason when status is UNDER_INSPECTION and inspection is COMPLETED', async () => {
        const { element } = await render(
          card({
            status: 'UNDER_INSPECTION',
            inspection: { id: 'insp_c1', state: 'COMPLETED', completedAt: '2026-09-05T10:00:00.000Z', actualMinutes: 15, faultCount: 1 },
            findings: [
              {
                id: 'f1',
                description: 'Uncovered critical fault',
                severity: 'CRITICAL',
                code: null,
                recommendedService: null,
                inspectionId: 'insp_c1',
                decisionStatus: 'NOT_REQUESTED',
              },
            ],
            repairLocked: true,
            repairLockReason: 'Ask the customer to approve the work before starting it.',
            tasks: [{ id: 't1', title: 'Critical repair', status: 'ASSIGNED', blockedReason: null }],
          }),
        );

        const missionEl = element.querySelector('.mission');
        expect(missionEl).not.toBeNull();
        // Mission 1 indicates inspection itself is complete
        expect(missionEl?.textContent).toContain('Completed');

        // Contextual banner explains authorization required without changing lifecycle semantics
        const banner = missionEl?.querySelector('.mission-locked-banner');
        expect(banner).not.toBeNull();
        expect(banner?.textContent).toContain('Inspection complete — authorization required');
        expect(banner?.textContent).toContain('Inspection is complete, but the job cannot move to repair work yet.');
        expect(banner?.textContent).toContain('Ask the customer to approve the work before starting it.');

        // Findings remain visible
        expect(missionEl?.querySelector('.finding-item')).not.toBeNull();
        expect(missionEl?.textContent).toContain('Uncovered critical fault');

        // No inspection workspace controls return
        expect(missionEl?.querySelector('.tap--log-finding')).toBeNull();
        expect(missionEl?.querySelector('.mission-complete-inspection')).toBeNull();

        // Repair remains locked
        const startBtn = element.querySelector('.task button.tap--primary') as HTMLButtonElement | null;
        expect(startBtn?.disabled).toBe(true);
      });
    });
  });

  describe('Step 6 — Inspection Decoupled from Exception Handling', () => {
    it('does not render "Record inspection" in the "Something\'s wrong" tools section', async () => {
      const { element } = await render(card({ status: 'IN_PROGRESS' }));

      const toolsSection = Array.from(element.querySelectorAll('.tools')).find(
        (el) => el.querySelector('.tools-title')?.textContent?.includes("Something's wrong"),
      );
      expect(toolsSection).not.toBeUndefined();

      // "Record inspection" button must NOT exist in the tools section
      const buttons = Array.from(toolsSection!.querySelectorAll('button.tap'));
      const recordInspectionBtn = buttons.find((btn) => btn.textContent?.includes('Record inspection'));
      expect(recordInspectionBtn).toBeUndefined();

      // Inspection panel must not exist
      expect(toolsSection!.querySelector('.fault textarea[placeholder*="What did you check"]')).toBeNull();
    });

    it('keeps real exception and blocker tools visible and functional', async () => {
      const { fixture, element } = await render(card({ status: 'IN_PROGRESS' }));

      const toolsSection = Array.from(element.querySelectorAll('.tools')).find(
        (el) => el.querySelector('.tools-title')?.textContent?.includes("Something's wrong"),
      );
      expect(toolsSection).not.toBeUndefined();

      // Genuine tools remain present
      expect(toolsSection!.querySelector('a[href*="/parts"]')?.textContent).toContain('Need parts');
      const buttons = Array.from(toolsSection!.querySelectorAll('button.tap'));
      expect(buttons.some((btn) => btn.textContent?.includes('Part from outside'))).toBe(true);
      expect(buttons.some((btn) => btn.textContent?.includes("I'm blocked"))).toBe(true);
      expect(buttons.some((btn) => btn.textContent?.includes('Found a fault'))).toBe(true);

      // Clicking "I'm blocked" opens the genuine blocker reasons
      const blockedBtn = buttons.find((btn) => btn.textContent?.includes("I'm blocked")) as HTMLButtonElement | undefined;
      expect(blockedBtn).toBeDefined();
      blockedBtn!.click();
      fixture.detectChanges();

      const blockerPanel = toolsSection!.querySelector('.reasons');
      expect(blockerPanel).not.toBeNull();
      expect(blockerPanel?.textContent).toContain('Missing a tool');
      expect(blockerPanel?.textContent).toContain('Not safe to continue');
    });

    it('does not hide genuine task blockers when inspection is completed', async () => {
      const { element } = await render(
        card({
          status: 'IN_PROGRESS',
          inspection: { id: 'insp1', state: 'COMPLETED', completedAt: '2026-09-04T08:00:00.000Z', actualMinutes: 20, faultCount: 0 },
          tasks: [
            {
              id: 't1',
              title: 'Replace brake discs',
              status: 'IN_PROGRESS',
              blockedReason: 'Special caliper tool missing',
            },
          ],
        }),
      );

      // Blocked task alert banner is rendered
      const blockedSection = element.querySelector('.blocked');
      expect(blockedSection).not.toBeNull();
      expect(blockedSection?.textContent).toContain('Blocked');
      expect(blockedSection?.textContent).toContain('Special caliper tool missing');
      expect(blockedSection?.textContent).toContain('Your branch manager can see this.');

      // Mission 1 is distinct and completed
      const missionEl = element.querySelector('.mission');
      expect(missionEl?.textContent).toContain('Mission 1');
      expect(missionEl?.textContent).toContain('Completed');
    });

    it('ensures Mission 1 inspection states (REQUIRED, IN_PROGRESS, COMPLETED) function strictly within Mission 1', async () => {
      // 1. REQUIRED
      const { element: reqEl } = await render(
        card({
          status: 'REGISTERED',
          inspection: { id: null, state: 'REQUIRED', completedAt: null, actualMinutes: null, faultCount: 0 },
        }),
      );
      const missionReq = reqEl.querySelector('.mission');
      expect(missionReq?.textContent).toContain('Mission 1');
      expect(missionReq?.textContent).toContain('Not started');
      expect(missionReq?.querySelector('button')?.textContent).toContain('Start inspection');

      // Exception tools do not show inspection
      const toolsReq = Array.from(reqEl.querySelectorAll('.tools')).find(
        (el) => el.querySelector('.tools-title')?.textContent?.includes("Something's wrong"),
      );
      expect(toolsReq?.textContent).not.toContain('Record inspection');
    });
  });
});


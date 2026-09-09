/**
 * The technician's inspection stage.
 *
 * This lived at the end of `tech-work-card.spec.ts` and described a
 * "Mission 1 / Active Inspection Workspace" panel with `.mission`,
 * `.finding-item` and `.tap--log-finding`. That panel was replaced wholesale by
 * the studio checkpoints flow, so its 23 tests failed on selectors for markup
 * that no longer exists — and were read as stale for weeks while, elsewhere on
 * the same page, eight real capabilities had genuinely been deleted.
 *
 * That is why these are rewritten rather than deleted: the guarantees they
 * encoded still matter, so they are re-expressed against the stage that exists.
 * Split into its own file because the inspection stage and the repair stage are
 * two different screens behind one route, and one 1500-line spec covering both
 * is how the drift went unnoticed.
 *
 * What is deliberately NOT here: proof that anything is prevented. Enforcement
 * lives in the API and is pinned by `inspection-first.integration.spec.ts`,
 * because a disabled button is not a rule — anyone can open developer tools on
 * a workshop tablet.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { journeyFixture } from '../../domain/journey/journey.fixture';
import { TechWorkCard } from './tech-work-card';
import { TechnicianApi, type TechnicianHistoryBrief, type WorkCard } from './technician.api';

function card(overrides: Partial<WorkCard> = {}): WorkCard {
  return {
    workOrderId: 'wo1',
    identifier: 'DEMO-4471',
    customerName: 'Mona Adel',
    status: 'IN_PROGRESS',
    complaint: null,
    inspectionDeclined: false,
    timeTracking: 'OPTIONAL',
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

const emptyHistory: TechnicianHistoryBrief = {
  workOrderId: 'wo1',
  asset: { id: 'a1', category: 'CARS', identifier: 'DEMO-4471', plateNumber: 'DEMO-4471', vin: null },
  currentComplaint: null,
  currentInspectionDeclined: false,
  priorVisits: 0,
  visitsExamined: 0,
  hasPriorOwnerHistory: false,
  previousComplaints: [],
  previousFindings: [],
  previousRecommendations: [],
  unresolved: [],
  generatedAt: '2026-09-03T10:00:00.000Z',
};

async function render(result: WorkCard, apiOverrides: Record<string, unknown> = {}) {
  const api = {
    workCard: vi.fn(() => of(result)),
    startTask: vi.fn(() => of({})),
    completeTask: vi.fn(() => of({})),
    reportBlocker: vi.fn(() => of({})),
    recordInspection: vi.fn(() => of({})),
    createFault: vi.fn(() => of({ id: 'fault1' })),
    partsCatalog: vi.fn(() => of({ items: [], total: 0, categories: [] })),
    journey: vi.fn(() => of(journeyFixture())),
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
    vehicleHistory: vi.fn(() => of(emptyHistory)),
    getInspectionAggregate: vi.fn(() => of(null)),
    submitInspectionReport: vi.fn(() => of({ success: true, workOrderId: 'wo1', submittedAt: '2026-09-09T10:00:00.000Z' })),
    // Both are called on the way through the inspection stage. Absent from a
    // mock they throw synchronously inside a click handler, which is how the
    // last round of drift hid behind failures that pointed somewhere else.
    getSmartSuggestions: vi.fn(() => of({ recommended: [], related: [], diagnostic: [], suggestions: [] })),
    submitInspectionAggregate: vi.fn(() => of({ success: true, submittedAt: '2026-09-09T10:00:00.000Z' })),
  };

  Object.assign(api, apiOverrides);

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: TechnicianApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(TechWorkCard);
  fixture.componentRef.setInput('id', 'wo1');
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();

  return { fixture, api, element: fixture.nativeElement as HTMLElement };
}

/** The card switches on status: REGISTERED and UNDER_INSPECTION inspect. */
const inspecting = (overrides: Partial<WorkCard> = {}) =>
  card({
    status: 'UNDER_INSPECTION',
    inspection: { id: 'insp1', state: 'IN_PROGRESS', completedAt: null, actualMinutes: null, faultCount: 0 },
    ...overrides,
  });

const press = (element: HTMLElement, text: string): HTMLButtonElement | undefined =>
  [...element.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

describe('the technician card decides which stage it is on', () => {
  it('inspects a job that has not been authorised yet', async () => {
    const { element } = await render(inspecting({ status: 'REGISTERED' }));

    expect(element.querySelector('.studio-inspection-page')).not.toBeNull();
    // And does not show the repair workspace: the tasks, the finish checklist
    // and the blocker tools belong to a job that is authorised.
    expect(element.querySelector('.repair-stage-page')).toBeNull();
  });

  it('repairs a job once the work is approved', async () => {
    const { element } = await render(card({ status: 'APPROVED_FOR_WORK' }));

    expect(element.querySelector('.repair-stage-page')).not.toBeNull();
    expect(element.querySelector('.studio-inspection-page')).toBeNull();
  });

  it('keeps the repair side for a job waiting on the customer', async () => {
    // AWAITING_CUSTOMER_APPROVAL is past inspecting: the findings are in and
    // somebody else owes the next move.
    const { element } = await render(card({ status: 'AWAITING_CUSTOMER_APPROVAL' }));

    expect(element.querySelector('.repair-stage-page')).not.toBeNull();
  });
});

describe('what the inspection stage tells the technician about the car', () => {
  it('never invents a vehicle it was not told about', async () => {
    // These read `|| 'Toyota Corolla 2021'` and `|| '1NXBR32E7MZ123456'`, so a
    // car with nothing on file was described as a specific Corolla with a
    // specific VIN -- on the screen a technician uses to confirm they have the
    // right vehicle. The hero that carries both is on the findings sheet.
    const { fixture, element } = await render(inspecting());
    press(element, 'Continue to Findings')!.click();
    fixture.detectChanges();

    const hero = element.querySelector('.photo3-vehicle-card');
    expect(hero).not.toBeNull();
    expect(hero!.textContent).not.toContain('Toyota Corolla 2021');
    expect(hero!.textContent).not.toContain('1NXBR32E7MZ123456');
    expect(hero!.textContent).toContain('not recorded');
  });

  it('repeats the declined-inspection instruction, because it changes what to do', async () => {
    const { element } = await render(inspecting({ inspectionDeclined: true }));

    expect(element.querySelector('.card-note')?.textContent).toContain('Customer refused inspection');
  });

  it('says nothing about a declined inspection when there was none', async () => {
    const { element } = await render(inspecting({ inspectionDeclined: false }));

    expect(element.querySelector('.card-note')).toBeNull();
  });

  it('shows the customer’s own words when there are any', async () => {
    // The complaint is the one thing on this screen the customer wrote. It
    // lives in the expandable header the repair stage carries, so the header
    // has to be opened first.
    const { fixture, element } = await render(card({ status: 'IN_PROGRESS', complaint: 'Grinding noise when braking downhill' }));
    (element.querySelector('#btn-toggle-live-header') as HTMLButtonElement).click();
    fixture.detectChanges();

    const box = element.querySelector('.expanded-complaint-box');
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain('Grinding noise when braking downhill');
  });

  it('shows no complaint box at all when nothing was recorded', async () => {
    // Not an empty box with a heading: a labelled empty box reads as "the
    // customer said nothing", which is a different claim from "nobody asked".
    const { fixture, element } = await render(card({ status: 'IN_PROGRESS', complaint: '   ' }));
    (element.querySelector('#btn-toggle-live-header') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(element.querySelector('.expanded-complaint-box')).toBeNull();
  });
});

describe('recording findings', () => {
  it('opens on the walk-round, not on a form', async () => {
    const { element } = await render(inspecting());

    expect(element.querySelector('.studio-car-section')).not.toBeNull();
    expect(element.querySelector('.add-finding-inline-form')).toBeNull();
  });

  it('moves to the findings sheet when the technician says the walk-round is done', async () => {
    const { fixture, element } = await render(inspecting());

    press(element, 'Continue to Findings')!.click();
    fixture.detectChanges();

    expect(element.querySelector('.large-inspection-boxes-container')).not.toBeNull();
  });

  it('offers a way to record a finding the checklist did not anticipate', async () => {
    const { fixture, element } = await render(inspecting());
    press(element, 'Continue to Findings')!.click();
    fixture.detectChanges();

    const add = element.querySelector('.btn-add-finding-row') as HTMLButtonElement;
    expect(add).toBeTruthy();
    add.click();
    fixture.detectChanges();

    expect(element.querySelector('.add-finding-inline-form')).not.toBeNull();
  });

  it('can go back to the checkpoints without losing the stage', async () => {
    const { fixture, element } = await render(inspecting());
    press(element, 'Continue to Findings')!.click();
    fixture.detectChanges();

    press(element, 'Back to Checkpoints')!.click();
    fixture.detectChanges();

    expect(element.querySelector('.studio-car-section')).not.toBeNull();
  });

  it('sends the report to the operator rather than moving the job itself', async () => {
    // The technician submits; the operator reviews and dispatches. A technician
    // who could authorise their own findings would be both sides of the
    // decision the operator exists to make.
    const { fixture, element, api } = await render(inspecting());
    press(element, 'Continue to Findings')!.click();
    fixture.detectChanges();

    press(element, 'Send Report to Operator')!.click();
    fixture.detectChanges();

    expect(api.submitInspectionReport).toHaveBeenCalled();
    // And nothing on this page moved the work order.
    expect(api.startWork).not.toHaveBeenCalled();
  });

  it('shows the running estimate in the workshop’s own currency, not dollars', async () => {
    const { fixture, element } = await render(inspecting());
    press(element, 'Continue to Findings')!.click();
    fixture.detectChanges();

    const summary = element.querySelector('.quote-summary-badge');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).not.toContain('$');
  });
});

describe('after the report has gone to the operator', () => {
  async function submitted() {
    const rendered = await render(inspecting());
    press(rendered.element, 'Continue to Findings')!.click();
    rendered.fixture.detectChanges();
    press(rendered.element, 'Send Report to Operator')!.click();
    rendered.fixture.detectChanges();
    return rendered;
  }

  it('says who has it now', async () => {
    const { element } = await submitted();

    expect(element.querySelector('.awaiting-operator-card')).not.toBeNull();
    expect(element.textContent).toContain('Inspection Report Sent to Operator Desk');
  });

  it('offers no way to keep editing a report somebody else is reading', async () => {
    const { element } = await submitted();

    expect(element.querySelector('.add-finding-inline-form')).toBeNull();
    expect(element.querySelector('.btn-submit-report')).toBeNull();
  });

  it('offers a way back to the queue and a way to re-check the status', async () => {
    const { element } = await submitted();

    expect(element.querySelector('.btn-queue-return')).not.toBeNull();
    expect(press(element, 'Refresh Work Order Status')).toBeTruthy();
  });
});

describe('the repair side stays honest about what is holding the job', () => {
  it("says why repair work is locked, in the server's own words", async () => {
    const { element } = await render(
      card({
        status: 'IN_PROGRESS',
        repairLocked: true,
        repairLockReason: 'Start and record the inspection before any repair work.',
        tasks: [{ id: 't1', title: 'Replace pads', status: 'ASSIGNED', blockedReason: null }],
      }),
    );

    expect(element.querySelector('.tools-locked-why')?.textContent).toContain(
      'Start and record the inspection before any repair work.',
    );
    // And the Start control is inert while it is locked.
    expect((element.querySelector('.task-start-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('unlocks the work when the server says it is unlocked', async () => {
    const { element } = await render(
      card({
        status: 'IN_PROGRESS',
        repairLocked: false,
        repairLockReason: null,
        tasks: [{ id: 't1', title: 'Replace pads', status: 'ASSIGNED', blockedReason: null }],
      }),
    );

    expect(element.querySelector('.tools-locked')).toBeNull();
    expect((element.querySelector('.task-start-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the exception tools available while a job is in repair', async () => {
    // Inspection and exception handling are separate concerns: a job that
    // finished its inspection can still hit a real problem.
    const { element } = await render(card({ status: 'IN_PROGRESS' }));

    const labels = [...element.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
    expect(labels.some((l) => l.includes("I'm blocked"))).toBe(true);
    expect(labels.some((l) => l.includes('Found a fault'))).toBe(true);
  });

  it('does not put inspection controls on the repair side', async () => {
    // "Record inspection" belonged to the old exception panel and was a
    // category error: an inspection is the job's first mission, not something
    // that has gone wrong.
    const { element } = await render(card({ status: 'IN_PROGRESS' }));

    const labels = [...element.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('Record inspection'))).toBe(false);
  });
});

describe('a finished inspection is a record, not a form', () => {
  const done = (overrides: Partial<WorkCard> = {}) =>
    card({
      status: 'AWAITING_CUSTOMER_APPROVAL',
      inspection: { id: 'insp1', state: 'COMPLETED', completedAt: '2026-09-04T08:00:00.000Z', actualMinutes: 20, faultCount: 2 },
      inspectionReport: 'Front pads at 2mm, offside drop link worn.',
      ...overrides,
    });

  it('keeps the recorded findings readable after the inspection is completed', async () => {
    const { fixture, element } = await render(done());
    (element.querySelector('#btn-toggle-live-header') as HTMLButtonElement).click();
    fixture.detectChanges();

    const report = element.querySelector('.expanded-report-box');
    expect(report).not.toBeNull();
    expect(report!.textContent).toContain('Front pads at 2mm');
  });

  it('offers no way to log a new finding once the inspection is completed', async () => {
    const { element } = await render(done());

    expect(element.querySelector('.btn-add-finding-row')).toBeNull();
    expect(element.querySelector('.add-finding-inline-form')).toBeNull();
  });

  it('offers no way to log a finding on an inspection the customer declined', async () => {
    // A declined inspection is not an unfinished one. Leaving the controls up
    // invites a technician to record findings against a step that was refused.
    const { element } = await render(done({ inspectionDeclined: true, inspection: undefined }));

    expect(element.querySelector('.btn-add-finding-row')).toBeNull();
  });
});

/**
 * REC-051 and REC-052, which were one defect wearing two coats.
 *
 * The client declared the inspection aggregate's fields at the top level while
 * the server has always answered `{ inspection, aggregateVersion,
 * lifecycleState }`; typed `http.get<any>`, neither side checked the other, so
 * the card read `agg.recommendations`, found undefined and fell back to an
 * empty list. And nothing rendered that list anyway: the accept path, the
 * dismissal modal and its INV-5 reason were all on the component with no way in.
 */
describe('what the checks recommended', () => {
  const RECOMMENDATION = {
    id: 'rec1',
    ruleId: 'brake-wear',
    ruleVersion: 1,
    engineVersion: 'v2',
    targetResultId: 'tr1',
    serviceKey: 'brake-pads-front',
    serviceDisplayName: 'Front brake pads',
    recommendationLevel: 'RECOMMENDED' as const,
    score: 90,
    generatedAt: '2026-09-09T09:00:00.000Z',
    evaluationContext: { findingKeys: ['pad-thin'], severities: ['CRITICAL'], position: 'FRONT' },
  };

  /** The envelope the server actually sends. */
  const aggregate = (overrides: Record<string, unknown> = {}) => ({
    inspection: {
      schemaVersion: 2,
      aggregateVersion: 4,
      catalogVersion: 1,
      templateCode: 'CARS_FULL',
      state: 'IN_PROGRESS',
      targets: {},
      recommendations: [RECOMMENDATION],
      decisions: [],
      ...overrides,
    },
    aggregateVersion: 4,
    lifecycleState: 'IN_PROGRESS',
  });

  /**
   * The card loads the aggregate as part of its own load, so the mock has to
   * answer before the component is created -- `render` builds it and calls
   * `load()` in one step.
   */
  async function onFindings(aggregateResponse: unknown) {
    const rendered = await render(inspecting(), { getInspectionAggregate: () => of(aggregateResponse) });
    press(rendered.element, 'Continue to Findings')!.click();
    rendered.fixture.detectChanges();
    return rendered;
  }

  it('reads the recommendations out of the envelope the server sends', async () => {
    const { element } = await onFindings(aggregate());

    const panel = element.querySelector('.rec-panel');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('Front brake pads');
  });

  it('offers both answers, because a suggestion is not a decision', async () => {
    const { element } = await onFindings(aggregate());

    const labels = [...element.querySelectorAll('.rec-actions button')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Add to the job', 'Not needed']);
  });

  it('keeps a dismissal and its reason on screen rather than dropping the row', async () => {
    // INV-5: a dismissal has to carry why. Hiding the row would hide the
    // reason with it, and the reason is the record.
    const { element } = await onFindings(
      aggregate({
        decisions: [
          { recommendationId: 'rec1', decision: 'DISMISSED', dismissalReason: 'Customer declined for now' },
        ],
      }),
    );

    expect(element.querySelector('.rec-decided')?.textContent).toContain('Customer declined for now');
    expect(element.querySelector('.rec-actions')).toBeNull();
  });

  it('says nothing at all when the checks suggested nothing', async () => {
    const { element } = await onFindings(aggregate({ recommendations: [] }));

    expect(element.querySelector('.rec-panel')).toBeNull();
  });

  it('shows nothing rather than failing when the job has no aggregate yet', async () => {
    const { element } = await onFindings({ inspection: null });

    expect(element.querySelector('.rec-panel')).toBeNull();
  });
});

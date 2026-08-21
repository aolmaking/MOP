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
    tasks: [],
    parts: [],
    finish: { available: false, passed: false, conditions: [] },
    ...overrides,
  };
}

async function render(result: WorkCard | { error: unknown }) {
  const api = {
    workCard: vi.fn(() => ('error' in result ? throwError(() => result.error) : of(result))),
    startTask: vi.fn(() => of({})),
    completeTask: vi.fn(() => of({})),
    reportBlocker: vi.fn(() => of({})),
    createFault: vi.fn(() => of({})),
    partsCatalog: vi.fn(() => of({ items: [], total: 0, categories: [] })),
    journey: vi.fn(() => of({ stages: [], finished: false, waiting: false, blocked: false, headline: 'This job is yours to move.', happened: null, next: null, waitingOn: null, history: [] })),
    requestPart: vi.fn(() => of({})),
    receivePart: vi.fn(() => of({})),
    usePart: vi.fn(() => of({})),
    finishWorkOrder: vi.fn(() => of({})),
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
});

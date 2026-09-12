import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TechNow } from './tech-now';
import { TechnicianApi, type TechnicianJob } from './technician.api';

/**
 * The technician's queue.
 *
 * Rewritten against the rebuilt page, not weakened: the queue was
 * reorganised around what the technician *does* with a job -- the car in
 * their hands lifted out as a single card, everything else under "Start
 * these" or "Waiting on someone else" -- so the selectors moved wholesale.
 * Every guarantee the old tests held is re-expressed below against the
 * markup that exists.
 *
 * Two are deliberately gone, and both because the capability was removed
 * on the workshop owner's instruction to simplify this page as far as it
 * will go:
 *
 *  - "filters to one kind of job without losing the others from the count"
 *  - "says the filter is empty rather than that the queue is"
 *
 * The five filter pills (All / Ready / Inspection / In Progress / Blocked)
 * no longer exist. Filtering made reading the price of admission to the
 * page and hid whichever jobs the pill did not select; the grouping shows
 * every job at once. These tests are not deleted for being inconvenient --
 * they describe a control the page no longer has.
 */
function makeJob(overrides: Partial<TechnicianJob> = {}): TechnicianJob {
  return {
    workOrderId: 'wo-101',
    identifier: 'ABC-1234',
    customerName: 'Kareem Tarek',
    status: 'IN_PROGRESS',
    complaint: 'Squeaking noise when braking from high speed',
    inspectionDeclined: false,
    myTaskCount: 3,
    myOpenTaskCount: 2,
    active: true,
    blocked: false,
    sinceHours: 1.5,
    ...overrides,
  };
}

async function renderTechNow(apiResult: { jobs: TechnicianJob[] } | { error: { httpStatus: number } }) {
  const api = {
    myWork: vi.fn(() => ('error' in apiResult ? throwError(() => apiResult.error) : of(apiResult))),
  };

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: TechnicianApi, useValue: api }],
  });

  const fixture = TestBed.createComponent(TechNow);
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockReturnValue(Promise.resolve(true));

  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();

  return { fixture, api, router, element: fixture.nativeElement as HTMLElement };
}

const text = (element: HTMLElement, selector: string) =>
  element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('TechNow', () => {
  it('reads the technician’s own queue, never a job id from the page', async () => {
    const { api } = await renderTechNow({ jobs: [makeJob()] });

    // Whose work this is, is a server-side fact. A page that passed an id
    // would let any technician ask for anyone's queue.
    expect(api.myWork).toHaveBeenCalledWith();
  });

  it('shows each job by the things a technician identifies a car by', async () => {
    const { element } = await renderTechNow({
      jobs: [
        makeJob({ workOrderId: 'bay', active: true }),
        makeJob({
          workOrderId: 'next',
          active: false,
          status: 'APPROVED_FOR_WORK',
          identifier: 'XYZ-9911',
          complaint: 'Vibration in steering wheel',
          myOpenTaskCount: 2,
        }),
      ],
    });

    const row = element.querySelector('.row') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('XYZ-9911');
    expect(row.textContent).toContain('Vibration in steering wheel');
    // How much is left, as a digit rather than the sentence "2 tasks
    // remaining" -- a quantity to see, not a phrase to read.
    expect(text(element, '.row-left')).toContain('2');
  });

  it('draws the marque of the car, and invents one for nothing', async () => {
    const { element } = await renderTechNow({
      jobs: [
        makeJob({ workOrderId: 'known', active: false, status: 'REGISTERED', make: 'bmw', category: 'CARS' }),
        makeJob({ workOrderId: 'unknown', active: false, status: 'REGISTERED', make: null, category: 'CARS' }),
      ],
    });

    const marks = element.querySelectorAll('.row mop-vehicle-mark');
    expect(marks).toHaveLength(2);
    // The marque's own badge, drawn, for the car whose make the front desk
    // recorded -- that is what a technician recognises from across a bay.
    expect(marks[0].querySelector('.mark-art svg')).not.toBeNull();
    // ...and no badge at all for the one nobody recorded. A guessed marque
    // on the screen someone uses to confirm they have the right car is
    // worse than an empty space.
    expect(marks[1].querySelector('.mark-art')).toBeNull();
    expect(marks[1].querySelector('.mark-word')).toBeNull();
  });

  it('marks the car that is actually in the bay, and shows it only once', async () => {
    const { element } = await renderTechNow({
      jobs: [
        makeJob({ workOrderId: 'bay', active: true }),
        makeJob({ workOrderId: 'waiting', active: false, status: 'REGISTERED' }),
      ],
    });

    // The job in their hands is lifted out of the list entirely: it is the
    // answer to "which car do I touch" most of the time.
    const now = element.querySelector('.now') as HTMLAnchorElement;
    expect(now).not.toBeNull();
    expect(now.getAttribute('href')).toBe('/tech/card/bay');
    expect(text(element, '.now-label')).toContain('Working now');

    // And it is not also in the list below, which would read as two cars.
    const rowLinks = [...element.querySelectorAll('.row')].map((row) => row.getAttribute('href'));
    expect(rowLinks).toEqual(['/tech/card/waiting']);
  });

  it('says a job is blocked rather than leaving it looking like any other', async () => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ active: false, blocked: true, status: 'IN_PROGRESS' })],
    });

    expect(element.querySelector('.row--stop')).not.toBeNull();
    // The word as well as the border: colour alone excludes a colour-blind
    // technician and dies in daylight.
    expect(text(element, '.row-state')).toContain('Stopped');
    // And it is grouped under what the technician can do about it, which is
    // nothing until somebody else moves.
    expect(text(element, '.group-head')).toContain('Waiting on someone else');
  });

  it('names the state in words, not as a status code', async () => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ status: 'UNDER_INSPECTION', active: false })],
    });

    // An inspection they have open is the car in their hands, so it is the
    // card at the top rather than a row.
    const label = text(element, '.now-label');
    expect(label).not.toContain('UNDER_INSPECTION');
    expect(label).toContain('Checking now');
  });

  it('groups a job by what the technician does with it, not by its status name', async () => {
    const { element } = await renderTechNow({
      jobs: [
        makeJob({ workOrderId: 'start', active: false, status: 'APPROVED_FOR_WORK' }),
        makeJob({ workOrderId: 'parts', active: false, status: 'WAITING_PARTS' }),
      ],
    });

    const headings = [...element.querySelectorAll('.group-head')].map((h) =>
      h.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(headings[0]).toContain('Start these');
    expect(headings[1]).toContain('Waiting on someone else');

    const groups = element.querySelectorAll('.group');
    expect(groups[0].querySelector('.row')?.getAttribute('href')).toBe('/tech/card/start');
    expect(groups[1].querySelector('.row')?.getAttribute('href')).toBe('/tech/card/parts');
  });

  /**
   * The grouping has to MOVE, or it is decoration.
   *
   * A car whose inspection has just gone to the customer sits in
   * `WAITING_CUSTOMER`, and that status was missing from the old waiting
   * list -- so it stayed under "Start these" with nothing startable about
   * it, which is exactly what made the three groups look broken. The
   * cases below are the journey a technician actually watches: send the
   * inspection and the car drops to the bottom; the desk approves it and
   * it comes back to the middle.
   */
  it.each([
    ['WAITING_CUSTOMER', 'the inspection has gone to the customer'],
    ['AWAITING_CUSTOMER_APPROVAL', 'the customer owes an answer'],
    ['READY_FOR_QC', 'QC has it'],
    ['READY_FOR_TEAM_REVIEW', 'the team leader has it'],
    ['WAITING_PARTS', 'the store owes a part'],
  ])('puts %s under "Waiting on someone else" (%s)', async (status) => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ workOrderId: 'wo1', active: false, status })],
    });

    expect(text(element, '.group-head')).toContain('Waiting on someone else');
    expect(text(element, '.group-head')).not.toContain('Start these');
  });

  it.each([
    ['APPROVED_FOR_WORK', 'the front desk approved it'],
    ['IN_PROGRESS', 'it is already under way'],
    ['QC_FAILED', 'rework belongs to the bay'],
  ])('puts %s under "Start these" (%s)', async (status) => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ workOrderId: 'wo1', active: false, status })],
    });

    expect(text(element, '.group-head')).toContain('Start these');
    expect(text(element, '.group-head')).not.toContain('Waiting on someone else');
  });

  /**
   * A status this file has never heard of must read as somebody else's,
   * not as startable. Sending a technician to a car they cannot touch is
   * the more expensive of the two mistakes.
   */
  it('treats an unknown status as waiting rather than as startable', async () => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ workOrderId: 'wo1', active: false, status: 'SOME_FUTURE_STATUS' })],
    });

    expect(text(element, '.group-head')).toContain('Waiting on someone else');
  });

  /**
   * Migrated from the deleted "My work" page, which held this guarantee
   * on its own: every assigned job is present, including the ones nobody
   * can move today. A queue that quietly drops the waiting jobs tells a
   * technician their workload is smaller than it is.
   */
  it('never hides a job, including the ones waiting on someone else', async () => {
    const { element } = await renderTechNow({
      jobs: [
        makeJob({ workOrderId: 'bay', active: true }),
        makeJob({ workOrderId: 'ready', active: false, status: 'APPROVED_FOR_WORK' }),
        makeJob({ workOrderId: 'parts', active: false, status: 'WAITING_PARTS' }),
        makeJob({ workOrderId: 'customer', active: false, status: 'AWAITING_CUSTOMER_APPROVAL' }),
        makeJob({ workOrderId: 'stopped', active: false, blocked: true }),
      ],
    });

    const shown = [
      element.querySelector('.now')?.getAttribute('href'),
      ...[...element.querySelectorAll('.row')].map((row) => row.getAttribute('href')),
    ];
    expect(shown).toHaveLength(5);
    expect(shown).toContain('/tech/card/parts');
    expect(shown).toContain('/tech/card/customer');
    expect(shown).toContain('/tech/card/stopped');
  });

  it('says how long the car has been standing', async () => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ active: false, status: 'APPROVED_FOR_WORK', sinceHours: 50 })],
    });

    // The difference between the job that arrived an hour ago and the one
    // that has been in the corner since Tuesday.
    expect(text(element, '.row-since')).toContain('2 days');
  });

  it('does not head an empty group', async () => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ workOrderId: 'start', active: false, status: 'APPROVED_FOR_WORK' })],
    });

    // A heading over nothing is one more thing to read past.
    expect(element.querySelectorAll('.group')).toHaveLength(1);
  });

  it('opens the work card for the row that was pressed', async () => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ workOrderId: 'wo-404', active: false, status: 'REGISTERED' })],
    });

    const link = element.querySelector('.row') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/tech/card/wo-404');
  });

  it('renders an empty queue without pretending there is work', async () => {
    const { element } = await renderTechNow({ jobs: [] });

    expect(element.querySelector('.row')).toBeNull();
    expect(element.querySelector('.now')).toBeNull();
    expect(text(element, '.state-title')).toContain('No vehicles');
  });

  it('renders forbidden state when the user has no technician access', async () => {
    const { element } = await renderTechNow({ error: { httpStatus: 403 } });

    expect(text(element, '.state-title')).toContain("You don't have technician access");
  });

  it('offers a retry rather than a dead end when the read fails', async () => {
    const { element } = await renderTechNow({ error: { httpStatus: 500 } });

    expect(text(element, '.state-title')).toContain("Couldn't load your vehicles");
    expect(element.querySelector('.state button')).not.toBeNull();
  });
});

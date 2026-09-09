import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TechNow } from './tech-now';
import { TechnicianApi, type TechnicianJob } from './technician.api';

/**
 * The technician's queue.
 *
 * This file used to describe a different page: a single "Now" hero panel for
 * one server-chosen active job, read from an `active()` endpoint. Both are
 * gone -- the page reads `myWork()` and shows the whole assigned queue with
 * the in-bay job marked -- and the spec was never rewritten, so every test in
 * it failed on `this.api.myWork is not a function` and then on selectors for
 * markup that no longer exists. The capability did not disappear with the
 * design: "what am I on right now" is the `queue-item--active` row and the
 * "in bay" count. These describe that.
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
      jobs: [makeJob({ complaint: 'Vibration in steering wheel' })],
    });

    const item = element.querySelector('.queue-item') as HTMLElement;
    expect(item).not.toBeNull();
    expect(item.textContent).toContain('ABC-1234');
    expect(item.textContent).toContain('Kareem Tarek');
    expect(item.textContent).toContain('Vibration in steering wheel');
    expect(item.textContent).toContain('2 tasks remaining');
  });

  it('marks the car that is actually in the bay', async () => {
    const { element } = await renderTechNow({
      jobs: [makeJob({ workOrderId: 'bay', active: true }), makeJob({ workOrderId: 'waiting', active: false, status: 'REGISTERED' })],
    });

    const rows = [...element.querySelectorAll('.queue-item')];
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('queue-item--active')).toBe(true);
    expect(rows[1].classList.contains('queue-item--active')).toBe(false);
    expect(text(element, '.badge-chip--active')).toContain('1 in bay');
  });

  it('says a job is blocked rather than leaving it looking like any other', async () => {
    const { element } = await renderTechNow({ jobs: [makeJob({ blocked: true })] });

    expect(element.querySelector('.queue-item--blocked')).not.toBeNull();
    expect(text(element, '.badge-chip--danger')).toContain('1 blocked');
    expect(text(element, '.state-badge')).toContain('Blocked');
  });

  it('names the state in words, not as a status code', async () => {
    const { element } = await renderTechNow({ jobs: [makeJob({ status: 'UNDER_INSPECTION', active: false })] });

    const badge = text(element, '.state-badge');
    expect(badge).not.toContain('UNDER_INSPECTION');
    expect(badge.length).toBeGreaterThan(0);
    expect(text(element, '.badge-chip--inspection')).toContain('1 inspection');
  });

  it('opens the work card for the row that was pressed', async () => {
    const { element } = await renderTechNow({ jobs: [makeJob({ workOrderId: 'wo-404' })] });

    const link = element.querySelector('.queue-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/tech/card/wo-404');
  });

  it('filters to one kind of job without losing the others from the count', async () => {
    const { element, fixture } = await renderTechNow({
      jobs: [makeJob({ workOrderId: 'a', blocked: true }), makeJob({ workOrderId: 'b', blocked: false })],
    });

    const blockedPill = [...element.querySelectorAll('.filter-pill')].find(
      (pill) => pill.textContent?.trim() === 'Blocked',
    ) as HTMLButtonElement;
    blockedPill.click();
    fixture.detectChanges();

    expect(element.querySelectorAll('.queue-item')).toHaveLength(1);
    // The heading still counts the whole queue: filtering is a view, not a
    // claim about how much work the technician has.
    expect(text(element, '.queue-title')).toContain('(2)');
  });

  it('says the filter is empty rather than that the queue is', async () => {
    const { element, fixture } = await renderTechNow({ jobs: [makeJob({ blocked: false })] });

    const blockedPill = [...element.querySelectorAll('.filter-pill')].find(
      (pill) => pill.textContent?.trim() === 'Blocked',
    ) as HTMLButtonElement;
    blockedPill.click();
    fixture.detectChanges();

    expect(text(element, '.queue-empty')).toContain('No vehicles match the selected filter');
  });

  it('renders an empty queue without pretending there is work', async () => {
    const { element } = await renderTechNow({ jobs: [] });

    expect(element.querySelector('.queue-item')).toBeNull();
    expect(text(element, '.queue-title')).toContain('(0)');
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

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TechNow } from './tech-now';
import { TechnicianApi, type TechnicianJob } from './technician.api';

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

async function renderTechNow(apiResult: { job: TechnicianJob | null } | { error: { httpStatus: number } }) {
  const api = {
    active: vi.fn(() => ('error' in apiResult ? throwError(() => apiResult.error) : of(apiResult))),
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

describe('TechNow Component (Step 7)', () => {
  it('surfaces active in-progress job with correct operational posture and complaint', async () => {
    const job = makeJob({
      active: true,
      status: 'IN_PROGRESS',
      complaint: 'Vibration in steering wheel',
    });

    const { element } = await renderTechNow({ job });

    expect(element.querySelector('.now')).not.toBeNull();
    expect(element.querySelector('.now-label')?.textContent).toContain('In progress · Current hands-on job');
    expect(element.querySelector('.now-plate')?.textContent).toContain('ABC-1234');
    expect(element.querySelector('.now-customer')?.textContent).toContain('Kareem Tarek');
    expect(element.querySelector('.now-complaint')?.textContent).toContain('Vibration in steering wheel');
    expect(element.querySelector('.now-facts')?.textContent).toContain('2 of 3 tasks left');
  });

  it('surfaces vehicle inspection actionability when job is UNDER_INSPECTION', async () => {
    const job = makeJob({
      active: false,
      status: 'UNDER_INSPECTION',
      complaint: 'Check engine light on',
    });

    const { element } = await renderTechNow({ job });

    expect(element.querySelector('.now-label')?.textContent).toContain('Action required · Vehicle inspection');
    expect(element.querySelector('.now-status-banner')?.textContent).toContain('Vehicle is under inspection');
  });

  it('surfaces urgent blocker posture when a problem was reported', async () => {
    const job = makeJob({
      active: true,
      blocked: true,
      status: 'IN_PROGRESS',
    });

    const { element } = await renderTechNow({ job });

    expect(element.querySelector('.now-label')?.textContent).toContain('Attention required · Blocker reported');
    expect(element.querySelector('.now-status-banner--danger')?.textContent).toContain('Blocked — a problem was reported on this job');
  });

  it('surfaces next up posture when job is REGISTERED and awaiting beginning', async () => {
    const job = makeJob({
      active: false,
      blocked: false,
      status: 'REGISTERED',
    });

    const { element } = await renderTechNow({ job });

    expect(element.querySelector('.now-label')?.textContent).toContain('Next up · Ready to begin');
  });

  it('navigates to work card when clicking on the active card', async () => {
    const job = makeJob({ workOrderId: 'wo-404' });
    const { element, router } = await renderTechNow({ job });

    const cardBtn = element.querySelector('.now') as HTMLButtonElement;
    cardBtn.click();

    expect(router.navigate).toHaveBeenCalledWith(['/tech/card', 'wo-404']);
  });

  it('renders meaningful empty state when no job is currently active', async () => {
    const { element } = await renderTechNow({ job: null });

    expect(element.querySelector('.now')).toBeNull();
    const stateEl = element.querySelector('.state');
    expect(stateEl?.textContent).toContain('No active work in progress');
    expect(stateEl?.textContent).toContain('Pick an assigned job from My Work to begin');
    expect(element.querySelector('a[routerLink="/tech/work"]')?.textContent).toContain('My work');
  });

  it('renders forbidden state when user has no technician access', async () => {
    const { element } = await renderTechNow({ error: { httpStatus: 403 } });

    expect(element.querySelector('.state-title')?.textContent).toContain("You don't have technician access");
  });
});

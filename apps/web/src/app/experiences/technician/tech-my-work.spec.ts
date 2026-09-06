import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TechMyWork } from './tech-my-work';
import { TechnicianApi, type TechnicianJob } from './technician.api';

function makeJob(overrides: Partial<TechnicianJob> = {}): TechnicianJob {
  return {
    workOrderId: 'wo-101',
    identifier: 'ABC-1234',
    customerName: 'Kareem Tarek',
    status: 'IN_PROGRESS',
    complaint: 'Squeaking noise when braking',
    inspectionDeclined: false,
    myTaskCount: 3,
    myOpenTaskCount: 2,
    active: false,
    blocked: false,
    sinceHours: 1.5,
    ...overrides,
  };
}

async function renderTechMyWork(apiResult: { jobs: readonly TechnicianJob[] } | { error: { httpStatus: number } }) {
  const api = {
    myWork: vi.fn(() => ('error' in apiResult ? throwError(() => apiResult.error) : of(apiResult))),
  };

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: TechnicianApi, useValue: api }],
  });

  const fixture = TestBed.createComponent(TechMyWork);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();

  return { fixture, api, element: fixture.nativeElement as HTMLElement };
}

describe('TechMyWork Component (Step 7)', () => {
  it('renders all assigned jobs, ownership subtitle, and workload summary count', async () => {
    const jobs: readonly TechnicianJob[] = [
      makeJob({ workOrderId: 'wo-1', identifier: 'CAR-1', active: true, status: 'IN_PROGRESS' }),
      makeJob({ workOrderId: 'wo-2', identifier: 'CAR-2', active: false, status: 'REGISTERED', complaint: 'Oil change needed' }),
      makeJob({ workOrderId: 'wo-3', identifier: 'CAR-3', active: false, status: 'UNDER_INSPECTION', blocked: true }),
    ];

    const { element } = await renderTechMyWork({ jobs });

    expect(element.querySelector('.page-title')?.textContent).toContain('My work');
    expect(element.querySelector('.page-subtitle')?.textContent).toContain('All vehicles and tasks assigned to you today');

    // Workload summary
    const summary = element.querySelector('.work-summary');
    expect(summary?.textContent).toContain('3 assigned vehicles');
    expect(summary?.textContent).toContain('1 on now');
    expect(summary?.textContent).toContain('1 blocked');

    // List of jobs
    const rows = element.querySelectorAll('.job:not(.job--skeleton)');
    expect(rows.length).toBe(3);

    // Active item has "On now" tag and active class
    expect(rows[0].classList.contains('job--active')).toBe(true);
    expect(rows[0].querySelector('.job-tag--active')?.textContent).toContain('On now');

    // Blocked item has "Blocked" tag and blocked class
    expect(rows[2].classList.contains('job--blocked')).toBe(true);
    expect(rows[2].querySelector('.job-tag--blocked')?.textContent).toContain('Blocked');
  });

  it('preserves assigned jobs that are not immediately urgent so workload is never hidden', async () => {
    const jobs: readonly TechnicianJob[] = [
      makeJob({ workOrderId: 'wo-queued-1', identifier: 'QUEUED-1', active: false, status: 'WAITING_PARTS' }),
      makeJob({ workOrderId: 'wo-queued-2', identifier: 'QUEUED-2', active: false, status: 'AWAITING_CUSTOMER_APPROVAL' }),
    ];

    const { element } = await renderTechMyWork({ jobs });

    const rows = element.querySelectorAll('.job:not(.job--skeleton)');
    expect(rows.length).toBe(2);
    expect(element.textContent).toContain('QUEUED-1');
    expect(element.textContent).toContain('QUEUED-2');
    expect(element.textContent).toContain('Waiting on parts');
    expect(element.textContent).toContain('Waiting on approval');
  });

  it('renders meaningful empty state when no jobs are assigned', async () => {
    const { element } = await renderTechMyWork({ jobs: [] });

    expect(element.querySelector('.job')).toBeNull();
    const stateEl = element.querySelector('.state');
    expect(stateEl?.textContent).toContain('Nothing assigned to you');
    expect(stateEl?.textContent).toContain('Your branch manager assigns jobs');
  });

  it('demonstrates distinct operational orientation from Tech Now (Tech Now ≠ My Work)', async () => {
    // In Tech Now, only the 1 active job is surfaced.
    // In My Work, all 4 assigned jobs are present so the technician sees their full workload.
    const activeCar = makeJob({ workOrderId: 'wo-active', identifier: 'ACTIVE-1', active: true });
    const assignedCars: readonly TechnicianJob[] = [
      activeCar,
      makeJob({ workOrderId: 'wo-next-1', identifier: 'NEXT-1', active: false, status: 'REGISTERED' }),
      makeJob({ workOrderId: 'wo-next-2', identifier: 'NEXT-2', active: false, status: 'UNDER_INSPECTION' }),
      makeJob({ workOrderId: 'wo-next-3', identifier: 'NEXT-3', active: false, status: 'WAITING_PARTS' }),
    ];

    const { element } = await renderTechMyWork({ jobs: assignedCars });

    const rows = element.querySelectorAll('.job:not(.job--skeleton)');
    expect(rows.length).toBe(4);
    // Overlap: the active car is in My Work with "On now", but My Work does NOT collapse into just the active car.
    expect(element.textContent).toContain('ACTIVE-1');
    expect(element.textContent).toContain('NEXT-1');
    expect(element.textContent).toContain('NEXT-2');
    expect(element.textContent).toContain('NEXT-3');
  });
});

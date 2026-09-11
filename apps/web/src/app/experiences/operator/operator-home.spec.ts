/**
 * The front desk.
 *
 * These pin the three things the workshop owner asked this screen to
 * guarantee, because all three are the kind that a restyle silently breaks:
 *
 *  - the two controls the operator lives in -- the counter POS and
 *    registering a new customer -- are on the page and reachable;
 *  - the records are a table with a search box over it, and that box finds a
 *    record by a customer's name, a plate, or a number;
 *  - one search box serves both lists, so the operator never has to know
 *    which of the two currently holds the answer.
 *
 * What is deliberately NOT here: proof that an unticked finding is not
 * dispatched. That is enforced by the server and pinned by
 * `operator-approval-inventory.spec.ts`, because a checkbox on a page is not
 * a rule -- anyone can open developer tools at the counter.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { OperatorHome } from './operator-home';
import {
  OperatorApi,
  type OperatorInspectionReportItem,
  type OperatorVehicle,
} from './operator.api';
import { AccessApi } from '../../identity/access.api';
import { AuthStore } from '../../identity/auth.store';
import { WorkshopBrandingService } from '../../ui/workshop-branding.service';

function vehicle(overrides: Partial<OperatorVehicle> = {}): OperatorVehicle {
  return {
    id: 'a1',
    plateNumber: 'MOP 4471',
    vinOrChassisNumber: 'VIN0001',
    category: 'CARS',
    make: 'toyota',
    model: 'Corolla',
    modelYear: 2021,
    ownedSince: '2026-01-01T00:00:00.000Z',
    ownerName: 'Mona Adel',
    ownerPhone: '01012345678',
    ownerCustomerId: 'c1',
    activeWorkOrder: null,
    ...overrides,
  };
}

function report(overrides: Partial<OperatorInspectionReportItem> = {}): OperatorInspectionReportItem {
  return {
    workOrderId: 'wo1',
    vehicle: { id: 'a1', plateNumber: 'MOP 4471', model: 'Corolla', vin: 'VIN0001' },
    customer: { id: 'c1', name: 'Mona Adel', phone: '01012345678' },
    submittedAt: '2026-09-10T08:00:00.000Z',
    status: 'INSPECTION_COMPLETE',
    findingsCount: 3,
    partsCount: 2,
    servicesCount: 1,
    totalEstimate: 225,
    ...overrides,
  };
}

interface Internals {
  onSearchInput(value: string): void;
  runSearch(): void;
  switchTab(tab: 'reception' | 'inspection-reports'): void;
  visibleReports(): readonly OperatorInspectionReportItem[];
}

async function render(options: {
  vehicles?: OperatorVehicle[];
  reports?: OperatorInspectionReportItem[];
  searchResults?: OperatorVehicle[];
} = {}) {
  const api = {
    overview: vi.fn(() =>
      of({
        metrics: { totalVehicles: 1, inServiceCount: 0, intakeQueueCount: 0 },
        branches: [],
        vehicles: options.vehicles ?? [vehicle()],
      }),
    ),
    search: vi.fn((_q: string) => of(options.searchResults ?? [])),
    getInspectionReports: vi.fn(() => of(options.reports ?? [])),
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: OperatorApi, useValue: api },
      { provide: AccessApi, useValue: { can: vi.fn(() => of(true)) } },
      {
        provide: AuthStore,
        useValue: { session: signal({ displayName: 'Rasha' }), logout: vi.fn() },
      },
      {
        provide: WorkshopBrandingService,
        useValue: { activeWorkshop: signal({ name: 'Cairo Motors', currency: 'EGP' }) },
      },
    ],
  });

  const fixture = TestBed.createComponent(OperatorHome);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();

  return {
    fixture,
    api,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance as never as Internals,
  };
}

describe('OperatorHome', () => {
  it('puts the counter POS and registering a customer at opposite ends of one action row', async () => {
    const { element } = await render();

    const row = element.querySelector('.op-actions');
    const pos = element.querySelector('#btn-operator-pos');
    const register = element.querySelector('#btn-operator-register-customer');

    expect(pos).not.toBeNull();
    expect(register).not.toBeNull();
    // Both in the same row, with the spacer between them: the owner asked for
    // them to be the biggest things on the page and as far apart as it allows.
    expect(row?.contains(pos!)).toBe(true);
    expect(row?.contains(register!)).toBe(true);
    expect(row?.querySelector('.op-big-gap')).not.toBeNull();
    expect(pos?.getAttribute('href')).toBe('/operator/pos');
  });

  it('lists vehicles as table rows, not cards', async () => {
    const { element } = await render({ vehicles: [vehicle(), vehicle({ id: 'a2', plateNumber: 'MOP 9902' })] });

    const rows = element.querySelectorAll('#table-vehicles tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.op-plate')?.textContent?.trim()).toBe('MOP 4471');
  });

  it('shows a vehicle whose report is waiting differently from one being worked on', async () => {
    const { element } = await render({
      vehicles: [
        vehicle({ id: 'a1', activeWorkOrder: { id: 'wo1', status: 'INSPECTION_COMPLETE', createdAt: '', hasInspectionReport: true } }),
        vehicle({ id: 'a2', plateNumber: 'MOP 9902', activeWorkOrder: { id: 'wo2', status: 'IN_PROGRESS', createdAt: '', hasInspectionReport: false } }),
      ],
    });

    // A word as well as a colour, so the state survives a reader who does not
    // read English and a screen washed out by daylight.
    const flags = Array.from(element.querySelectorAll('#table-vehicles .op-flag')).map((f) =>
      f.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(flags[0]).toContain('Needs you');
    expect(flags[1]).toContain('In workshop');
  });

  it('asks the server for a vehicle the loaded list does not hold, once, after the typing stops', async () => {
    vi.useFakeTimers();
    try {
      const { api, page } = await render({ searchResults: [vehicle({ plateNumber: 'MOP 0001' })] });
      api.search.mockClear();

      // The list on screen is only the hundred most recent vehicles, so a
      // plate typed at the counter has to reach the server.
      page.onSearchInput('MOP');
      page.onSearchInput('MOP 0');
      page.onSearchInput('MOP 0001');
      expect(api.search).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(api.search).toHaveBeenCalledTimes(1);
      expect(api.search).toHaveBeenCalledWith('MOP 0001');
    } finally {
      vi.useRealTimers();
    }
  });

  it('finds a waiting report by customer name, by plate and by phone number', async () => {
    const { page } = await render({
      reports: [
        report({ workOrderId: 'wo1', customer: { id: 'c1', name: 'Mona Adel', phone: '01012345678' } }),
        report({
          workOrderId: 'wo2',
          vehicle: { id: 'a2', plateNumber: 'MOP 9902', model: 'Hilux', vin: 'VIN0002' },
          customer: { id: 'c2', name: 'Karim Fouad', phone: '01199887766' },
        }),
      ],
    });

    page.switchTab('inspection-reports');

    page.onSearchInput('karim');
    expect(page.visibleReports().map((r) => r.workOrderId)).toEqual(['wo2']);

    page.onSearchInput('9902');
    expect(page.visibleReports().map((r) => r.workOrderId)).toEqual(['wo2']);

    page.onSearchInput('0101234');
    expect(page.visibleReports().map((r) => r.workOrderId)).toEqual(['wo1']);
  });

  it('does not go to the server while the approvals queue is the list being searched', async () => {
    vi.useFakeTimers();
    try {
      const { api, page } = await render({ reports: [report()] });
      page.switchTab('inspection-reports');
      api.search.mockClear();

      page.onSearchInput('Mona');
      vi.advanceTimersByTime(1000);

      // That queue is loaded whole, so the filter is local and a keystroke
      // costs nothing.
      expect(api.search).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries the typed query across to the other list rather than dropping it', async () => {
    const { api, page } = await render({ reports: [report()] });
    page.switchTab('inspection-reports');
    page.onSearchInput('Mona');
    api.search.mockClear();

    page.switchTab('reception');

    // One box, two lists: the operator has one question and should not have
    // to re-type it when the answer turns out to be in the other list.
    expect(api.search).toHaveBeenCalledWith('Mona');
  });
});

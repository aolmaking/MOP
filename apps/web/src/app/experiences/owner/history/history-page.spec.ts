import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { OwnerHistoryPage } from './history-page';
import { HistoryRecordDrawer } from './history-record-drawer';
import {
  OwnerHistoryApi,
  type OwnerHistoryIndex,
  type OwnerHistoryIndexRow,
  type OwnerHistoryRecord,
} from './history.api';

function row(overrides: Partial<OwnerHistoryIndexRow> = {}): OwnerHistoryIndexRow {
  return {
    key: 'c1:a1',
    customerId: 'c1',
    customerName: 'Ahmed Ali',
    customerPhone: '+201000000001',
    assetId: 'a1',
    category: 'CARS',
    plateNumber: 'ABC-123',
    vin: null,
    serialNumber: null,
    visits: 4,
    firstVisitAt: '2026-01-04T09:00:00.000Z',
    lastVisitAt: '2026-09-03T09:00:00.000Z',
    openVisits: 1,
    lastStatus: 'IN_PROGRESS',
    lastWorkOrderId: 'wo9',
    lastComplaint: 'Brake vibration above 80 km/h',
    billedTotal: '8400.00',
    outstanding: '1200.00',
    ...overrides,
  };
}

function index(overrides: Partial<OwnerHistoryIndex> = {}): OwnerHistoryIndex {
  return {
    rows: [row()],
    total: 1,
    page: 1,
    pageSize: 25,
    sort: 'lastVisit',
    direction: 'desc',
    generatedAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * A relationship with no visits yet.
 *
 * Enough for the drawer to render its identity band, which is all these
 * tests ask of it -- the drawer's own contents are proven end to end by
 * `apps/api/src/testing/history.http.spec.ts` against real records.
 */
function emptyRecord(): OwnerHistoryRecord {
  return {
    key: 'c2:a2',
    customer: { id: 'c2', fullName: 'Mona Adel', phone: '+201000000002', email: null, portalStatus: 'NOT_INVITED' },
    asset: {
      id: 'a2',
      category: 'CARS',
      plateNumber: 'XYZ-987',
      vin: null,
      engineNumber: null,
      serialNumber: null,
      currentOwnerCustomerId: 'c2',
    },
    isCurrentOwner: true,
    ownershipStartedAt: null,
    ownershipEndedAt: null,
    otherOwnerVisits: 0,
    totalVisits: 0,
    firstVisitAt: null,
    lastVisitAt: null,
    visits: [],
    generatedAt: '2026-09-03T10:00:00.000Z',
  };
}

/** The 250ms debounce, plus room for the response to land. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 320));
}

async function render(result: OwnerHistoryIndex | { error: unknown }) {
  const api = {
    index: vi.fn(() => ('error' in result ? throwError(() => result.error) : of(result))),
    record: vi.fn(() => of(emptyRecord())),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: OwnerHistoryApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(OwnerHistoryPage);
  fixture.detectChanges();
  // The index request is debounced, so the table only exists after the
  // same pause the real page waits for. Real timers rather than fake
  // ones: the debounce is the behaviour under test on the search case,
  // and faking it would prove the mock instead.
  await settle();
  fixture.detectChanges();
  return { fixture, api, element: fixture.nativeElement as HTMLElement };
}

describe('OwnerHistoryPage', () => {
  it('renders a row per customer+vehicle relationship, from the server', async () => {
    const { element, api } = await render(index());

    expect(api.index).toHaveBeenCalled();
    const cells = [...element.querySelectorAll('tbody td')].map((cell) => cell.textContent?.trim());
    expect(cells.join(' | ')).toContain('Ahmed Ali');
    expect(cells.join(' | ')).toContain('ABC-123');
    expect(cells.join(' | ')).toContain('4');
    expect(cells.join(' | ')).toContain('Brake vibration above 80 km/h');
  });

  it('says why the table is empty rather than leaving a blank one', async () => {
    const { element } = await render(index({ rows: [], total: 0 }));

    expect(element.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(element.querySelector('.state-title')?.textContent).toContain('Nothing to show');
  });

  it('explains a refusal instead of showing a broken page', async () => {
    const { element } = await render({ error: { httpStatus: 403, message: 'no' } });

    expect(element.querySelector('.state-title')?.textContent).toContain("don't have access");
  });

  /**
   * The failure this guards against is subtle and bad: sorting the rows
   * already in the browser sorts ONE PAGE of a paginated result, which
   * looks like it worked and is wrong. Every sort must be a new request.
   */
  it('asks the server to sort, never the browser', async () => {
    const { element, api } = await render(index());
    api.index.mockClear();

    const header = [...element.querySelectorAll<HTMLButtonElement>('th .sort')].find((button) =>
      button.textContent?.includes('Visits'),
    );
    header!.click();
    await settle();

    expect(api.index).toHaveBeenCalledWith(expect.objectContaining({ sort: 'visits', direction: 'desc', page: 1 }));
  });

  it('sends a search to the server and returns to the first page', async () => {
    const { element, api } = await render(index({ total: 200 }));
    api.index.mockClear();

    const input = element.querySelector<HTMLInputElement>('.search-input')!;
    input.value = 'ABC-123';
    input.dispatchEvent(new Event('input'));
    await settle();

    expect(api.index).toHaveBeenCalledWith(expect.objectContaining({ search: 'ABC-123', page: 1 }));
  });

  it('opens the complete record for the row that was asked for, and no other', async () => {
    const { fixture, element } = await render(
      index({ rows: [row(), row({ key: 'c2:a2', customerId: 'c2', assetId: 'a2', customerName: 'Mona Adel' })], total: 2 }),
    );

    expect(fixture.debugElement.query((node) => node.componentInstance instanceof HistoryRecordDrawer)).toBeNull();

    [...element.querySelectorAll<HTMLButtonElement>('.more')][1].click();
    fixture.detectChanges();

    const drawer = fixture.debugElement.query((node) => node.componentInstance instanceof HistoryRecordDrawer);
    expect(drawer).not.toBeNull();
    expect(drawer.componentInstance.customerId()).toBe('c2');
    expect(drawer.componentInstance.assetId()).toBe('a2');
  });
});

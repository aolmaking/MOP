import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ReportsPage } from './reports-page';
import { PlatformReportsApi, type PlatformReportsOverview, type WorkshopReportCard } from './platform-reports.api';

function card(overrides: Partial<WorkshopReportCard> = {}): WorkshopReportCard {
  return {
    id: 'ws-1',
    name: 'Apex Motors',
    health: 'HEALTHY',
    planName: 'Growth',
    status: 'ACTIVE',
    lastActivityAt: '2026-08-12T10:00:00.000Z',
    staffUserCount: 5,
    customerCount: 40,
    activeUserCount: 8,
    usageScore: 80,
    featureAdoptionPercent: 70,
    builderAdoptionPercent: 25,
    ...overrides,
  };
}

function overview(items: readonly WorkshopReportCard[] = [card()]): PlatformReportsOverview {
  return {
    totals: { totalWorkshops: 1, activeWorkshops: 1, totalStaffUsers: 5, totalCustomers: 40, aggregateMrr: null },
    workshops: { items, total: items.length, page: 1, pageSize: 25 },
  };
}

function render(response: PlatformReportsOverview | { readonly error: unknown }) {
  const api = { overview: () => ('error' in response ? throwError(() => response.error) : of(response)) };
  const router = { navigate: vi.fn() };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: PlatformReportsApi, useValue: api }, { provide: Router, useValue: router }],
  });
  const fixture = TestBed.createComponent(ReportsPage);
  fixture.detectChanges();
  return { fixture, router, element: fixture.nativeElement as HTMLElement };
}

describe('ReportsPage', () => {
  it('shows the platform-wide summary tiles, with MRR explicitly a placeholder', () => {
    const { element } = render(overview());

    expect(element.textContent).toContain('Total workshops');
    const mrrTile = [...element.querySelectorAll('.tile')].find((t) => t.textContent?.includes('MRR'));
    expect(mrrTile?.textContent).toContain('—');
    expect(mrrTile?.textContent).toContain('not tracked yet');
  });

  it('shows the empty state when there are no workshops at all', () => {
    const { element } = render(overview([]));
    expect(element.textContent).toContain('No workshops yet');
  });

  it('renders one card per workshop with its health badge', () => {
    const { element } = render(overview([card(), card({ id: 'ws-2', name: 'Delta Quick', health: 'CRITICAL' })]));

    expect(element.querySelectorAll('.card').length).toBe(2);
    expect(element.querySelector('.badge[data-health="CRITICAL"]')).not.toBeNull();
  });

  it('navigates to the workshop detail on card click', () => {
    const { fixture, router, element } = render(overview());

    (element.querySelector('.card') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/platform/reports', 'ws-1']);
  });

  it('shows a distinct no-access state on 403', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });
    expect(element.textContent).toContain("don't have access");
  });
});

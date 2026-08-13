import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
import {
  ReportsApi,
  type CustomersReport,
  type FinancialReport,
  type InventoryAnalyticsReport,
  type OperationsReport,
  type OverviewReport,
  type ReportRangeParams,
} from './reports.api';
import { OverviewSection } from './sections/overview-section';
import { OperationsSection } from './sections/operations-section';
import { FinancialSection } from './sections/financial-section';
import { InventorySection } from './sections/inventory-section';
import { CustomersSection } from './sections/customers-section';

type Tab = 'overview' | 'operations' | 'financial' | 'inventory' | 'customers';
type State = 'loading' | 'ready' | 'forbidden' | 'error';

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'operations', label: 'Operations' },
  { key: 'financial', label: 'Financial' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'customers', label: 'Customers' },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return isoDate(d);
}

/**
 * Reports & Analytics -- the Owner's own workshop intelligence
 * (docs/detailed-specs/tenant-owner.md), distinct from Platform Reports
 * (Super Admin's view of this workshop as a MOP customer). Executive
 * Overview leads because it answers "how is my workshop doing" in one
 * screen; every other tab is a deeper investigation of one slice of that
 * answer, sharing the same date-range/branch filter bar so a comparison
 * made on one tab means the same thing on the next.
 */
@Component({
  selector: 'app-reports-page',
  imports: [FormsModule, ErrorBanner, ButtonDirective, OverviewSection, OperationsSection, FinancialSection, InventorySection, CustomersSection],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.css',
})
export class ReportsPage {
  private readonly api = inject(ReportsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabs = TABS;
  protected readonly activeTab = signal<Tab>('overview');
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly from = signal(defaultFrom());
  protected readonly to = signal(isoDate(new Date()));
  protected readonly groupBy = signal<'day' | 'week' | 'month'>('day');

  protected readonly overview = signal<OverviewReport | null>(null);
  protected readonly operations = signal<OperationsReport | null>(null);
  protected readonly financial = signal<FinancialReport | null>(null);
  protected readonly inventory = signal<InventoryAnalyticsReport | null>(null);
  protected readonly customers = signal<CustomersReport | null>(null);

  protected readonly rangeParams = computed<ReportRangeParams>(() => ({
    from: this.from(),
    to: this.to(),
    groupBy: this.groupBy(),
  }));

  constructor() {
    this.load();
  }

  protected switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.load();
  }

  protected applyFilters(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    const params = this.rangeParams();
    const onError = (err: PresentedError) => {
      this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      this.error.set(err);
    };
    const onReady = () => this.state.set('ready');

    switch (this.activeTab()) {
      case 'overview':
        this.api
          .overview(params)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (r) => {
              this.overview.set(r);
              onReady();
            },
            error: onError,
          });
        break;
      case 'operations':
        this.api
          .operations(params)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (r) => {
              this.operations.set(r);
              onReady();
            },
            error: onError,
          });
        break;
      case 'financial':
        this.api
          .financial(params)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (r) => {
              this.financial.set(r);
              onReady();
            },
            error: onError,
          });
        break;
      case 'inventory':
        this.api
          .inventory(params)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (r) => {
              this.inventory.set(r);
              onReady();
            },
            error: onError,
          });
        break;
      case 'customers':
        this.api
          .customers(params)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (r) => {
              this.customers.set(r);
              onReady();
            },
            error: onError,
          });
        break;
    }
  }
}

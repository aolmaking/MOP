import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { InventoryApi, type InventoryReports as ReportsData } from './inventory.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Reports & Stock Insights -- the storekeeper's own reporting, scoped to
 * their warehouses and distinct from the Owner's company-wide reports.
 *
 * Each section gets the shape its question needs rather than one grid of
 * identical cards. Usage is a ranked bar list, because the question is
 * "which is biggest". Stock risk is a table sorted by days left, because
 * the question is "which do I order first" and every column is
 * comparable down its length. Returns is three numbers and a proportion,
 * because that is all it is.
 *
 * The comparison section is absent, not empty, when this manager covers
 * one warehouse -- a chart with a single bar is not a comparison, and
 * the server sends null rather than an array of one to say so.
 */
@Component({
  selector: 'app-inventory-reports',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './inventory-reports.html',
  styleUrl: './inventory-reports.css',
})
export class InventoryReportsPage {
  private readonly api = inject(InventoryApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<ReportsData | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  /** Bars are scaled against the largest in their own section. */
  private readonly usagePeak = computed(() => Math.max(1, ...(this.data()?.usage ?? []).map((row) => row.issued)));
  private readonly categoryPeak = computed(() =>
    Math.max(1, ...(this.data()?.categoryUsage ?? []).map((row) => row.issued)),
  );
  private readonly warehousePeak = computed(() =>
    Math.max(1, ...(this.data()?.warehouseComparison ?? []).map((row) => row.issued)),
  );

  protected readonly hasAnything = computed(() => {
    const data = this.data();
    if (!data) return false;
    return data.usage.length > 0 || data.returns.total > 0 || data.requesters.length > 0;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .reports()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected usageWidth(issued: number): string {
    return `${Math.max(2, Math.round((issued / this.usagePeak()) * 100))}%`;
  }

  protected categoryWidth(issued: number): string {
    return `${Math.max(2, Math.round((issued / this.categoryPeak()) * 100))}%`;
  }

  protected warehouseWidth(issued: number): string {
    return `${Math.max(2, Math.round((issued / this.warehousePeak()) * 100))}%`;
  }

  /** How much of the returned volume went back on the shelf. */
  protected damageShare(): string {
    const returns = this.data()?.returns;
    if (!returns || returns.total === 0) return '0%';
    return `${Math.round((returns.damaged / returns.total) * 100)}%`;
  }

  /**
   * Under a week is the urgent band. Chosen because that is roughly how
   * long a re-order takes to arrive -- below it, the shelf runs out
   * before the delivery lands.
   */
  protected riskTone(daysLeft: number | null): 'urgent' | 'active' | 'quiet' {
    if (daysLeft === null) return 'quiet';
    if (daysLeft <= 7) return 'urgent';
    if (daysLeft <= 14) return 'active';
    return 'quiet';
  }
}

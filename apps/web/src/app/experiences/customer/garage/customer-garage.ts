import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import {
  CustomerPortalApi,
  type PortalAsset,
  type SafeHistoryEntry,
  type InvoiceStatusRow,
} from '../customer-portal.api';

export type GarageTab = 'vehicles' | 'history' | 'invoices';

@Component({
  selector: 'app-customer-garage',
  imports: [CommonModule, ErrorBanner],
  templateUrl: './customer-garage.html',
  styleUrl: './customer-garage.css',
})
export class CustomerGarage implements OnInit {
  private readonly api = inject(CustomerPortalApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeTab = signal<GarageTab>('vehicles');
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly assets = signal<readonly PortalAsset[]>([]);
  protected readonly historyEntries = signal<readonly SafeHistoryEntry[]>([]);
  protected readonly invoices = signal<readonly InvoiceStatusRow[]>([]);

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const tab = params.get('tab') as GarageTab | null;
      if (tab && ['vehicles', 'history', 'invoices'].includes(tab)) {
        this.activeTab.set(tab);
      }
    });
    this.loadAll();
  }

  protected setTab(tab: GarageTab): void {
    this.activeTab.set(tab);
  }

  protected loadAll(): void {
    this.loading.set(true);
    this.error.set(null);

    // Load assets
    this.api
      .assets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.assets.set(items),
        error: (err: PresentedError) => this.error.set(err),
      });

    // Load safe history
    this.api
      .safeHistory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.historyEntries.set(items),
        error: (err: PresentedError) => this.error.set(err),
      });

    // Load invoices
    this.api
      .invoices()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.invoices.set(items);
          this.loading.set(false);
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.loading.set(false);
        },
      });
  }


  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
}

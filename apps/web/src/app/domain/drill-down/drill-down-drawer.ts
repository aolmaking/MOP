import { Component, DestroyRef, inject, input, output, signal, effect, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Identifier } from "../../ui/identifier/identifier";
import { ButtonDirective } from "../../ui/button/button.directive";
import { DismissOnEscapeDirective } from "../../ui/dismiss-on-escape/dismiss-on-escape.directive";
import { ErrorBanner } from "../../ui/error-banner/error-banner";
import type { PresentedError } from "../../runtime/http/error.interceptor";
import { DrillDownApi } from "./drill-down.api";
import type { DrillDownRecord, DrillDownResult } from "./drill-down.types";

type State = "loading" | "ready" | "error";

@Component({
  selector: "app-drill-down-drawer",
  standalone: true,
  imports: [CommonModule, ButtonDirective, DismissOnEscapeDirective, ErrorBanner],
  templateUrl: "./drill-down-drawer.html",
  styleUrl: "./drill-down-drawer.css",
})
export class DrillDownDrawer {
  private readonly api = inject(DrillDownApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly metric = input.required<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly branchId = input<string>();
  readonly serviceKey = input<string>();
  readonly technicianId = input<string>();
  readonly workOrderId = input<string>();

  readonly closed = output<void>();
  readonly openWorkOrderDossier = output<string>();

  protected readonly state = signal<State>("loading");
  protected readonly data = signal<DrillDownResult | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly selectedDimension = signal<string | undefined>(undefined);
  protected readonly selectedDimensionValue = signal<string | undefined>(undefined);
  protected readonly expandedRecordIds = signal<Set<string>>(new Set());
  protected readonly loadingMore = signal<boolean>(false);

  constructor() {
    effect(() => {
      const m = this.metric();
      if (m) {
        this.load();
      }
    });
  }

  protected load(): void {
    this.state.set("loading");
    this.api
      .drillDown({
        metric: this.metric(),
        from: this.from(),
        to: this.to(),
        branchId: this.branchId(),
        serviceKey: this.serviceKey(),
        technicianId: this.technicianId(),
        workOrderId: this.workOrderId(),
        dimension: this.selectedDimension(),
        dimensionValue: this.selectedDimensionValue(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.state.set("ready");
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set("error");
        },
      });
  }

  protected setDimensionFilter(dimension?: string, value?: string): void {
    this.selectedDimension.set(dimension);
    this.selectedDimensionValue.set(value);
    this.load();
  }

  protected toggleExpand(recordId: string): void {
    const current = new Set(this.expandedRecordIds());
    if (current.has(recordId)) {
      current.delete(recordId);
    } else {
      current.add(recordId);
    }
    this.expandedRecordIds.set(current);
  }

  protected isExpanded(recordId: string): boolean {
    return this.expandedRecordIds().has(recordId);
  }

  protected loadMore(): void {
    const currentData = this.data();
    if (!currentData?.nextCursor || this.loadingMore()) return;

    this.loadingMore.set(true);
    this.api
      .drillDown({
        metric: this.metric(),
        from: this.from(),
        to: this.to(),
        branchId: this.branchId(),
        serviceKey: this.serviceKey(),
        technicianId: this.technicianId(),
        workOrderId: this.workOrderId(),
        dimension: this.selectedDimension(),
        dimensionValue: this.selectedDimensionValue(),
        cursor: currentData.nextCursor,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (nextPage) => {
          this.data.set({
            ...currentData,
            records: [...currentData.records, ...nextPage.records],
            nextCursor: nextPage.nextCursor,
            integrity: nextPage.integrity,
          });
          this.loadingMore.set(false);
        },
        error: () => {
          this.loadingMore.set(false);
        },
      });
  }

  protected exportCsv(): void {
    const url = this.api.exportCsvUrl({
      metric: this.metric(),
      from: this.from(),
      to: this.to(),
      branchId: this.branchId(),
      serviceKey: this.serviceKey(),
      technicianId: this.technicianId(),
      workOrderId: this.workOrderId(),
      dimension: this.selectedDimension(),
      dimensionValue: this.selectedDimensionValue(),
    });
    window.open(url, "_blank");
  }

  protected onOpenDossier(woId?: string): void {
    if (woId) {
      this.openWorkOrderDossier.emit(woId);
    }
  }
}

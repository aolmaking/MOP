import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonDirective } from '../../ui/button/button.directive';
import { ToastService } from '../../ui/toast/toast.service';
import { AccessApi } from '../../identity/access.api';
import { AnalystApi, type AnalystSavedViewSourcePage } from './analyst.api';

/**
 * "From any page ... an Export action generates a file ... reflecting
 * exactly the currently-filtered view" (docs/detailed-specs/data-analyst.md).
 * Downloads the same category the host page renders, gated by the same
 * `analytics.export` permission the Saved Views/Exports page already
 * reads -- checked again here since each analytical page renders this
 * independently, without assuming the visitor came through that page first.
 */
@Component({
  selector: 'app-export-action',
  imports: [ButtonDirective],
  templateUrl: './export-action.html',
  styleUrl: './export-action.css',
})
export class ExportAction {
  readonly sourcePage = input.required<AnalystSavedViewSourcePage>();
  readonly params = input<{ from?: string; to?: string; groupBy?: string; range?: { from?: string; to?: string } | null } | null>(null);

  private readonly api = inject(AnalystApi);
  private readonly access = inject(AccessApi);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly allowed = signal(false);
  protected readonly exporting = signal(false);

  constructor() {
    this.access
      .can('analytics.export')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((allowed) => this.allowed.set(allowed));
  }

  protected export(): void {
    if (this.exporting()) return;

    this.exporting.set(true);
    const p = this.params();
    const query = p
      ? {
          from: p.from ?? p.range?.from ?? undefined,
          to: p.to ?? p.range?.to ?? undefined,
          groupBy: p.groupBy,
        }
      : undefined;

    const call$ = query
      ? this.api.exportCsv(this.sourcePage(), query)
      : this.api.exportCsv(this.sourcePage());

    call$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          this.download(blob);
        },
        error: () => {
          this.exporting.set(false);
          this.toast.show('Could not generate the export. Check your plan allows this category.', 'danger');
        },
      });
  }

  private download(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.sourcePage().toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

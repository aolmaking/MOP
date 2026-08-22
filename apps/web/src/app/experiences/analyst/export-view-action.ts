import { Component, inject, input, signal } from '@angular/core';
import { take } from 'rxjs';
import { AccessApi } from '../../identity/access.api';
import { ButtonDirective } from '../../ui/button/button.directive';
import { ToastService } from '../../ui/toast/toast.service';
import { AnalystApi, type AnalystSavedViewSourcePage } from './analyst.api';

@Component({
  selector: 'app-export-view-action',
  imports: [ButtonDirective],
  templateUrl: './export-view-action.html',
  styleUrl: './export-view-action.css',
})
export class ExportViewAction {
  readonly sourcePage = input.required<AnalystSavedViewSourcePage>();
  readonly configuration = input<Record<string, unknown>>({});

  private readonly api = inject(AnalystApi);
  private readonly access = inject(AccessApi);
  private readonly toast = inject(ToastService);

  protected readonly allowed = signal(false);
  protected readonly exporting = signal(false);

  constructor() {
    this.access
      .can('analytics.export')
      .pipe(take(1))
      .subscribe((allowed) => this.allowed.set(allowed));
  }

  protected exportCsv(): void {
    if (!this.allowed() || this.exporting()) return;

    this.exporting.set(true);
    this.api
      .exportCsv(this.sourcePage(), this.configuration())
      .pipe(take(1))
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          download(blob, fileName(this.sourcePage()));
          this.toast.show('Export created.', 'success');
        },
        error: () => {
          this.exporting.set(false);
          this.toast.show('Could not export this view.', 'danger');
        },
      });
  }
}

function fileName(sourcePage: AnalystSavedViewSourcePage): string {
  return `mop-${sourcePage.toLowerCase().replace(/_/g, '-')}-analytics.csv`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

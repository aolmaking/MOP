import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AccessApi } from '../../identity/access.api';
import { AnalystApi, type AnalystSavedView, type AnalystSavedViewSourcePage } from './analyst.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

const SOURCE_LABEL: Record<AnalystSavedViewSourcePage, string> = {
  OPERATIONS: 'Operations',
  PEOPLE: 'Technician & Team',
  INVENTORY: 'Inventory',
  DECISIONS: 'Customer Decisions',
  FEATURE_ADOPTION: 'Feature Adoption',
};

const SOURCE_ROUTE: Record<AnalystSavedViewSourcePage, string> = {
  OPERATIONS: '/analyst/operations',
  PEOPLE: '/analyst/people',
  INVENTORY: '/analyst/inventory',
  DECISIONS: '/analyst/decisions',
  FEATURE_ADOPTION: '/analyst/feature-adoption',
};

@Component({
  selector: 'app-analyst-saved-views-page',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './analyst-saved-views-page.html',
  styleUrl: './analyst-saved-views-page.css',
})
export class AnalystSavedViewsPage {
  private readonly api = inject(AnalystApi);
  private readonly access = inject(AccessApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly views = signal<readonly AnalystSavedView[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editedName = signal('');
  protected readonly busyId = signal<string | null>(null);
  protected readonly exportAllowed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .savedViews()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.views.set(r.items);
          this.state.set('ready');
          this.loadExportAccess();
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }

  private loadExportAccess(): void {
    this.access
      .can('analytics.export')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((allowed) => this.exportAllowed.set(allowed));
  }

  protected startRename(view: AnalystSavedView): void {
    this.editingId.set(view.id);
    this.editedName.set(view.name);
  }

  protected cancelRename(): void {
    this.editingId.set(null);
    this.editedName.set('');
  }

  protected rename(view: AnalystSavedView): void {
    const name = this.editedName().trim();
    if (!name) return;

    this.busyId.set(view.id);
    this.api
      .renameView(view.id, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.views.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          this.busyId.set(null);
          this.cancelRename();
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.busyId.set(null);
        },
      });
  }

  protected deleteView(view: AnalystSavedView): void {
    this.busyId.set(view.id);
    this.api
      .deleteView(view.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.views.update((items) => items.filter((item) => item.id !== view.id));
          this.busyId.set(null);
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.busyId.set(null);
        },
      });
  }

  protected sourceLabel(sourcePage: AnalystSavedViewSourcePage): string {
    return SOURCE_LABEL[sourcePage];
  }

  protected sourceRoute(sourcePage: AnalystSavedViewSourcePage): string {
    return SOURCE_ROUTE[sourcePage];
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }
}

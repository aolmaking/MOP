import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AnalystApi, type FeatureAdoptionReport } from './analyst.api';
import { ExportViewAction } from './export-view-action';
import { SavedViewAction } from './saved-view-action';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

@Component({
  selector: 'app-analyst-feature-adoption-page',
  imports: [ErrorBanner, ButtonDirective, SavedViewAction, ExportViewAction],
  templateUrl: './analyst-feature-adoption-page.html',
  styleUrl: './analyst-feature-adoption-page.css',
})
export class AnalystFeatureAdoptionPage {
  private readonly api = inject(AnalystApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly data = signal<FeatureAdoptionReport | null>(null);
  protected readonly viewConfiguration = computed(() => ({ range: this.data()?.range ?? null }));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .featureAdoption()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.data.set(r);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }
}

import { Component, computed, inject, input, signal } from '@angular/core';
import { take } from 'rxjs';
import { ButtonDirective } from '../../ui/button/button.directive';
import { ToastService } from '../../ui/toast/toast.service';
import { AnalystApi, type AnalystSavedViewSourcePage } from './analyst.api';

@Component({
  selector: 'app-saved-view-action',
  imports: [ButtonDirective],
  templateUrl: './saved-view-action.html',
  styleUrl: './saved-view-action.css',
})
export class SavedViewAction {
  readonly sourcePage = input.required<AnalystSavedViewSourcePage>();
  readonly defaultName = input('Saved view');
  readonly configuration = input<Record<string, unknown>>({});

  private readonly api = inject(AnalystApi);
  private readonly toast = inject(ToastService);

  protected readonly open = signal(false);
  protected readonly name = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canSave = computed(() => this.name().trim().length > 0 && !this.saving());

  protected start(): void {
    this.name.set(this.defaultName());
    this.error.set(null);
    this.open.set(true);
  }

  protected cancel(): void {
    this.open.set(false);
    this.error.set(null);
  }

  protected save(): void {
    if (!this.canSave()) return;

    this.saving.set(true);
    this.error.set(null);
    this.api
      .saveView({
        name: this.name().trim(),
        sourcePage: this.sourcePage(),
        configuration: this.configuration(),
      })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.open.set(false);
          this.toast.show('Saved view created.', 'success');
        },
        error: () => {
          this.saving.set(false);
          this.error.set('Could not save this view.');
        },
      });
  }
}

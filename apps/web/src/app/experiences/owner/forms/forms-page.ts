import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { FIELD_TYPES, FORM_KEYS, FormsApi, type AddFieldInput, type FormFieldsView } from './forms.api';
import { DismissOnEscapeDirective } from '../../../ui/dismiss-on-escape/dismiss-on-escape.directive';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Forms & Fields (docs/detailed-specs/tenant-owner.md). Safe, additive
 * customization -- there is no delete anywhere on this page, only
 * archive/restore, matching CustomFieldsService's own guarantee that
 * archiving a definition never touches values already captured under it.
 */
@Component({
  selector: 'app-forms-page',
  imports: [FormsModule, ErrorBanner, ButtonDirective, DismissOnEscapeDirective],
  templateUrl: './forms-page.html',
  styleUrl: './forms-page.css',
})
export class FormsPage {
  private readonly api = inject(FormsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formKeys = FORM_KEYS;
  protected readonly fieldTypes = FIELD_TYPES;
  protected readonly selectedForm = signal<string>(FORM_KEYS[0]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly form = signal<FormFieldsView | null>(null);

  protected readonly showAdd = signal(false);
  protected readonly draft = signal<AddFieldInput>({ label: '', fieldType: 'TEXT' });
  protected readonly optionsText = signal('');
  protected readonly addError = signal<PresentedError | null>(null);

  protected readonly needsOptions = computed(() => this.draft().fieldType === 'SELECT');
  protected readonly liveFields = computed(() => this.form()?.customFields.filter((f) => !f.isArchived) ?? []);
  protected readonly archivedFields = computed(() => this.form()?.customFields.filter((f) => f.isArchived) ?? []);

  constructor() {
    this.load();
  }

  protected selectForm(key: string): void {
    this.selectedForm.set(key);
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .form(this.selectedForm())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (form) => {
          this.form.set(form);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }

  protected openAdd(): void {
    this.draft.set({ label: '', fieldType: 'TEXT' });
    this.optionsText.set('');
    this.addError.set(null);
    this.showAdd.set(true);
  }

  protected updateDraft<K extends keyof AddFieldInput>(key: K, value: AddFieldInput[K]): void {
    this.draft.set({ ...this.draft(), [key]: value });
  }

  protected submitAdd(): void {
    const options = this.optionsText()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label }));

    this.addError.set(null);
    this.api
      .addField(this.selectedForm(), { ...this.draft(), options: this.needsOptions() ? options : undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showAdd.set(false);
          this.load();
        },
        error: (err: PresentedError) => this.addError.set(err),
      });
  }

  protected toggleArchived(fieldId: string, archived: boolean): void {
    this.api
      .setArchived(fieldId, archived)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load() });
  }
}

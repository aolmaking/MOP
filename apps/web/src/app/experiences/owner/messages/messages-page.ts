import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { MessagesApi, type TemplateView } from './messages.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Messages & Templates (docs/detailed-specs/tenant-owner.md). Every
 * consumer that eventually sends one of these 8 message types must read
 * MessageTemplateService.currentBody -- never a hardcoded copy -- which
 * is why publishing (not just editing) is the one write this page makes:
 * a draft that was never published is not what a real send should use.
 */
@Component({
  selector: 'app-messages-page',
  imports: [FormsModule, ErrorBanner, ButtonDirective],
  templateUrl: './messages-page.html',
  styleUrl: './messages-page.css',
})
export class MessagesPage {
  private readonly api = inject(MessagesApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly templates = signal<readonly TemplateView[]>([]);
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly preview = signal('');
  protected readonly publishError = signal<PresentedError | null>(null);
  protected readonly publishing = signal(false);

  protected readonly selected = computed(() => this.templates().find((t) => t.key === this.selectedKey()) ?? null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.templates.set(list);
          this.state.set('ready');
          if (!this.selectedKey() && list.length > 0) this.select(list[0]!.key);
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }

  protected select(key: string): void {
    this.selectedKey.set(key);
    const template = this.templates().find((t) => t.key === key);
    this.draft.set(template?.body ?? '');
    this.publishError.set(null);
    this.refreshPreview();
  }

  protected insertVariable(name: string): void {
    this.draft.set(`${this.draft()}{{${name}}}`);
    this.refreshPreview();
  }

  protected updateDraft(value: string): void {
    this.draft.set(value);
    this.refreshPreview();
  }

  private refreshPreview(): void {
    const key = this.selectedKey();
    if (!key) return;
    this.api
      .preview(key, this.draft())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (result) => this.preview.set(result.preview) });
  }

  protected publish(): void {
    const key = this.selectedKey();
    if (!key) return;

    this.publishing.set(true);
    this.publishError.set(null);
    this.api
      .publish(key, this.draft())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.publishing.set(false);
          this.load();
        },
        error: (err: PresentedError) => {
          this.publishing.set(false);
          this.publishError.set(err);
        },
      });
  }
}

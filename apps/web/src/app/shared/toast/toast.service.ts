import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'danger' | 'neutral';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/**
 * Transient, page-level notifications (e.g. "{Workshop Name} created.").
 * Distinct from ErrorBanner: that's an inline, caller-owned element for a
 * specific form's error; this is app-wide and self-dismissing, for a
 * result the user should see but isn't blocked on.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();
  private nextId = 0;

  show(message: string, tone: ToastTone = 'neutral', durationMs = 5000): void {
    const id = this.nextId++;
    this._toasts.update((list) => [...list, { id, message, tone }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}

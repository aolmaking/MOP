import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

/** Mounted once, at the app shell root. Renders whatever ToastService currently holds. */
@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.html',
})
export class ToastContainer {
  private readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}

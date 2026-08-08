import { Component, input, output } from '@angular/core';
import type { PresentedError } from '../../core/api/error.interceptor';

/**
 * Presentational only -- takes whatever the error interceptor produced and
 * renders it. Callers own catching the error (subscribe/catch, a form
 * submit handler, ...) and deciding when to show/clear it; this component
 * has no HTTP or global-state knowledge of its own.
 */
@Component({
  selector: 'app-error-banner',
  templateUrl: './error-banner.html',
  styleUrl: './error-banner.css',
})
export class ErrorBanner {
  readonly error = input<PresentedError | null>(null);
  readonly dismissed = output<void>();
}

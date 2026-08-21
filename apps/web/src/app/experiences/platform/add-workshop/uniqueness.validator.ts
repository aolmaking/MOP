import type { AbstractControl, AsyncValidatorFn } from '@angular/forms';
import type { Observable } from 'rxjs';
import { catchError, delay, map, of, switchMap } from 'rxjs';
import type { AvailabilityResult } from '../workshops/platform-workshops.api';

/**
 * A real 500ms delay (per spec) before an async uniqueness check against a
 * real endpoint -- combined with the affected controls' `updateOn: 'blur'`
 * (see add-workshop-page.ts's form definition), this is what actually
 * implements the spec's "debounced (500ms) async call on blur."
 *
 * Uses `delay`, not `debounceTime`: debounceTime taming a *stream* of
 * rapid-fire emissions, which is the wrong tool here -- this validator's
 * source is a single value from a single call, and debounceTime flushes
 * a value immediately once its source completes (which `of(value)` does
 * right away), so it produced no actual delay at all. `delay` postpones
 * the one emission by a fixed duration regardless, which is what "wait
 * before checking" actually means for a one-shot value like this.
 *
 * A network error resolves valid rather than blocking the form: the
 * pre-check is a UX convenience, not the enforcement -- the server
 * re-validates for real at submit time regardless (see
 * PlatformService.translateUniquenessError), so failing open here just
 * means the user finds out at submit instead of on blur, not that
 * anything unsafe slips through.
 */
export function uniquenessValidator(check: (value: string) => Observable<AvailabilityResult>): AsyncValidatorFn {
  return (control: AbstractControl) => {
    const value = (control.value as string | null)?.trim();
    if (!value) return of(null);

    return of(value).pipe(
      delay(500),
      switchMap((v) => check(v)),
      map((result) => (result.available ? null : { taken: true })),
      catchError(() => of(null)),
    );
  };
}

import type { AbstractControl } from '@angular/forms';
import type { Observable } from 'rxjs';
import { firstValueFrom, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { uniquenessValidator } from './uniqueness.validator';

function controlWithValue(value: string | null): AbstractControl {
  return { value } as AbstractControl;
}

/** The validator's declared return type is Observable | Promise (AsyncValidatorFn); every check() stub here returns an Observable. */
function runValidator(validator: ReturnType<typeof uniquenessValidator>, control: AbstractControl) {
  return firstValueFrom(validator(control) as Observable<{ taken: true } | null>);
}

describe('uniquenessValidator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves null immediately, without calling check, for an empty value', async () => {
    const check = vi.fn();
    const validator = uniquenessValidator(check);

    const result = await runValidator(validator, controlWithValue(''));

    expect(result).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it('debounces before calling check -- not immediately on subscribe', async () => {
    const check = vi.fn().mockReturnValue(of({ available: true }));
    const validator = uniquenessValidator(check);

    const resultPromise = runValidator(validator, controlWithValue('cairo-west'));
    expect(check).not.toHaveBeenCalled(); // still pending, debounce hasn't elapsed
    await vi.advanceTimersByTimeAsync(500);
    expect(check).toHaveBeenCalledWith('cairo-west');

    expect(await resultPromise).toBeNull();
  });

  it('resolves {taken: true} when the check reports unavailable', async () => {
    const check = vi.fn().mockReturnValue(of({ available: false }));
    const validator = uniquenessValidator(check);

    const resultPromise = runValidator(validator, controlWithValue('taken-name'));
    await vi.advanceTimersByTimeAsync(500);

    expect(await resultPromise).toEqual({ taken: true });
  });

  it('fails open (resolves valid) on a network error, since the server re-validates for real at submit', async () => {
    const check = vi.fn().mockReturnValue(throwError(() => new Error('network down')));
    const validator = uniquenessValidator(check);

    const resultPromise = runValidator(validator, controlWithValue('anything'));
    await vi.advanceTimersByTimeAsync(500);

    expect(await resultPromise).toBeNull();
  });

  it('trims whitespace before checking', async () => {
    const check = vi.fn().mockReturnValue(of({ available: true }));
    const validator = uniquenessValidator(check);

    const resultPromise = runValidator(validator, controlWithValue('  padded  '));
    await vi.advanceTimersByTimeAsync(500);
    await resultPromise;

    expect(check).toHaveBeenCalledWith('padded');
  });
});

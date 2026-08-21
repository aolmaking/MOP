import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export type LocaleCode = 'en' | 'ar';
export type TextDirection = 'ltr' | 'rtl';

/** Scripts written right-to-left. Kept as data so adding Hebrew/Farsi later is one entry. */
const RTL_LOCALES: ReadonlySet<LocaleCode> = new Set<LocaleCode>(['ar']);

const STORAGE_KEY = 'mop.locale';

/**
 * Owns the active locale and, with it, the document's text direction.
 *
 * Direction is set in exactly one place -- here, on <html> -- and never
 * hardcoded in a component. Components use CSS logical properties
 * (enforced by tools/lint-directional-css.mjs), so the whole UI mirrors
 * from this single attribute rather than from per-component overrides.
 *
 * Translation of the strings themselves is Phase 14. This exists now
 * because direction is the expensive half to retrofit: it touches every
 * stylesheet and every layout assumption, while swapping message text
 * later is mechanical.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);

  private readonly localeSignal = signal<LocaleCode>('en');

  readonly locale = this.localeSignal.asReadonly();

  constructor() {
    this.apply(this.restore() ?? 'en');
  }

  direction(): TextDirection {
    return RTL_LOCALES.has(this.localeSignal()) ? 'rtl' : 'ltr';
  }

  setLocale(locale: LocaleCode): void {
    this.apply(locale);
    this.persist(locale);
  }

  private apply(locale: LocaleCode): void {
    this.localeSignal.set(locale);

    const root = this.document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', this.direction());
  }

  /**
   * localStorage is unavailable in some privacy modes and throws rather
   * than returning null, so both reads and writes are guarded -- a
   * preference that cannot be stored must not break the app.
   */
  private restore(): LocaleCode | null {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      return stored === 'ar' || stored === 'en' ? stored : null;
    } catch {
      return null;
    }
  }

  private persist(locale: LocaleCode): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Preference is simply not remembered; not worth failing over.
    }
  }
}

import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/core';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
    TestBed.resetTestingModule();
  });

  it('defaults to English, left-to-right', () => {
    const service = TestBed.inject(LocaleService);
    expect(service.locale()).toBe('en');
    expect(service.direction()).toBe('ltr');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
  });

  it('flips the document to rtl for Arabic', () => {
    const service = TestBed.inject(LocaleService);
    service.setLocale('ar');

    expect(service.direction()).toBe('rtl');
    // The single source of direction for the whole UI -- components use
    // logical CSS properties and mirror off this one attribute.
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
  });

  it('flips back to ltr', () => {
    const service = TestBed.inject(LocaleService);
    service.setLocale('ar');
    service.setLocale('en');

    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('remembers the choice across sessions', () => {
    TestBed.inject(LocaleService).setLocale('ar');

    TestBed.resetTestingModule();
    const restored = TestBed.inject(LocaleService);

    expect(restored.locale()).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('ignores a corrupted stored value rather than trusting it', () => {
    localStorage.setItem('mop.locale', 'klingon');
    expect(TestBed.inject(LocaleService).locale()).toBe('en');
  });

  it('still works when localStorage throws (private browsing)', () => {
    const throwingDocument = {
      documentElement: document.createElement('html'),
      defaultView: {
        localStorage: {
          getItem: () => {
            throw new Error('denied');
          },
          setItem: () => {
            throw new Error('denied');
          },
        },
      },
    };

    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: throwingDocument }] });

    const service = TestBed.inject(LocaleService);
    expect(() => service.setLocale('ar')).not.toThrow();
    expect(service.direction()).toBe('rtl');
    expect(throwingDocument.documentElement.getAttribute('dir')).toBe('rtl');
  });
});

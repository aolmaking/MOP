import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Identifier } from './identifier';

@Component({
  imports: [Identifier],
  template: `<mop-identifier [value]="'ABC 1234'" />`,
})
class HostComponent {}

/** An identifier rendered inside a right-to-left sentence -- the case that breaks. */
@Component({
  imports: [Identifier],
  template: `<p dir="rtl">السيارة <mop-identifier [value]="'XYZ-987'" /> جاهزة</p>`,
})
class RtlHostComponent {}

describe('Identifier', () => {
  it('renders the value inside a bidi isolate', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const bdi = (fixture.nativeElement as HTMLElement).querySelector('bdi');
    expect(bdi).not.toBeNull();
    expect(bdi?.textContent?.trim()).toBe('ABC 1234');
  });

  it('pins the identifier to left-to-right so it cannot be reordered', () => {
    // Without this, the bidirectional algorithm resolves direction from
    // the surrounding text and a plate number can render reversed -- a
    // technician then pulls the wrong vehicle into the bay.
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const bdi = (fixture.nativeElement as HTMLElement).querySelector('bdi');
    expect(bdi?.getAttribute('dir')).toBe('ltr');
  });

  it('stays isolated when embedded in right-to-left text', () => {
    const fixture = TestBed.createComponent(RtlHostComponent);
    fixture.detectChanges();

    const bdi = (fixture.nativeElement as HTMLElement).querySelector('bdi');
    expect(bdi?.getAttribute('dir')).toBe('ltr');
    expect(bdi?.textContent?.trim()).toBe('XYZ-987');
    // The surrounding paragraph keeps its own direction -- the isolate
    // must not leak outward either.
    expect((fixture.nativeElement as HTMLElement).querySelector('p')?.getAttribute('dir')).toBe('rtl');
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusPill } from './status-pill';

@Component({
  imports: [StatusPill],
  template: `<app-status-pill tone="danger">Frozen</app-status-pill>`,
})
class HostComponent {}

describe('StatusPill', () => {
  it('applies the tone class and projects its content', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const span = (fixture.nativeElement as HTMLElement).querySelector('.mop-pill');
    expect(span?.classList.contains('mop-pill--danger')).toBe(true);
    expect(span?.textContent?.trim()).toBe('Frozen');
  });

  it('defaults to the neutral tone', () => {
    const fixture = TestBed.createComponent(StatusPill);
    fixture.detectChanges();

    const span = (fixture.nativeElement as HTMLElement).querySelector('.mop-pill');
    expect(span?.classList.contains('mop-pill--neutral')).toBe(true);
  });
});

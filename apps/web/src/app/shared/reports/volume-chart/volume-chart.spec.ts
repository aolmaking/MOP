import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VolumeChart, type VolumePoint } from './volume-chart';

@Component({
  imports: [VolumeChart],
  template: `<app-volume-chart [points]="points()" [granularity]="granularity()" />`,
})
class HostComponent {
  readonly points = signal<readonly VolumePoint[]>([]);
  readonly granularity = signal<'day' | 'week' | 'month'>('day');
}

const POINTS: readonly VolumePoint[] = [
  { bucket: '2026-08-17T00:00:00.000Z', created: 2, closed: 1 },
  { bucket: '2026-08-18T00:00:00.000Z', created: 8, closed: 4 },
];

describe('VolumeChart', () => {
  function host() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('says nothing happened rather than drawing an empty axis', () => {
    const fixture = host();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.plot')).toBeNull();
    expect(el.querySelector('.empty')?.textContent).toContain('No vehicles');
  });

  it('scales each column against the tallest figure in the series', () => {
    const fixture = host();
    fixture.componentInstance.points.set(POINTS);
    fixture.detectChanges();

    const bars = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.bar--created');
    expect(bars.length).toBe(2);
    // 8 is the tallest value in either series, so it defines 100%.
    expect(bars[1].style.blockSize).toBe('100%');
    expect(bars[0].style.blockSize).toBe('25%');
  });

  it('totals both series in the legend', () => {
    const fixture = host();
    fixture.componentInstance.points.set(POINTS);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.key--created')?.textContent).toContain('10');
    expect(el.querySelector('.key--closed')?.textContent).toContain('5');
  });

  it('carries the figures for each bucket in its accessible name, so the detail does not depend on hover', () => {
    const fixture = host();
    fixture.componentInstance.points.set(POINTS);
    fixture.detectChanges();

    const columns = (fixture.nativeElement as HTMLElement).querySelectorAll('.col');
    expect(columns[1].getAttribute('aria-label')).toContain('8 booked in, 4 completed');
  });

  it('reveals the period readout on focus, not only on hover', () => {
    const fixture = host();
    fixture.componentInstance.points.set(POINTS);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.readout--idle')).not.toBeNull();

    el.querySelectorAll<HTMLButtonElement>('.col')[1].dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    const readout = el.querySelector('.readout');
    expect(readout?.classList.contains('readout--idle')).toBe(false);
    expect(readout?.textContent).toContain('8 booked in');
  });

  it('labels a month series by month, not by day', () => {
    const fixture = host();
    fixture.componentInstance.points.set(POINTS);
    fixture.componentInstance.granularity.set('month');
    fixture.detectChanges();

    const ticks = (fixture.nativeElement as HTMLElement).querySelectorAll('.tick');
    // Both points fall in the same month, so a month series labels them
    // identically -- a day series never would.
    expect(ticks[0].textContent?.trim()).toBe(ticks[1].textContent?.trim());
  });
});

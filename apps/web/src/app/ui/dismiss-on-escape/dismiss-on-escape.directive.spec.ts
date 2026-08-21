import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DismissOnEscapeDirective } from './dismiss-on-escape.directive';

@Component({
  imports: [DismissOnEscapeDirective],
  template: `<div appDismissOnEscape (dismissed)="closed = closed + 1"></div>`,
})
class Host {
  closed = 0;
}

describe('DismissOnEscapeDirective', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('emits when Escape is pressed while focus is outside the host', () => {
    const fixture = render();

    // On document, not the host: focus is usually inside a child input
    // when a person reaches for Escape, and a host-only listener misses it.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.closed).toBe(1);
  });

  it('ignores every other key', () => {
    const fixture = render();

    for (const key of ['Enter', 'a', 'Tab', 'ArrowUp']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    fixture.detectChanges();

    expect(fixture.componentInstance.closed).toBe(0);
  });

  it('stops listening once the dialog is destroyed, so a later Escape does not reach a closed overlay', () => {
    const fixture = render();
    fixture.destroy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(fixture.componentInstance.closed).toBe(0);
  });
});

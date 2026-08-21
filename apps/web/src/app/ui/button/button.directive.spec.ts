import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ButtonDirective } from './button.directive';

@Component({
  imports: [ButtonDirective],
  template: `
    <button appButton variant="danger" size="small">Freeze</button>
    <button appButton>Default</button>
  `,
})
class HostComponent {}

describe('ButtonDirective', () => {
  it('applies variant and size classes from the variant/size inputs', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');

    expect([...buttons[0].classList]).toEqual(
      expect.arrayContaining(['mop-button', 'mop-button--danger', 'mop-button--small']),
    );
    expect([...buttons[1].classList]).toEqual(
      expect.arrayContaining(['mop-button', 'mop-button--primary', 'mop-button--default']),
    );
  });
});

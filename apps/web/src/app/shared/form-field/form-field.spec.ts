import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField } from './form-field';

@Component({
  imports: [FormField],
  template: `
    <app-form-field label="Workshop Name" [required]="true" [error]="error" [checking]="checking">
      <input type="text" />
    </app-form-field>
  `,
})
class HostComponent {
  error: string | null = null;
  checking = false;
}

describe('FormField', () => {
  it('shows the required marker and projects the control inside the label', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.mop-field-required')).not.toBeNull();
    expect(el.querySelector('label input')).not.toBeNull();
  });

  it('shows the error message instead of the hint when both would apply', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.error = 'This name is already taken.';
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.mop-field-error')?.textContent).toContain('already taken');
    expect(el.querySelector('.mop-field--invalid')).not.toBeNull();
  });

  it('shows a checking indicator while an async validation is in flight', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.checking = true;
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.mop-field-checking')).not.toBeNull();
  });
});

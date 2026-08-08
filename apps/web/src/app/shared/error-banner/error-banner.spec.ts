import { TestBed } from '@angular/core/testing';
import { ErrorBanner } from './error-banner';

describe('ErrorBanner', () => {
  it('renders nothing when there is no error', () => {
    const fixture = TestBed.createComponent(ErrorBanner);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.error-banner')).toBeNull();
  });

  it('renders the message when an error is set', () => {
    const fixture = TestBed.createComponent(ErrorBanner);
    fixture.componentRef.setInput('error', { code: 'unauthorized', message: 'Incorrect email or password', httpStatus: 401 });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error-banner')?.textContent).toContain('Incorrect email or password');
  });

  it('emits dismissed when the close button is clicked', () => {
    const fixture = TestBed.createComponent(ErrorBanner);
    fixture.componentRef.setInput('error', { code: 'error', message: 'Something went wrong', httpStatus: 500 });
    fixture.detectChanges();

    let dismissed = false;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed = true));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.error-banner-dismiss')?.click();

    expect(dismissed).toBe(true);
  });
});

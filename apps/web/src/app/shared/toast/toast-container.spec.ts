import { TestBed } from '@angular/core/testing';
import { ToastContainer } from './toast-container';
import { ToastService } from './toast.service';

describe('ToastContainer', () => {
  it('renders every active toast with its tone class', () => {
    const fixture = TestBed.createComponent(ToastContainer);
    const service = TestBed.inject(ToastService);
    service.show('Workshop created.', 'success', 0);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toastEl = el.querySelector('.mop-toast');
    expect(toastEl?.classList.contains('mop-toast--success')).toBe(true);
    expect(toastEl?.textContent).toContain('Workshop created.');
  });

  it('clicking dismiss removes that toast', () => {
    const fixture = TestBed.createComponent(ToastContainer);
    const service = TestBed.inject(ToastService);
    service.show('Goes away', 'neutral', 0);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.mop-toast-dismiss')?.click();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.mop-toast')).toBeNull();
  });
});

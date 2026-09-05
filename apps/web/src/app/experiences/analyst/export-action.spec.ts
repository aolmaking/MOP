import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AccessApi } from '../../identity/access.api';
import { ToastService } from '../../ui/toast/toast.service';
import { AnalystApi } from './analyst.api';
import { ExportAction } from './export-action';

describe('ExportAction', () => {
  it('is absent when the session cannot export', () => {
    const api = { exportCsv: vi.fn() };
    const access = { can: vi.fn().mockReturnValue(of(false)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalystApi, useValue: api },
        { provide: AccessApi, useValue: access },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(ExportAction);
    fixture.componentRef.setInput('sourcePage', 'OPERATIONS');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });

  it('downloads the CSV for its own category when the session can export', () => {
    const blob = new Blob(['a,b\n1,2'], { type: 'text/csv' });
    const api = { exportCsv: vi.fn().mockReturnValue(of(blob)) };
    const access = { can: vi.fn().mockReturnValue(of(true)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalystApi, useValue: api },
        { provide: AccessApi, useValue: access },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(ExportAction);
    fixture.componentRef.setInput('sourcePage', 'DECISIONS');
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button');
    expect(button).not.toBeNull();
    button!.click();

    expect(api.exportCsv).toHaveBeenCalledWith('DECISIONS');
  });

  it('shows a toast and does not throw when the export request fails', () => {
    const api = { exportCsv: vi.fn().mockReturnValue(throwError(() => new Error('forbidden'))) };
    const access = { can: vi.fn().mockReturnValue(of(true)) };
    const toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalystApi, useValue: api },
        { provide: AccessApi, useValue: access },
        { provide: ToastService, useValue: toast },
      ],
    });

    const fixture = TestBed.createComponent(ExportAction);
    fixture.componentRef.setInput('sourcePage', 'INVENTORY');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')?.click();

    expect(toast.show).toHaveBeenCalledWith(
      'Could not generate the export. Check your plan allows this category.',
      'danger',
    );
  });

  it('forwards active date range and groupBy parameters when provided', () => {
    const blob = new Blob(['a,b\n1,2'], { type: 'text/csv' });
    const api = { exportCsv: vi.fn().mockReturnValue(of(blob)) };
    const access = { can: vi.fn().mockReturnValue(of(true)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalystApi, useValue: api },
        { provide: AccessApi, useValue: access },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(ExportAction);
    fixture.componentRef.setInput('sourcePage', 'OPERATIONS');
    fixture.componentRef.setInput('params', {
      range: { from: '2026-01-01', to: '2026-01-31' },
      groupBy: 'week',
    });
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button');
    expect(button).not.toBeNull();
    button!.click();

    expect(api.exportCsv).toHaveBeenCalledWith('OPERATIONS', {
      from: '2026-01-01',
      to: '2026-01-31',
      groupBy: 'week',
    });
  });
});

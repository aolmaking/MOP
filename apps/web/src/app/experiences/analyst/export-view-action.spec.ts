import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AccessApi } from '../../identity/access.api';
import { ToastService } from '../../ui/toast/toast.service';
import { AnalystApi } from './analyst.api';
import { ExportViewAction } from './export-view-action';

function render(exportAllowed = true) {
  const api = {
    exportCsv: vi.fn().mockReturnValue(of(new Blob(['section,item,metric,value\r\n'], { type: 'text/csv' }))),
  };
  const access = { can: vi.fn().mockReturnValue(of(exportAllowed)) };
  const toast = { show: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AnalystApi, useValue: api },
      { provide: AccessApi, useValue: access },
      { provide: ToastService, useValue: toast },
    ],
  });
  const fixture = TestBed.createComponent(ExportViewAction);
  fixture.componentRef.setInput('sourcePage', 'OPERATIONS');
  fixture.componentRef.setInput('configuration', { range: { from: '2026-08-01', to: '2026-08-22' }, groupBy: 'day' });
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, api, access, toast };
}

describe('ExportViewAction', () => {
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectUrl = vi.fn().mockReturnValue('blob:mop-export');
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectUrl, configurable: true });
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    click.mockRestore();
  });

  it('exports the current page configuration as a CSV download', () => {
    const { element, api, access, toast } = render(true);

    element.querySelector<HTMLButtonElement>('button')?.click();

    expect(access.can).toHaveBeenCalledWith('analytics.export');
    expect(api.exportCsv).toHaveBeenCalledWith('OPERATIONS', {
      range: { from: '2026-08-01', to: '2026-08-22' },
      groupBy: 'day',
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mop-export');
    expect(toast.show).toHaveBeenCalledWith('Export created.', 'success');
  });

  it('renders no export command when export permission is plan-locked', () => {
    const { element, api } = render(false);

    expect(element.querySelector('button')).toBeNull();
    expect(api.exportCsv).not.toHaveBeenCalled();
  });
});

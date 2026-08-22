import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ToastService } from '../../ui/toast/toast.service';
import { AnalystApi, type AnalystSavedView } from './analyst.api';
import { SavedViewAction } from './saved-view-action';

const savedView: AnalystSavedView = {
  id: 'view1',
  name: 'Morning operations',
  sourcePage: 'OPERATIONS',
  configuration: { range: { from: '2026-08-01', to: '2026-08-22' } },
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T10:00:00.000Z',
};

describe('SavedViewAction', () => {
  it('posts the current page configuration as a named saved view', () => {
    const api = { saveView: vi.fn().mockReturnValue(of(savedView)) };
    const toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalystApi, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    });

    const fixture = TestBed.createComponent(SavedViewAction);
    fixture.componentRef.setInput('sourcePage', 'OPERATIONS');
    fixture.componentRef.setInput('defaultName', 'Operations view');
    fixture.componentRef.setInput('configuration', { range: { from: '2026-08-01', to: '2026-08-22' } });
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Operations view');
    input.value = ' Morning operations ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.actions button')?.click();

    expect(api.saveView).toHaveBeenCalledWith({
      name: 'Morning operations',
      sourcePage: 'OPERATIONS',
      configuration: { range: { from: '2026-08-01', to: '2026-08-22' } },
    });
    expect(toast.show).toHaveBeenCalledWith('Saved view created.', 'success');
  });
});

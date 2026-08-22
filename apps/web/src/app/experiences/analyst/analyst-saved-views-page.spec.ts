import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AnalystApi, type AnalystSavedView } from './analyst.api';
import { AnalystSavedViewsPage } from './analyst-saved-views-page';

function view(overrides: Partial<AnalystSavedView> = {}): AnalystSavedView {
  return {
    id: 'view1',
    name: 'Morning operations',
    sourcePage: 'OPERATIONS',
    configuration: { range: { from: '2026-08-01', to: '2026-08-22' } },
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}

function render(items: readonly AnalystSavedView[] = [view()]) {
  const api = {
    savedViews: vi.fn().mockReturnValue(of({ items })),
    renameView: vi.fn().mockImplementation((id: string, name: string) => of(view({ id, name }))),
    deleteView: vi.fn().mockReturnValue(of({ ok: true as const })),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AnalystApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(AnalystSavedViewsPage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, api };
}

describe('AnalystSavedViewsPage', () => {
  it('renders saved views with open links and the explicit export blocker', () => {
    const { element } = render();

    expect(element.textContent).toContain('Morning operations');
    expect(element.textContent).toContain('Operations');
    expect(element.querySelector('a')?.getAttribute('href')).toContain('/analyst/operations');
    expect(element.textContent).toContain('Allowed Exports');
  });

  it('renames a saved view without changing its configuration', () => {
    const { fixture, element, api } = render();

    [...element.querySelectorAll('button')].find((button) => button.textContent?.includes('Rename'))?.click();
    fixture.detectChanges();

    const input = element.querySelector('input') as HTMLInputElement;
    input.value = 'Updated operations';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    [...element.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save')?.click();
    fixture.detectChanges();

    expect(api.renameView).toHaveBeenCalledWith('view1', 'Updated operations');
    expect(element.textContent).toContain('Updated operations');
  });

  it('deletes only the saved configuration row', () => {
    const { fixture, element, api } = render();

    [...element.querySelectorAll('button')].find((button) => button.textContent?.includes('Delete'))?.click();
    fixture.detectChanges();

    expect(api.deleteView).toHaveBeenCalledWith('view1');
    expect(element.textContent).toContain('No saved views yet');
  });
});

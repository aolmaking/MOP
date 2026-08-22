import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AnalystApi, type AnalyticsHomeTile } from './analyst.api';
import { AnalystHomePage } from './analyst-home-page';

function render(tiles: readonly AnalyticsHomeTile[]) {
  const api = {
    home: vi.fn().mockReturnValue(of({ tiles })),
    savedViews: vi.fn().mockReturnValue(of({ items: [] })),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AnalystApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(AnalystHomePage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, api };
}

describe('AnalystHomePage', () => {
  it('renders the Feature Adoption home tile as a link to its analytical page', () => {
    const { element, api } = render([
      {
        page: 'feature-adoption',
        label: 'Feature Adoption',
        metrics: [
          { label: 'Trackable features', value: '3' },
          { label: 'Enabled with zero usage', value: '1' },
        ],
      },
    ]);

    const link = element.querySelector<HTMLAnchorElement>('.tile');
    expect(element.textContent).toContain('Feature Adoption');
    expect(element.textContent).toContain('Trackable features');
    expect(link?.getAttribute('href')).toContain('/analyst/feature-adoption');
    expect(api.savedViews).toHaveBeenCalled();
  });
});

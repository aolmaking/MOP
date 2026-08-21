import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MyAssets } from './my-assets';
import { CustomerPortalApi, type PortalAsset } from './customer-portal.api';

function asset(overrides: Partial<PortalAsset> = {}): PortalAsset {
  return {
    id: 'asset-1',
    category: 'CARS',
    plateNumber: 'ABC 1234',
    vinOrChassisNumber: null,
    ownedSince: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function render(response: readonly PortalAsset[] | { readonly error: unknown }) {
  const api = { assets: () => ('error' in response ? throwError(() => response.error) : of(response)) };
  TestBed.configureTestingModule({ providers: [{ provide: CustomerPortalApi, useValue: api }] });
  const fixture = TestBed.createComponent(MyAssets);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('MyAssets', () => {
  it('shows the empty state when nothing is linked yet', () => {
    const { element } = render([]);
    expect(element.textContent).toContain('Nothing here yet');
  });

  it('renders one card per owned asset', () => {
    const { element } = render([asset(), asset({ id: 'asset-2', plateNumber: 'XYZ 999' })]);
    expect(element.querySelectorAll('.card').length).toBe(2);
  });

  it('renders the identifier inside a bidi isolate so a plate number cannot reverse', () => {
    const { element } = render([asset({ plateNumber: 'XYZ-987' })]);

    const bdi = element.querySelector('bdi');
    expect(bdi?.textContent?.trim()).toBe('XYZ-987');
  });

  it('falls back to the VIN when there is no plate', () => {
    const { element } = render([asset({ plateNumber: null, vinOrChassisNumber: 'VIN123' })]);
    expect(element.textContent).toContain('VIN123');
  });

  it('shows plain-language wording on 403', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });
    expect(element.textContent).toContain("can't open this");
  });
});

import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SafeHistory } from './safe-history';
import { CustomerPortalApi, type PortalAsset, type SafeHistoryEntry } from './customer-portal.api';

function entry(overrides: Partial<SafeHistoryEntry> = {}): SafeHistoryEntry {
  return {
    id: 'hist-1',
    assetId: 'asset-1',
    summary: 'Brake pads replaced, front axle',
    serviceDate: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

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

function render(
  entriesResponse: readonly SafeHistoryEntry[] | { readonly error: unknown },
  assets: readonly PortalAsset[] = [asset()],
) {
  const api = {
    safeHistory: () => ('error' in entriesResponse ? throwError(() => entriesResponse.error) : of(entriesResponse)),
    assets: () => of(assets),
  };
  TestBed.configureTestingModule({ providers: [{ provide: CustomerPortalApi, useValue: api }] });
  const fixture = TestBed.createComponent(SafeHistory);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('SafeHistory', () => {
  it('shows the empty state when nothing has been recorded', () => {
    const { element } = render([]);
    expect(element.textContent).toContain('No service history yet');
  });

  it('labels an entry with the asset plate rather than its raw id', () => {
    const { element } = render([entry()]);

    expect(element.textContent).toContain('ABC 1234');
    expect(element.textContent).not.toContain('asset-1');
  });

  it('falls back to a generic label for an asset not in the current list', () => {
    const { element } = render([entry({ assetId: 'gone' })], []);
    expect(element.textContent).toContain('Vehicle');
  });

  it('shows the plain-language summary, not raw technician notes', () => {
    const { element } = render([entry({ summary: 'Brake pads replaced, front axle' })]);
    expect(element.textContent).toContain('Brake pads replaced, front axle');
  });
});

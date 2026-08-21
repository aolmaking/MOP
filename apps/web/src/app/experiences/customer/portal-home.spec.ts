import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PortalHome } from './portal-home';
import { CustomerPortalApi, type PortalHome as HomeData } from './customer-portal.api';

function data(overrides: Partial<HomeData> = {}): HomeData {
  return {
    assetCount: 1,
    currentServiceCount: 0,
    pendingDecisions: 0,
    openInvoiceBalance: '0.00',
    recentActivity: [],
    ...overrides,
  };
}

function render(response: Partial<HomeData> | { readonly error: unknown }) {
  const api = { home: () => ('error' in response ? throwError(() => response.error) : of(data(response))) };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CustomerPortalApi, useValue: api }] });
  const fixture = TestBed.createComponent(PortalHome);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('PortalHome', () => {
  it('leads with the pending-decision banner when one is waiting', () => {
    const { element } = render({ pendingDecisions: 2 });

    const banner = element.querySelector('.decision-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('decisions are waiting');
  });

  it('omits the decision banner when nothing is pending', () => {
    const { element } = render({ pendingDecisions: 0 });
    expect(element.querySelector('.decision-banner')).toBeNull();
  });

  it('shows the three orientation tiles', () => {
    const { element } = render({ assetCount: 2, currentServiceCount: 1, openInvoiceBalance: '150.00' });

    expect(element.querySelectorAll('.tile').length).toBe(3);
    expect(element.textContent).toContain('150.00');
  });

  it('shows a distinct no-access state on 403, in plain language', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });

    expect(element.textContent).toContain("can't open your account");
    expect(element.textContent).not.toContain('forbidden');
  });

  it('shows an error state with a retry control', () => {
    const { element } = render({ error: { httpStatus: 500, code: 'server_error', message: 'Boom.' } });
    expect(element.textContent).toContain('Try again');
  });
});

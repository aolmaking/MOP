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

  it('renders the report issue trigger button', () => {
    const { element } = render({ assetCount: 1 });
    const btn = element.querySelector('#btn-report-issue');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('Report an Issue');
  });

  it('shows live tracking section with active status when services exist', () => {
    const api = {
      home: () => of(data({ currentServiceCount: 1 })),
      currentService: () => of([{ workOrderId: 'wo-1', status: 'UNDER_INSPECTION', asset: 'ABC 1234', createdAt: '2026-09-01T00:00:00Z' }]),
      pendingDecisions: () => of([]),
      assets: () => of([]),
      journey: () => of({ headline: 'Diagnostic underway', stages: [], currentStageIndex: 1, durationLabel: '10m' }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CustomerPortalApi, useValue: api }] });
    const fixture = TestBed.createComponent(PortalHome);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.tracker-card')).not.toBeNull();
    expect(element.textContent).toContain('ABC 1234');
    expect(element.textContent).toContain('In-bay diagnostic & inspection');
  });

  it('renders the Buy Parts (POS) action button and over-the-counter quick card', () => {
    const { element } = render({ assetCount: 1 });
    const posBtn = element.querySelector('#btn-customer-pos');
    expect(posBtn).not.toBeNull();
    expect(posBtn?.textContent).toContain('Buy Parts (POS)');

    const posCard = element.querySelector('#btn-customer-pos-card');
    expect(posCard).not.toBeNull();
    expect(posCard?.textContent).toContain('Open Parts POS');
  });
});

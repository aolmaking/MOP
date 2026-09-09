import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PortalHome } from './portal-home';
import { CustomerPortalApi, type PortalHome as HomeData } from './customer-portal.api';
import { journeyFixture } from '../../domain/journey/journey.fixture';

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

  it('shows the orientation tiles', () => {
    const { element } = render({ assetCount: 2, currentServiceCount: 1, openInvoiceBalance: '150.00' });

    // Four now: vehicles, in service, the parts counter, balance owed.
    expect(element.querySelectorAll('.tile').length).toBe(4);
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
      // The shared fixture, not a hand-written literal. This built
      // `currentStageIndex`/`durationLabel`, a shape the journey contract
      // stopped using when it grew `current`, and WorkflowStrip then crashed
      // on `j.current.label`. A fixture that follows the type cannot drift
      // like that without failing to compile.
      journey: () => of(journeyFixture({ headline: 'Diagnostic underway' })),
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
    expect(posBtn?.getAttribute('href')).toBe('/customer/pos');

    const posCard = element.querySelector('#btn-customer-pos-card');
    expect(posCard).not.toBeNull();
    expect(posCard?.textContent).toContain('Open Parts POS');
  });

  /**
   * The customer's one outbound action.
   *
   * `POST /customer-portal/service-requests` and `CustomerPortalApi.reportIssue`
   * both existed and nothing called either, so the portal could show a repair
   * and take money for one but could not be used to ask for one.
   */
  describe('reporting an issue', () => {
    function renderWithAssets(assets: { id: string; plateNumber: string | null }[], reportIssue = vi.fn(() => of({ workOrderId: 'wo-new', status: 'REGISTERED', assetId: 'a1' }))) {
      const api = {
        home: () => of(data({ assetCount: assets.length })),
        currentService: () => of([]),
        pendingDecisions: () => of([]),
        assets: () => of(assets),
        journey: () => of(journeyFixture()),
        reportIssue,
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CustomerPortalApi, useValue: api }] });
      const fixture = TestBed.createComponent(PortalHome);
      fixture.detectChanges();
      return { fixture, element: fixture.nativeElement as HTMLElement, reportIssue };
    }

    const open = (fixture: { detectChanges(): void }, element: HTMLElement) => {
      (element.querySelector('#btn-report-issue') as HTMLButtonElement).click();
      fixture.detectChanges();
    };

    const type = (fixture: { detectChanges(): void }, element: HTMLElement, text: string) => {
      const box = element.querySelector('.report-textarea') as HTMLTextAreaElement;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    it('will not send an empty complaint', () => {
      const { fixture, element } = renderWithAssets([{ id: 'a1', plateNumber: 'ABC 1234' }]);
      open(fixture, element);

      const submit = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Send to the workshop'));
      expect((submit as HTMLButtonElement).disabled).toBe(true);
    });

    it('sends what the customer typed, against the vehicle they own', () => {
      const { fixture, element, reportIssue } = renderWithAssets([{ id: 'a1', plateNumber: 'ABC 1234' }]);
      open(fixture, element);
      type(fixture, element, 'Squeaking noise when braking');

      const submit = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Send to the workshop'));
      (submit as HTMLButtonElement).click();

      // One vehicle, so no choice to put to them; several, and the page must
      // not guess which car they meant.
      expect(reportIssue).toHaveBeenCalledWith({ complaint: 'Squeaking noise when braking', assetId: 'a1' });
    });

    it('does not pick a vehicle for someone who owns more than one', () => {
      const { fixture, element, reportIssue } = renderWithAssets([
        { id: 'a1', plateNumber: 'ABC 1234' },
        { id: 'a2', plateNumber: 'XYZ 9876' },
      ]);
      open(fixture, element);
      type(fixture, element, 'Warning light on the dash');

      const submit = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Send to the workshop'));
      (submit as HTMLButtonElement).click();

      expect(reportIssue).toHaveBeenCalledWith({ complaint: 'Warning light on the dash' });
    });

    it('confirms receipt rather than leaving the customer guessing', () => {
      const { fixture, element } = renderWithAssets([{ id: 'a1', plateNumber: 'ABC 1234' }]);
      open(fixture, element);
      type(fixture, element, 'Squeaking noise when braking');
      ([...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Send to the workshop')) as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(element.textContent).toContain('we have your request');
    });

    it('keeps the failure on the page instead of swallowing it', () => {
      const { fixture, element } = renderWithAssets(
        [{ id: 'a1', plateNumber: 'ABC 1234' }],
        vi.fn(() => throwError(() => ({ message: 'That workshop is not taking requests.' }))),
      );
      open(fixture, element);
      type(fixture, element, 'Squeaking noise when braking');
      ([...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Send to the workshop')) as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(element.textContent).toContain('That workshop is not taking requests.');
    });
  });
});

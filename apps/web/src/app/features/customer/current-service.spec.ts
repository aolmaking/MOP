import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CurrentService, CUSTOMER_STATUS_LABELS, CUSTOMER_VISIBLE_STATUSES } from './current-service';
import { CustomerPortalApi, type CurrentServiceItem } from './customer-portal.api';

function item(overrides: Partial<CurrentServiceItem> = {}): CurrentServiceItem {
  return {
    workOrderId: 'wo-1',
    status: 'IN_PROGRESS',
    asset: 'ABC 1234',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function render(response: readonly CurrentServiceItem[] | { readonly error: unknown }) {
  const api = {
    currentService: () => ('error' in response ? throwError(() => response.error) : of(response)),
    // The strip loads per job; failing it must not break the page, which
    // is why the component swallows the error -- stub it so the tests
    // exercise the succeeding path rather than that fallback.
    journey: () => of({ stages: [], finished: false, waiting: false, headline: 'Your vehicle is being worked on.' }),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: CustomerPortalApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(CurrentService);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('CurrentService', () => {
  it('shows the no-active-service state, distinct from an error', () => {
    const { element } = render([]);
    expect(element.textContent).toContain('No active service right now');
  });

  it('translates a raw status enum into plain words', () => {
    const { element } = render([item({ status: 'WAITING_PARTS' })]);

    expect(element.textContent).toContain('Waiting for parts');
    expect(element.textContent).not.toContain('WAITING_PARTS');
  });

  it('flags a job waiting on the customer as needing them', () => {
    const { element } = render([item({ status: 'AWAITING_CUSTOMER_APPROVAL' })]);

    expect(element.querySelector('.job--needs-you')).not.toBeNull();
    expect(element.textContent).toContain('Needs you');
  });

  it('does not flag an ordinary in-progress job', () => {
    const { element } = render([item({ status: 'IN_PROGRESS' })]);
    expect(element.querySelector('.job--needs-you')).toBeNull();
  });
});

describe('customer status wording', () => {
  /**
   * This page is read by a paying customer, and the label lookup falls
   * back to the lowercased enum. CLOSED and CANCELLED were missing, so a
   * finished repair was reported as "closed" -- the workshop's word for a
   * record, not a person's word for their car being ready.
   *
   * Checked per status so a status added later fails here rather than
   * appearing as "ready_for_qc" on a customer's screen.
   */
  it.each(CUSTOMER_VISIBLE_STATUSES)('gives %s wording written for a customer', (status) => {
    const label = CUSTOMER_STATUS_LABELS[status];

    expect(label).toBeDefined();
    expect(label).not.toContain('_');
    expect(label.toUpperCase()).not.toBe(label);
    // Not the enum with its underscores swapped for spaces -- but only
    // where that would actually read as machine output. A single-word
    // status like CANCELLED maps to "Cancelled" because that genuinely is
    // the word a customer wants; it is the multi-word ones that turn into
    // "ready for qc" and give the game away.
    if (status.includes('_')) {
      expect(label.toLowerCase()).not.toBe(status.toLowerCase().replace(/_/g, ' '));
    }
  });
});

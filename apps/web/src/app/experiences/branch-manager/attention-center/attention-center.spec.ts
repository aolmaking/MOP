import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AttentionCenter } from './attention-center';
import { AttentionApi, type AttentionCenterResponse, type AttentionItem } from './attention.api';

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: 'WAITING_PARTS:1',
    kind: 'WAITING_PARTS',
    workOrderId: 'wo-1',
    identifier: 'ABC 1234',
    customerName: 'Ahmed Salah',
    branchId: 'branch-1',
    reason: 'Waiting for a part — 2 days',
    waitingSince: '2026-08-07T10:00:00.000Z',
    rank: { tier: 5, waitingHours: 48, escalated: false, score: 4952 },
    primaryAction: 'CHECK_PARTS',
    ...overrides,
  };
}

function render(response: Partial<AttentionCenterResponse> | { error: unknown }) {
  const api = {
    attention: () =>
      'error' in response ? throwError(() => response.error) : of({ items: [], counts: {}, generatedAt: '', ...response }),
  };

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AttentionApi, useValue: api }],
  });

  const fixture = TestBed.createComponent(AttentionCenter);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('AttentionCenter — the six states', () => {
  it('shows ranked items when something needs attention', () => {
    const { element } = render({ items: [item()], counts: { WAITING_PARTS: 1 } });

    expect(element.querySelectorAll('.queue-row').length).toBe(1);
    // A sentence, not a badge -- the manager should be able to disagree
    // with our ranking, which means seeing what it was based on.
    expect(element.textContent).toContain('Waiting for a part — 2 days');
  });

  it('shows a calm empty state, not an error, when nothing is stuck', () => {
    // "Nothing needs you" is a good day. It must not look like a failure.
    const { element } = render({ items: [], counts: {} });

    expect(element.querySelector('.state--calm')).not.toBeNull();
    expect(element.textContent).toContain('Nothing needs you right now');
    expect(element.querySelector('.queue-row')).toBeNull();
  });

  it('shows a distinct no-access state with no retry control', () => {
    // Retrying a 403 will never help, so offering the button would lie.
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });

    expect(element.querySelector('.state--quiet')).not.toBeNull();
    expect(element.textContent).toContain("don't have access");
    expect(element.textContent).not.toContain('Try again');
  });

  it('shows an error state WITH a retry control', () => {
    const { element } = render({ error: { httpStatus: 500, code: 'server_error', message: 'Boom.' } });

    expect(element.querySelector('.state-error')).not.toBeNull();
    expect(element.textContent).toContain('Try again');
    // ...and it is not confused with the empty state.
    expect(element.querySelector('.state--calm')).toBeNull();
  });
});

describe('AttentionCenter — ranking made visible', () => {
  it('marks only tier 1 as critical, so the ranking stays readable', () => {
    // If every row were coloured, the ordering would be invisible -- and
    // the ordering is the entire point of the page.
    const { element } = render({
      items: [
        item({
          id: 'crit',
          kind: 'CRITICAL_REJECTION_UNACKNOWLEDGED',
          rank: { tier: 1, waitingHours: 3, escalated: false, score: 997 },
        }),
        item({ id: 'parts' }),
      ],
    });

    const rows = element.querySelectorAll('.queue-row');
    expect(rows[0]?.classList.contains('queue-row--critical')).toBe(true);
    expect(rows[1]?.classList.contains('queue-row--critical')).toBe(false);
  });

  it('preserves the server order rather than re-sorting', () => {
    // Ranking is computed once, server-side, so this page and any other
    // view can never disagree about what is most urgent.
    const { element } = render({
      items: [item({ id: 'first', identifier: 'FIRST-1' }), item({ id: 'second', identifier: 'SECOND-2' })],
    });

    const identifiers = [...element.querySelectorAll('bdi')].map((node) => node.textContent?.trim());
    expect(identifiers).toEqual(['FIRST-1', 'SECOND-2']);
  });

  it('renders the identifier inside a bidi isolate so it cannot reverse', () => {
    // A plate number displayed backwards sends a technician to the wrong
    // car -- an operational error, not a cosmetic one.
    const { element } = render({ items: [item({ identifier: 'XYZ-987' })] });

    const bdi = element.querySelector('bdi');
    expect(bdi?.getAttribute('dir')).toBe('ltr');
    expect(bdi?.textContent?.trim()).toBe('XYZ-987');
  });

  /**
   * Still the original point -- the action is named as what the MANAGER
   * does, not as a status. The wording moved from "Send reminder" to
   * "Chase customer" because there is no messaging sender (T4 is
   * deferred) and the old label offered to send something the product
   * cannot send. It is an anchor now rather than a button, because it
   * navigates to where the chasing happens instead of claiming to have
   * chased.
   */
  it('offers the action that unsticks the job, phrased as what the manager does', () => {
    const { element } = render({ items: [item({ primaryAction: 'CHASE_CUSTOMER' })] });

    expect(element.querySelector('.queue-actions .queue-act')?.textContent?.trim()).toBe('Chase customer');
  });
});

describe('AttentionCenter — the watch list', () => {
  it('shows only kinds that actually have items', () => {
    // A tile reading zero invites a click that leads nowhere.
    const { element } = render({
      items: [item()],
      counts: { WAITING_PARTS: 3, TECHNICIAN_BLOCKED: 0 },
    });

    const labels = [...element.querySelectorAll('.watch-label')].map((node) => node.textContent?.trim());
    expect(labels).toContain('Waiting on parts');
    expect(labels).not.toContain('Blocked technicians');
  });

  it('makes every tile actionable rather than a dead-end number', () => {
    const { element } = render({ items: [item()], counts: { WAITING_PARTS: 3 } });

    const tiles = element.querySelectorAll('.watch-tile');
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) expect(tile.tagName).toBe('BUTTON');
  });

  it('states counts in plain words, never as raw enum keys', () => {
    const { element } = render({ items: [item()], counts: { CUSTOMER_APPROVAL_WAITING: 2 } });

    expect(element.textContent).toContain('Waiting on customers');
    expect(element.textContent).not.toContain('CUSTOMER_APPROVAL_WAITING');
  });

  describe('row actions actually go somewhere', () => {
    const actionLink = (element: HTMLElement) =>
      [...element.querySelectorAll('a.queue-act')][0] as HTMLAnchorElement | undefined;

    /**
     * This button was an explicit no-op for two phases -- honestly
     * marked as one while the surfaces it needed were unbuilt, and left
     * behind once they existed. Acceptance criterion 3 says every
     * visible button on an operational page performs its action, and
     * this is the manager's landing page.
     */
    it('sends a chase to the approvals list, where the phone number is', () => {
      const { element } = render({ items: [item({ primaryAction: 'CHASE_CUSTOMER' })] });

      expect(actionLink(element)?.getAttribute('href')).toBe('/branch/approvals');
    });

    it('sends a payment to the delivery board, which carries the Take payment link', () => {
      const { element } = render({ items: [item({ primaryAction: 'TAKE_PAYMENT' })] });

      expect(actionLink(element)?.getAttribute('href')).toBe('/branch/delivery');
    });

    it('sends everything else to the job itself', () => {
      const { element } = render({ items: [item({ primaryAction: 'RESOLVE_BLOCKER', workOrderId: 'wo-7' })] });

      expect(actionLink(element)?.getAttribute('href')).toBe('/branch/work-orders/wo-7');
    });

    /**
     * There is no messaging sender -- T4 is deferred -- so a button
     * offering to send a reminder promises something the product cannot
     * do.
     */
    it('does not offer to send a reminder it cannot send', () => {
      const { element } = render({ items: [item({ primaryAction: 'CHASE_CUSTOMER' })] });

      expect(element.textContent).not.toContain('Send reminder');
      expect(actionLink(element)?.textContent?.trim()).toBe('Chase customer');
    });
  });

  describe('the watch tiles filter the queue', () => {
    it('narrows to one kind, says so, and can be cleared', () => {
      const { fixture, element } = render({
        items: [item({ id: 'a', kind: 'WAITING_PARTS' }), item({ id: 'b', kind: 'READY_UNPAID', workOrderId: 'wo-2' })],
        counts: { WAITING_PARTS: 1, READY_UNPAID: 1 },
      });
      expect(element.querySelectorAll('.queue-row').length).toBe(2);

      const tile = [...element.querySelectorAll('.watch-tile')][0] as HTMLButtonElement;
      tile.click();
      fixture.detectChanges();

      expect(element.querySelectorAll('.queue-row').length).toBe(1);
      // A filtered queue that does not say so looks empty for no reason.
      expect(element.querySelector('.queue-filter')).toBeTruthy();

      (element.querySelector('.queue-filter-clear') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelectorAll('.queue-row').length).toBe(2);
    });

    it('treats a second tap on the same tile as clearing it', () => {
      const { fixture, element } = render({
        items: [item({ id: 'a', kind: 'WAITING_PARTS' }), item({ id: 'b', kind: 'READY_UNPAID', workOrderId: 'wo-2' })],
        counts: { WAITING_PARTS: 1, READY_UNPAID: 1 },
      });

      const tile = [...element.querySelectorAll('.watch-tile')][0] as HTMLButtonElement;
      tile.click();
      fixture.detectChanges();
      tile.click();
      fixture.detectChanges();

      expect(element.querySelectorAll('.queue-row').length).toBe(2);
    });
  });
});
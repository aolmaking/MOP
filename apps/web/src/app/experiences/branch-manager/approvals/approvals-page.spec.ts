import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ApprovalsPage } from './approvals-page';
import { ApprovalsApi, type ApprovalRow, type ApprovalsResult } from './approvals.api';

function row(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    requestId: 'r1',
    workOrderId: 'wo1',
    identifier: 'DEMO-1188',
    customerName: 'Sara Nabil',
    customerPhone: '01002030424',
    status: 'SENT',
    waitingHours: 3,
    sent: true,
    itemCount: 3,
    decidedCount: 1,
    pendingTotal: '1800.00',
    hasCritical: false,
    ...overrides,
  };
}

function render(result: Partial<ApprovalsResult> | { error: unknown }) {
  const api = {
    approvals: vi.fn(() =>
      'error' in result ? throwError(() => result.error) : of({ waiting: [], unsent: [], ...result }),
    ),
    cancelApproval: vi.fn(() => of({ ok: true as const })),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ApprovalsApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(ApprovalsPage);
  fixture.detectChanges();
  return { fixture, api, element: fixture.nativeElement as HTMLElement };
}

describe('ApprovalsPage', () => {
  it('separates our unsent drafts from the customer chase list', () => {
    // They look identical in the database and call for opposite actions:
    // send it, versus chase them.
    const { element } = render({
      waiting: [row()],
      unsent: [row({ requestId: 'r2', sent: false })],
    });

    const titles = [...element.querySelectorAll('.band-title')].map((n) => n.textContent?.trim());
    expect(titles).toEqual(['Not sent yet', 'Waiting on the customer']);
  });

  it('puts our own delay first, because it is cheaper to fix than chasing', () => {
    const { element } = render({ waiting: [row()], unsent: [row({ requestId: 'r2', sent: false })] });

    const first = element.querySelector('.band-title')?.textContent?.trim();
    expect(first).toBe('Not sent yet');
  });

  it('shows the phone number on the row, since dialling is the action', () => {
    const { element } = render({ waiting: [row()] });

    expect(element.querySelector('.row-phone')?.textContent?.trim()).toBe('01002030424');
  });

  it('marks a safety-critical request over an overdue one', () => {
    // Safety wins over age; both edges cannot show at once.
    const { element } = render({ waiting: [row({ hasCritical: true, waitingHours: 100 })] });

    const item = element.querySelector('.row');
    expect(item?.classList.contains('row--critical')).toBe(true);
    expect(element.querySelector('.row-flag')?.textContent?.trim()).toBe('safety-critical');
  });

  it('prints the pending total exactly as the API sent it', () => {
    const { element } = render({ waiting: [row({ pendingTotal: '1800.50' })] });

    expect(element.querySelector('.row-total')?.textContent?.trim()).toBe('1800.50');
  });

  it('shows a calm empty state when nobody needs chasing', () => {
    const { element } = render({ waiting: [], unsent: [] });

    expect(element.textContent).toContain('Nobody to chase');
  });

  it('rounds waits to words past a day', () => {
    const { element } = render({ waiting: [row({ waitingHours: 74 })] });

    expect(element.querySelector('.row-waited')?.textContent?.trim()).toBe('3 days');
  });

  describe('withdrawing an unanswered ask (M-3)', () => {
    const press = (element: HTMLElement, label: string) => {
      const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
      if (!button) throw new Error(`no button labelled "${label}"`);
      (button as HTMLButtonElement).click();
    };

    /**
     * The deadlock guard. Without a way out, an ask the customer never
     * answers holds the job at AWAITING_CUSTOMER_APPROVAL until the
     * read-computed expiry passes, and the car sits with it.
     */
    it('withdraws the request and re-reads the board', () => {
      const { api, fixture, element } = render({ waiting: [row()] });
      const readsBefore = api.approvals.mock.calls.length;

      press(element, 'Withdraw');
      fixture.detectChanges();
      press(element, 'Yes, withdraw it');
      fixture.detectChanges();

      expect(api.cancelApproval).toHaveBeenCalledWith('r1');
      // Cancelling frees the job to move, and where it moved is the
      // server's answer -- not something to patch in locally.
      expect(api.approvals.mock.calls.length).toBeGreaterThan(readsBefore);
    });

    /**
     * Not undoable, and the customer may be about to answer. One tap
     * must not withdraw an ask.
     */
    it('asks before it acts', () => {
      const { api, element } = render({ waiting: [row()] });

      press(element, 'Withdraw');

      expect(api.cancelApproval).not.toHaveBeenCalled();
    });

    it('keeps a refusal on the page rather than in a toast', () => {
      const { api, fixture, element } = render({ waiting: [row()] });
      api.cancelApproval.mockReturnValueOnce(
        throwError(() => ({ httpStatus: 409, code: 'already_resolved', message: 'The customer has already answered.' })),
      );

      press(element, 'Withdraw');
      fixture.detectChanges();
      press(element, 'Yes, withdraw it');
      fixture.detectChanges();

      expect(element.querySelector('.band-error')?.textContent).toContain('already answered');
    });
  });
});
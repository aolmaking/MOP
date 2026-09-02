import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { DeliveryPage } from './delivery-page';
import { AccessApi } from '../../../identity/access.api';
import { ApprovalsApi, type DeliveryBoard, type DeliveryCandidate } from './approvals.api';

function candidate(overrides: Partial<DeliveryCandidate> = {}): DeliveryCandidate {
  return {
    workOrderId: 'wo1',
    identifier: 'DEMO-4471',
    customerName: 'Mona Adel',
    customerPhone: '01002030424',
    status: 'READY_FOR_DELIVERY',
    waitingHours: 3,
    canLeave: true,
    blockedBy: [],
    unsettledInvoiceId: null,
    ...overrides,
  };
}

function render(board: Partial<DeliveryBoard> | { error: unknown }, mayTakePayment = true) {
  const api = {
    delivery: () => ('error' in board ? throwError(() => board.error) : of({ ready: [], held: [], ...board })),
  };
  const access = { can: vi.fn(() => of(mayTakePayment)) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApprovalsApi, useValue: api },
      { provide: AccessApi, useValue: access },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryPage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('DeliveryPage', () => {
  it('lists held cars before ready ones', () => {
    // "Ready" needs no attention. The value of the page is the other list.
    const { element } = render({
      ready: [candidate({ workOrderId: 'ok' })],
      held: [candidate({ workOrderId: 'stuck', canLeave: false, blockedBy: ['The invoice has not been issued.'] })],
    });

    const titles = [...element.querySelectorAll('.band-title')].map((n) => n.textContent?.trim());
    expect(titles).toEqual(['Held', 'Can leave']);
  });

  it('shows every reason a car is held, not just the first', () => {
    // A manager who clears one blocker and finds another behind it stops
    // trusting the page.
    const { element } = render({
      held: [
        candidate({
          canLeave: false,
          blockedBy: ['The invoice has not been issued.', 'Payment has not been settled.'],
        }),
      ],
    });

    const reasons = [...element.querySelectorAll('.reason')].map((n) => n.textContent?.trim());
    expect(reasons?.length).toBe(2);
    expect(reasons[1]).toContain('Payment has not been settled');
  });

  it('states reasons in sentences, never as gate keys', () => {
    // "invoice.issued" tells a manager nothing they can act on.
    const { element } = render({
      held: [candidate({ canLeave: false, blockedBy: ['The invoice has not been issued.'] })],
    });

    expect(element.textContent).not.toContain('invoice.issued');
    expect(element.textContent).toContain('The invoice has not been issued.');
  });

  it('gives a ready car no colour, per the design language', () => {
    const { element } = render({ ready: [candidate()] });

    expect(element.querySelector('.row--ready')).not.toBeNull();
    expect(element.querySelector('.row--held')).toBeNull();
  });

  it('separates nothing-to-deliver from a failure', () => {
    const { element } = render({ ready: [], held: [] });

    expect(element.textContent).toContain('Nothing waiting to leave');
    expect(element.textContent).not.toContain('Try again');
  });

  it('shows the no-access state with no retry control', () => {
    const { element } = render({ error: { httpStatus: 403, code: 'forbidden', message: 'no' } });

    expect(element.textContent).toContain("don't have access");
    expect(element.textContent).not.toContain('Try again');
  });

  describe('taking payment (M-4)', () => {
    const heldForMoney = () =>
      candidate({
        workOrderId: 'unpaid',
        canLeave: false,
        blockedBy: ['The invoice has not been settled.'],
        unsettledInvoiceId: 'inv-9',
      });

    it('offers the way out of a held row, not just the reason', () => {
      const { element } = render({ held: [heldForMoney()] });

      const link = [...element.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Take payment');
      expect(link).toBeTruthy();
      // Straight at the existing Take Payment page, keyed by the invoice.
      expect(link?.getAttribute('href')).toBe('/branch/payments/inv-9');
    });

    /**
     * `default-role-permissions.ts` withholds `finance.payment.record`
     * from BRANCH_MANAGER, and this is a manager's page. A button that
     * greets half its audience with a 403 is worse than no button.
     */
    it('hides it from someone who may not record a payment', () => {
      const { element } = render({ held: [heldForMoney()] }, false);

      expect([...element.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Take payment')).toBe(false);
    });

    it('offers nothing when the money is already settled', () => {
      const { element } = render({
        held: [candidate({ canLeave: false, blockedBy: ['Another gate.'], unsettledInvoiceId: null })],
      });

      expect([...element.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Take payment')).toBe(false);
    });
  });
});
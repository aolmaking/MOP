import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { DeliveryPage } from './delivery-page';
import { AccessApi } from '../../../identity/access.api';
import { ApprovalsApi, type DeliveryBoard, type DeliveryCandidate } from './approvals.api';
import { FinanceApi } from '../../finance/finance.api';

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
    invoiceId: null,
    ...overrides,
  };
}

function render(
  board: Partial<DeliveryBoard> | { error: unknown },
  mayTakePayment = true,
  finance: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  const api = {
    delivery: () => ('error' in board ? throwError(() => board.error) : of({ ready: [], held: [], ...board })),
  };
  const access = { can: vi.fn(() => of(mayTakePayment)) };
  // Defaults for everything the page can call, so a test that exercises one
  // of them does not have to restate the rest.
  finance = {
    issueInvoice: vi.fn(() => of({})),
    jobTotal: vi.fn(() =>
      of({
        subtotal: '900.00',
        discount: '0.00',
        tax: '126.00',
        total: '1026.00',
        lines: [{ id: 'l1', name: 'Front brake pads', quantity: 2, unitPrice: '350.00', labour: '200.00', total: '900.00' }],
      }),
    ),
    requestDiscount: vi.fn(() => of({ id: 'dis1' })),
    ...finance,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApprovalsApi, useValue: api },
      { provide: AccessApi, useValue: access },
      { provide: FinanceApi, useValue: finance },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryPage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, finance };
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

  /**
   * The step before the money, and the one the product did not have.
   *
   * Nothing anywhere in the web app called
   * `POST /finance/work-orders/:id/invoice`. So a job that reached
   * PAYMENT_PENDING was stuck: no invoice to pay against, "Take payment"
   * correctly hidden because there was no invoice id, and DELIVER gated on
   * `invoice.issued`. No work order could reach CLOSED through the product.
   */
  describe('issuing the invoice', () => {
    const awaitingInvoice = () =>
      candidate({
        canLeave: false,
        status: 'PAYMENT_PENDING',
        blockedBy: ['The final invoice has not been issued.'],
        unsettledInvoiceId: null,
        invoiceId: null,
      });

    function buttons(element: HTMLElement): string[] {
      return [...element.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
    }

    it('offers to issue one when that is what is holding the car', () => {
      const { element } = render({ held: [awaitingInvoice()] });

      expect(buttons(element)).toContain('Issue invoice');
    });

    it('issues it for the row that was pressed', () => {
      const { element, finance } = render({ held: [awaitingInvoice()] });

      const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Issue invoice');
      button?.click();

      expect(finance['issueInvoice']).toHaveBeenCalledWith('wo1');
    });

    it('hides it from someone who may not issue one', () => {
      // finance.invoice.issue is withheld from BRANCH_MANAGER by default,
      // same as the till.
      const { element } = render({ held: [awaitingInvoice()] }, false);

      expect(buttons(element)).not.toContain('Issue invoice');
    });

    it('does not offer a second invoice once one exists', () => {
      const { element } = render({
        held: [
          candidate({
            canLeave: false,
            status: 'PAYMENT_PENDING',
            blockedBy: ['The invoice has not been settled.'],
            unsettledInvoiceId: 'inv-9',
            invoiceId: 'inv-9',
          }),
        ],
      });

      expect(buttons(element)).not.toContain('Issue invoice');
      expect([...element.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Take payment')).toBe(true);
    });

    it('says so rather than failing silently when issuing is refused', () => {
      const { element } = render({ held: [awaitingInvoice()] }, true, {
        issueInvoice: vi.fn(() => throwError(() => ({ message: 'This job has no billable lines.' }))),
      });

      const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Issue invoice');
      button?.click();
      TestBed.inject(ApplicationRef).tick();

      expect(element.textContent).toContain('This job has no billable lines.');
    });
  });
});

/**
 * REC-045: `GET /finance/work-orders/:id/total` existed, was permission-gated,
 * and had no caller anywhere in the product -- so "Issue invoice" fixed an
 * amount forever that nobody on this page could see first. And the discount
 * loop behind it had no surface at all, which turned DISCOUNT_AUTHORITY into a
 * policy that could only ever block.
 */
describe('DeliveryPage: what the job costs, before the invoice is signed', () => {
  const awaitingInvoice = candidate({
    workOrderId: 'wo-money',
    canLeave: false,
    status: 'PAYMENT_PENDING',
    blockedBy: ['The final invoice has not been issued.'],
  });

  it('does not read the total until it is asked for', () => {
    // This board is scanned for what is blocked. A total on every row would
    // bury the reasons that are the point of the page -- and cost a request
    // per row to do it.
    const { finance } = render({ held: [awaitingInvoice] });

    expect(finance['jobTotal']).not.toHaveBeenCalled();
  });

  it('shows the lines and the total the invoice will carry', () => {
    const { fixture, element, finance } = render({ held: [awaitingInvoice] });

    press(element, 'What this costs')!.click();
    fixture.detectChanges();

    expect(finance['jobTotal']).toHaveBeenCalledWith('wo-money');
    const total = element.querySelector('.job-total')!;
    expect(total.textContent).toContain('Front brake pads');
    expect(total.textContent).toContain('900.00');
    // The workshop's own tax, which reached no invoice at all until Phase 7.
    expect(total.textContent).toContain('126.00');
    expect(total.textContent).toContain('1026.00');
  });

  it('re-reads on every open, because a part can be issued between two glances', () => {
    const { fixture, element, finance } = render({ held: [awaitingInvoice] });

    press(element, 'What this costs')!.click();
    fixture.detectChanges();
    press(element, 'Hide what this costs')!.click();
    fixture.detectChanges();
    press(element, 'What this costs')!.click();
    fixture.detectChanges();

    expect(finance['jobTotal']).toHaveBeenCalledTimes(2);
  });

  it('offers the discount ask only to someone who may make it', () => {
    const { fixture, element } = render({ held: [awaitingInvoice] }, false);

    press(element, 'What this costs')!.click();
    fixture.detectChanges();

    expect(press(element, 'Ask for a discount')).toBeUndefined();
  });

  it('sends the discount as a money string with the reason it was given', () => {
    const { fixture, element, finance } = render({ held: [awaitingInvoice] });

    press(element, 'What this costs')!.click();
    fixture.detectChanges();
    press(element, 'Ask for a discount')!.click();
    fixture.detectChanges();

    const amount = element.querySelector('#discount-amount-wo-money') as HTMLInputElement;
    amount.value = '50.00';
    amount.dispatchEvent(new Event('input'));
    const reason = element.querySelector('#discount-reason-wo-money') as HTMLInputElement;
    reason.value = 'Waited three days for a part';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    press(element, 'Send request')!.click();
    fixture.detectChanges();

    expect(finance['requestDiscount']).toHaveBeenCalledWith('wo-money', '50.00', 'Waited three days for a part');
    expect(element.querySelector('.discount-sent')?.textContent).toContain('once the owner approves');
  });

  it('will not send a discount with no reason on it', () => {
    const { fixture, element, finance } = render({ held: [awaitingInvoice] });

    press(element, 'What this costs')!.click();
    fixture.detectChanges();
    press(element, 'Ask for a discount')!.click();
    fixture.detectChanges();

    const amount = element.querySelector('#discount-amount-wo-money') as HTMLInputElement;
    amount.value = '50.00';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect((press(element, 'Send request') as HTMLButtonElement).disabled).toBe(true);
    expect(finance['requestDiscount']).not.toHaveBeenCalled();
  });

  it('offers none of this on a car that is already ready to leave', () => {
    // A discount after the invoice exists is a refund, and a total on a job
    // that is already invoiced is answered by the invoice itself.
    const { element } = render({ ready: [candidate({ workOrderId: 'wo-ready' })] });

    expect(press(element, 'What this costs')).toBeUndefined();
  });
});

const press = (element: HTMLElement, text: string): HTMLButtonElement | undefined =>
  [...element.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

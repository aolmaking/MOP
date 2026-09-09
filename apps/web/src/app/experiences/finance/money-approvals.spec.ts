import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MoneyApprovalsPage } from './money-approvals';
import { FinanceApi, type DiscountApprovalRow, type MoneyApprovals, type RefundApprovalRow } from './finance.api';

function refund(overrides: Partial<RefundApprovalRow> = {}): RefundApprovalRow {
  return {
    id: 'ref1',
    invoiceId: 'inv1',
    invoiceNumber: 'INV-000012',
    invoiceTotal: '900.00',
    workOrderId: 'wo1',
    identifier: 'DEMO-4471',
    customerName: 'Mona Adel',
    amount: '120.00',
    reason: 'Charged for a filter we did not fit',
    reasonCategory: 'ROUTINE',
    requestedBy: 'North Manager',
    requestedAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...overrides,
  };
}

function discount(overrides: Partial<DiscountApprovalRow> = {}): DiscountApprovalRow {
  return {
    id: 'dis1',
    workOrderId: 'wo2',
    identifier: 'DEMO-9902',
    customerName: 'Karim Adel',
    amount: '80.00',
    reason: 'Long-standing customer',
    requestedBy: 'North Manager',
    requestedAt: new Date(Date.now() - 7_200_000).toISOString(),
    ...overrides,
  };
}

function queue(overrides: Partial<MoneyApprovals> = {}): MoneyApprovals {
  return {
    refunds: [],
    discounts: [],
    canDecideRefunds: true,
    canDecideDiscounts: true,
    ...overrides,
  };
}

function render(result: MoneyApprovals | { error: unknown }) {
  const api = {
    moneyApprovals: vi.fn(() => ('error' in result ? throwError(() => result.error) : of(result))),
    approveRefund: vi.fn((_id: string) => of({ id: 'ref1', creditNoteNumber: 'CN-000004' })),
    rejectRefund: vi.fn((_id: string, _reason: string) => of({ id: 'ref1' })),
    approveDiscount: vi.fn((_id: string) => of({ id: 'dis1' })),
    rejectDiscount: vi.fn((_id: string, _reason: string) => of({ id: 'dis1' })),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: FinanceApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(MoneyApprovalsPage);
  fixture.detectChanges();
  return { fixture, api, element: fixture.nativeElement as HTMLElement };
}

const press = (element: HTMLElement, text: string): HTMLButtonElement | undefined =>
  [...element.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

/**
 * The page that made two complete API loops reachable by a person.
 *
 * Everything asserted here is about the decision being an informed one: the
 * amount, who asked, and why, on the row itself. A queue that shows an id and
 * an "Approve" button is a queue that gets rubber-stamped.
 */
describe('MoneyApprovalsPage', () => {
  it('says how much, who asked, and why -- the three things a decision needs', () => {
    const { element } = render(queue({ refunds: [refund()] }));

    const row = element.querySelector('.row--refund')!;
    expect(row.textContent).toContain('120.00');
    expect(row.textContent).toContain('North Manager');
    expect(row.textContent).toContain('Charged for a filter we did not fit');
  });

  it('marks a disputed charge, because it is a different kind of record', () => {
    // Routine reversals and disputed charges carry different audit and
    // reporting weight downstream, and the person signing has to see which.
    const { element } = render(queue({ refunds: [refund({ reasonCategory: 'DISPUTE_REMEDIATION' })] }));

    expect(element.querySelector('.row-flag')?.textContent).toContain('Disputed');
  });

  it('does not flag a routine refund as anything', () => {
    const { element } = render(queue({ refunds: [refund()] }));

    expect(element.querySelector('.row-flag')).toBeNull();
  });

  it('names the credit note after approving, because that is the artifact', () => {
    const { fixture, element, api } = render(queue({ refunds: [refund()] }));

    press(element, 'Approve refund')!.click();
    fixture.detectChanges();

    expect(api.approveRefund).toHaveBeenCalledWith('ref1');
    expect(element.querySelector('.outcome')?.textContent).toContain('CN-000004');
  });

  it('refuses to decline without a reason -- the requester faces the customer', () => {
    const { fixture, element, api } = render(queue({ refunds: [refund()] }));

    press(element, 'Decline')!.click();
    fixture.detectChanges();

    const confirm = press(element, 'Decline refund') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(api.rejectRefund).not.toHaveBeenCalled();
  });

  it('sends the decline reason it was given', () => {
    const { fixture, element, api } = render(queue({ refunds: [refund()] }));

    press(element, 'Decline')!.click();
    fixture.detectChanges();
    const input = element.querySelector('.reject-input') as HTMLInputElement;
    input.value = 'The part was fitted; see the photo on the job';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    press(element, 'Decline refund')!.click();

    expect(api.rejectRefund).toHaveBeenCalledWith('ref1', 'The part was fitted; see the photo on the job');
  });

  it('keeps refunds and discounts apart, because they are opposite acts', () => {
    const { element } = render(queue({ refunds: [refund()], discounts: [discount()] }));

    const titles = [...element.querySelectorAll('.band-title')].map((n) => n.textContent?.trim());
    expect(titles).toEqual(['Refunds', 'Discounts']);
  });

  it('shows an empty half rather than refusing the whole page', () => {
    // A viewer who may decide discounts and not refunds gets the half they
    // can act on. The server sends the other half empty.
    const { element } = render(queue({ discounts: [discount()], canDecideRefunds: false }));

    const titles = [...element.querySelectorAll('.band-title')].map((n) => n.textContent?.trim());
    expect(titles).toEqual(['Discounts']);
  });

  it('re-reads after a decision rather than dropping the row', () => {
    // Approving a discount can be refused outright when the approver is a
    // branch manager over their own ceiling, and approving a refund can fail
    // on the billing adapter. What the queue looks like afterwards is the
    // server's answer, not this page's guess.
    const { fixture, element, api } = render(queue({ discounts: [discount()] }));

    press(element, 'Approve discount')!.click();
    fixture.detectChanges();

    expect(api.moneyApprovals).toHaveBeenCalledTimes(2);
  });

  it('says what went wrong when a decision is refused', () => {
    const { fixture, element } = render(queue({ discounts: [discount()] }));
    const api = TestBed.inject(FinanceApi) as unknown as { approveDiscount: ReturnType<typeof vi.fn> };
    api.approveDiscount.mockReturnValueOnce(
      throwError(() => ({ message: 'A branch manager may approve up to 20.00 on this job.' })),
    );

    press(element, 'Approve discount')!.click();
    fixture.detectChanges();

    expect(element.querySelector('.decision-error')?.textContent).toContain('may approve up to 20.00');
  });

  it('tells someone who decides neither that this is not their page', () => {
    const { element } = render({ error: { httpStatus: 403 } });

    expect(element.textContent).toContain('decided by the workshop owner');
  });

  it('says nothing is waiting rather than showing an empty frame', () => {
    const { element } = render(queue());

    expect(element.querySelector('.state-title')?.textContent).toContain('Nothing waiting');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TakePayment } from './take-payment';
import { FinanceApi, type Settlement } from './finance.api';

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    invoiceId: 'inv1',
    total: '100.00',
    paid: '0.00',
    outstanding: '100.00',
    overpaid: '0.00',
    settled: false,
    ...overrides,
  };
}

async function render(result: Settlement | { error: unknown }) {
  const api = {
    settlement: vi.fn(() => ('error' in result ? throwError(() => result.error) : of(result))),
    // Parameters declared so the assertions below can read the
    // idempotency key out of `mock.calls`.
    pay: vi.fn((_invoiceId: string, _amount: string, _method: string, _key: string) =>
      of(settlement({ paid: '100.00', outstanding: '0.00', settled: true })),
    ),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: FinanceApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(TakePayment);
  fixture.componentRef.setInput('id', 'inv1');
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, api, element: fixture.nativeElement as HTMLElement, page: fixture.componentInstance as never as Internals };
}

interface Internals {
  setAmount(v: string): void;
  submit(): void;
  amountValid(): boolean;
  canSubmit(): boolean;
  conflict(): string | null;
}

describe('TakePayment', () => {
  it('leads with the outstanding balance, as a string it never parses', async () => {
    const { element } = await render(settlement({ outstanding: '1800.50' }));

    expect(element.querySelector('.balance-value')?.textContent?.trim()).toBe('1800.50');
  });

  it('pre-fills the amount with the full balance', async () => {
    // Re-typing a number already on screen is the likeliest place to
    // mistype one.
    const { element } = await render(settlement({ outstanding: '250.00' }));

    expect((element.querySelector('.field-amount') as HTMLInputElement).value).toBe('250.00');
  });

  it('rejects an amount with more than two decimal places', async () => {
    const { page, fixture } = await render(settlement());

    page.setAmount('10.005');
    fixture.detectChanges();

    expect(page.amountValid()).toBe(false);
    expect(page.canSubmit()).toBe(false);
  });

  it('sends the amount as a string, exactly as typed', async () => {
    // The whole phase in one assertion: no parseFloat, no Number, no
    // toFixed on the way out.
    const { page, api } = await render(settlement());

    page.setAmount('40.50');
    page.submit();

    expect(api.pay).toHaveBeenCalledWith('inv1', '40.50', 'CASH', expect.stringMatching(/^pay-/));
  });

  it('reuses one idempotency key when retrying a FAILED attempt', async () => {
    // The case the mechanism exists for: the request timed out on a bad
    // counter connection and the operator presses again. The server may
    // already have recorded it, so the same key must arrive -- otherwise
    // the customer is charged twice.
    const { page, api, fixture } = await render(settlement());
    api.pay.mockReturnValueOnce(throwError(() => ({ httpStatus: 500, code: 'server_error', message: 'timeout' })));

    page.setAmount('40.00');
    page.submit();
    fixture.detectChanges();
    const firstKey = api.pay.mock.calls[0][3];

    page.submit();
    expect(api.pay.mock.calls[1][3]).toBe(firstKey);
  });

  it('uses a NEW key when the amount changes, because that is a different payment', async () => {
    const { page, api, fixture } = await render(settlement());
    api.pay.mockReturnValueOnce(throwError(() => ({ httpStatus: 500, code: 'server_error', message: 'timeout' })));

    page.setAmount('40.00');
    page.submit();
    fixture.detectChanges();
    const firstKey = api.pay.mock.calls[0][3];

    page.setAmount('60.00');
    page.submit();

    expect(api.pay.mock.calls[1][3]).not.toBe(firstKey);
  });

  it('uses a NEW key after a payment succeeds, because the next one is a new payment', async () => {
    // The other half of the rule. Reusing the key after success would
    // make a second, genuine payment silently replay the first.
    const { page, api, fixture } = await render(settlement({ outstanding: '100.00' }));
    api.pay.mockReturnValueOnce(of(settlement({ paid: '40.00', outstanding: '60.00', settled: false })));

    page.setAmount('40.00');
    page.submit();
    fixture.detectChanges();
    const firstKey = api.pay.mock.calls[0][3];

    page.setAmount('60.00');
    page.submit();

    expect(api.pay.mock.calls[1][3]).not.toBe(firstKey);
  });

  it('turns an idempotency conflict into a question, not a retry prompt', async () => {
    // The likely cause is that the money was already taken. Telling the
    // operator to "try again" would be the worst possible advice.
    const { page, api, fixture, element } = await render(settlement());
    api.pay.mockReturnValueOnce(
      throwError(() => ({ code: 'idempotency_conflict', httpStatus: 409, message: 'conflict' })),
    );

    page.setAmount('40.00');
    page.submit();
    fixture.detectChanges();

    expect(page.conflict()).toContain('already');
    expect(element.textContent).not.toContain('Try again');
  });

  it('shows an overpayment as money owed back, never as a negative balance', async () => {
    const { element } = await render(
      settlement({ paid: '130.00', outstanding: '0.00', overpaid: '30.00', settled: true }),
    );

    expect(element.querySelector('.settled-over')?.textContent).toContain('30.00');
    expect(element.textContent).not.toContain('-30.00');
  });

  it('offers methods as buttons rather than a dropdown', async () => {
    const { element } = await render(settlement());

    expect(element.querySelectorAll('.method').length).toBe(4);
    expect(element.querySelector('select')).toBeNull();
  });
});

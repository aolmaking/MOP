import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { InvoiceStatus } from './invoice-status';
import { CustomerPortalApi, type InvoiceStatusRow } from './customer-portal.api';

function row(overrides: Partial<InvoiceStatusRow> = {}): InvoiceStatusRow {
  return {
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-0001',
    status: 'ISSUED',
    total: '500.00',
    paid: '500.00',
    balance: '0.00',
    issuedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function render(response: readonly InvoiceStatusRow[] | { readonly error: unknown }) {
  const api = { invoices: () => ('error' in response ? throwError(() => response.error) : of(response)) };
  TestBed.configureTestingModule({ providers: [{ provide: CustomerPortalApi, useValue: api }] });
  const fixture = TestBed.createComponent(InvoiceStatus);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('InvoiceStatus', () => {
  it('shows the empty state when nothing has been issued', () => {
    const { element } = render([]);
    expect(element.textContent).toContain('No invoices yet');
  });

  it('renders total, paid, and balance as the exact strings the server sent', () => {
    const { element } = render([row({ total: '1234.56', paid: '1000.00', balance: '234.56' })]);

    expect(element.textContent).toContain('1234.56');
    expect(element.textContent).toContain('1000.00');
    expect(element.textContent).toContain('234.56');
  });

  it('flags an invoice with an open balance', () => {
    const { element } = render([row({ balance: '150.00' })]);

    expect(element.querySelector('.invoice--open')).not.toBeNull();
    expect(element.textContent).toContain('Balance owed');
  });

  it('does not flag a fully settled invoice', () => {
    const { element } = render([row({ balance: '0.00' })]);

    expect(element.querySelector('.invoice--open')).toBeNull();
    expect(element.textContent).not.toContain('Balance owed');
  });
});

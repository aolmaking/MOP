import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { InventoryReturns } from './inventory-returns';
import { InventoryApi, type OpenReturn } from './inventory.api';

function returnRow(overrides: Partial<OpenReturn> = {}): OpenReturn {
  return {
    partRequestId: 'pr1',
    status: 'RETURN_REQUESTED',
    itemId: 'item1',
    itemName: 'Brake pad',
    sku: 'BRK-01',
    workOrderId: 'wo1',
    quantity: 1,
    reason: 'Wrong size',
    clarificationQuestion: null,
    requestedById: 'tech1',
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

function render(returns: OpenReturn[]) {
  const api = {
    openReturns: () => of({ returns }),
    movements: () => of({ rows: [], total: 0, page: 1, pageSize: 50 }),
    stock: () => of({ warehouses: [{ id: 'w1', name: 'Main', code: 'MS' }], rows: [] }),
    acceptReturn: () => of({ ok: true }),
    rejectReturn: () => of({ ok: true }),
    requestReturnClarification: () => of({ ok: true }),
  };

  TestBed.configureTestingModule({ providers: [{ provide: InventoryApi, useValue: api }] });
  const fixture = TestBed.createComponent(InventoryReturns);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('InventoryReturns', () => {
  it('shows the three actions on a plain return request', () => {
    const { element } = render([returnRow()]);

    const labels = [...element.querySelectorAll('.return-actions button')].map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Accept', 'Ask a question', 'Reject']);
  });

  it('hides the actions and shows the waiting note while a clarification is outstanding', () => {
    const { element } = render([
      returnRow({ status: 'RETURN_CLARIFICATION_REQUESTED', clarificationQuestion: 'Is this the right SKU?' }),
    ]);

    expect(element.querySelector('.return-actions')).toBeNull();
    expect(element.textContent).toContain('Is this the right SKU?');
    expect(element.textContent).toContain('Waiting on a reply');
  });

  it('shows the empty state when nothing is waiting on a decision', () => {
    const { element } = render([]);

    expect(element.textContent).toContain('Nothing waiting on a decision');
  });

  it('opens the accept form with a warehouse picker, not an immediate action', () => {
    const { fixture, element } = render([returnRow()]);

    element.querySelector<HTMLButtonElement>('.return-actions button')?.click();
    fixture.detectChanges();

    expect(element.querySelector('.return-form select')).not.toBeNull();
    expect(element.querySelector('.damaged-check')).not.toBeNull();
  });

  it('switches to the ledger tab on click', () => {
    const { fixture, element } = render([returnRow()]);

    const ledgerTab = [...element.querySelectorAll('.tab')].find((n) => n.textContent?.includes('Ledger')) as HTMLButtonElement;
    ledgerTab.click();
    fixture.detectChanges();

    expect(element.querySelector('.ledger-controls')).not.toBeNull();
    expect(element.querySelector('.queue')).toBeNull();
  });
});

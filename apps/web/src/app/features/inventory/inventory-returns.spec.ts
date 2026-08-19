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

describe('InventoryReturns -- ledger delta', () => {
  /**
   * StockMovement.quantity is a magnitude and the direction lives in
   * `type`, so signing off the quantity alone printed "+1" on an ISSUE
   * shown next to "before 4, after 3". The ledger contradicted itself on
   * every row that took stock out, which on an inventory ledger is not a
   * cosmetic problem.
   */
  function delta(row: { quantity: number; beforeQty: number; afterQty: number }): string {
    const component = TestBed.createComponent(InventoryReturns).componentInstance as unknown as {
      delta(r: { quantity: number; beforeQty: number; afterQty: number }): string;
    };
    return component.delta(row);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: InventoryApi,
          useValue: {
            openReturns: () => of({ returns: [] }),
            movements: () => of({ rows: [], total: 0, page: 1, pageSize: 50 }),
            stock: () => of({ warehouses: [], rows: [] }),
          },
        },
      ],
    });
  });

  it('shows stock leaving the shelf as a negative', () => {
    expect(delta({ quantity: 1, beforeQty: 4, afterQty: 3 })).toBe('−1');
  });

  it('shows stock arriving as a positive', () => {
    expect(delta({ quantity: 15, beforeQty: 0, afterQty: 15 })).toBe('+15');
  });

  it('agrees with the before and after columns rather than the raw quantity', () => {
    // A four-litre oil issue: magnitude 4, effect -4.
    expect(delta({ quantity: 4, beforeQty: 52, afterQty: 48 })).toBe('−4');
  });

  it('claims no direction for a movement that left the shelf unchanged', () => {
    // A return going into pending is neither sellable nor still issued;
    // "+0" would assert a direction it does not have.
    expect(delta({ quantity: 2, beforeQty: 7, afterQty: 7 })).toBe('2');
  });
});

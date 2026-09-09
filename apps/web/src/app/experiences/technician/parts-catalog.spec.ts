import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PartsCatalog } from './parts-catalog';
import { TechnicianApi, type PartsCatalogPage } from './technician.api';
import { CustomerPortalApi, type CustomerPosOrderResult } from '../customer/customer-portal.api';

const mockCatalog: PartsCatalogPage = {
  items: [
    {
      id: 'item-1',
      name: 'High-Performance Brake Pads',
      sku: 'BP-001',
      summary: 'Ceramic composite brake pads',
      sellingPrice: '$85.00',
      availability: 'IN_STOCK',
      onHand: 12,
      stockTracked: true,
      imageUrl: null,
      attributes: [],
      categoryId: 'cat-1',
      categoryName: 'Brakes',
    },
  ],
  categories: [],
  filters: [],
  page: 1,
  pageSize: 24,
  total: 1,
  categoryId: null,
  query: null,
};

describe('PartsCatalog (Tech Mode & Customer POS)', () => {
  const createTestBed = async (url: string, idInput = '') => {
    const techApiMock = {
      partsCatalog: vi.fn(() => of(mockCatalog)),
      submitCart: vi.fn(() => of({ requests: [{ id: 'req-1' }] })),
      addExternalPart: vi.fn(() => of({ id: 'ext-1' })),
    };

    const customerApiMock = {
      partsCatalog: vi.fn(() => of(mockCatalog)),
      submitPosOrder: vi.fn(() =>
        of<CustomerPosOrderResult>({
          workOrderId: 'wo-pos-1',
          invoiceId: 'inv-pos-1',
          invoiceNumber: 'INV-2026-0001',
          total: '$85.00',
          itemsCount: 1,
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [PartsCatalog],
      providers: [
        provideRouter([]),
        { provide: TechnicianApi, useValue: techApiMock },
        { provide: CustomerPortalApi, useValue: customerApiMock },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue(url);

    const fixture = TestBed.createComponent(PartsCatalog);
    if (idInput) {
      fixture.componentRef.setInput('id', idInput);
    }
    fixture.detectChanges();

    return {
      fixture,
      component: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
      techApi: techApiMock,
      customerApi: customerApiMock,
    };
  };

  describe('Technician Mode (/tech/card/:id/parts)', () => {
    it('shows "Part from outside" button and enables recording external parts', async () => {
      const { fixture, element, techApi } = await createTestBed('/tech/card/wo-123/parts', 'wo-123');

      const extBtn = element.querySelector('#btn-pos-external-part') as HTMLButtonElement | null;
      expect(extBtn).not.toBeNull();
      expect(extBtn?.textContent).toContain('Part from outside');

      // Click to open modal
      extBtn?.click();
      fixture.detectChanges();

      const modal = element.querySelector('.modal-card');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toContain('Part from outside');

      // Fill in external part details
      const nameInput = element.querySelector('#external-part-name') as HTMLInputElement;
      nameInput.value = 'Customer Special Oil Filter';
      nameInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const recordBtn = element.querySelector('#btn-record-external-part') as HTMLButtonElement;
      recordBtn.click();
      fixture.detectChanges();

      expect(techApi.addExternalPart).toHaveBeenCalledWith(
        'wo-123',
        'Customer Special Oil Filter',
        'CUSTOMER_SUPPLIED',
        1,
      );
    });

    it('submits basket to workshop store via TechnicianApi', async () => {
      const { fixture, component, techApi } = await createTestBed('/tech/card/wo-123/parts', 'wo-123');

      // Add part to cart
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (component as any).add(mockCatalog.items[0], 1);
      fixture.detectChanges();

      // Submit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (component as any).submit();
      fixture.detectChanges();

      expect(techApi.submitCart).toHaveBeenCalled();
    });
  });

  describe('Customer POS Mode (/customer/pos)', () => {
    it('does NOT render "Part from outside" and shows Customer POS header', async () => {
      const { element } = await createTestBed('/customer/pos', '');

      const extBtn = element.querySelector('#btn-pos-external-part');
      expect(extBtn).toBeNull();

      const title = element.querySelector('.catalog-title');
      expect(title?.textContent).toContain('Point of Sale');

      // Both, and separately. `href ?? textContent` could never reach the
      // label, because an anchor that renders at all has an href -- so this
      // was only ever checking the URL while claiming to check the words.
      const backLink = element.querySelector('.card-back');
      expect(backLink?.getAttribute('href')).toBe('/customer');
      expect(backLink?.textContent).toContain('Customer Portal');
    });

    it('submits basket as over-the-counter POS order via CustomerPortalApi and renders receipt', async () => {
      const { fixture, component, element, customerApi } = await createTestBed('/customer/pos', '');

      // Add part to cart
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (component as any).add(mockCatalog.items[0], 1);
      fixture.detectChanges();

      // Submit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (component as any).submit();
      fixture.detectChanges();

      expect(customerApi.submitPosOrder).toHaveBeenCalledWith({
        lines: [{ inventoryItemId: 'item-1', quantity: 1 }],
      });

      const receipt = element.querySelector('.pos-receipt-card');
      expect(receipt).not.toBeNull();
      expect(receipt?.textContent).toContain('INV-2026-0001');
      expect(receipt?.textContent).toContain('$85.00');
    });
  });
});

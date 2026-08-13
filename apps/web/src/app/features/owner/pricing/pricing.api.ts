import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface FinanceConfigView {
  readonly discountApprovalThreshold: string;
  readonly maxDiscountPercent: string;
  readonly maxBranchDiscountPercent: string;
  readonly depositRequired: boolean;
  readonly depositPercent: string;
  readonly taxRatePercent: string;
  readonly taxInclusive: boolean;
  readonly invoiceNumberPrefix: string;
  readonly defaultDueInDays: number;
  readonly allowUnpaidDelivery: boolean;
  readonly allowPartialPaidDelivery: boolean;
  readonly paymentMethods: readonly string[];
  readonly invoiceTerms: string | null;
  readonly currency: string;
}

export interface PriceCatalogItemView {
  readonly id: string;
  readonly itemKey: string;
  readonly itemType: string;
  readonly unitPrice: string;
  readonly laborPrice: string | null;
  readonly isActive: boolean;
  readonly effectiveFrom: string;
}

export const ALL_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'WALLET', 'DEPOSIT'] as const;

@Injectable({ providedIn: 'root' })
export class PricingApi {
  private readonly http = inject(HttpClient);

  get(): Observable<FinanceConfigView> {
    return this.http.get<FinanceConfigView>('/api/v1/organization/finance-configuration');
  }

  update(patch: Partial<FinanceConfigView>): Observable<FinanceConfigView> {
    return this.http.post<FinanceConfigView>('/api/v1/organization/finance-configuration', patch);
  }

  catalog(): Observable<PriceCatalogItemView[]> {
    return this.http.get<PriceCatalogItemView[]>('/api/v1/organization/finance-configuration/catalog');
  }

  setPrice(input: {
    itemKey: string;
    itemType: string;
    unitPrice: number;
    laborPrice?: number;
  }): Observable<PriceCatalogItemView> {
    return this.http.post<PriceCatalogItemView>('/api/v1/organization/finance-configuration/catalog', input);
  }
}

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface WaitingRequest {
  readonly id: string;
  readonly status: string;
  readonly itemName: string;
  readonly sku: string;
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly requested: number;
  readonly issued: number;
  readonly outstanding: number;
  readonly urgency: string;
  readonly waitingHours: number;
  readonly onHand: number;
  readonly sources: readonly { warehouseId: string; code: string; available: number }[];
}

export interface StockCell {
  readonly warehouseId: string;
  readonly available: number;
  readonly damaged: number;
}

export interface StockRow {
  readonly itemId: string;
  readonly sku: string;
  readonly name: string;
  readonly lowStockThreshold: number;
  readonly criticalStockThreshold: number;
  readonly byWarehouse: readonly StockCell[];
  readonly totalAvailable: number;
}

export interface StockTable {
  readonly warehouses: readonly { id: string; name: string; code: string }[];
  readonly rows: readonly StockRow[];
}

export interface Movement {
  readonly id: string;
  readonly type: string;
  readonly quantity: number;
  readonly beforeQty: number;
  readonly afterQty: number;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly actorId: string;
  readonly createdAt: string;
  readonly warehouse: { name: string; code: string };
}

export interface ItemDetail {
  readonly item: {
    id: string;
    sku: string;
    name: string;
    itemType: string;
    lowStockThreshold: number;
    criticalStockThreshold: number;
    /** A string across the API. Money is never a JS number. */
    sellingPrice: string;
    stockBalances: readonly {
      warehouseId: string;
      availableQty: number;
      reservedQty: number;
      damagedQty: number;
      warehouse: { name: string; code: string };
    }[];
  };
  readonly movements: readonly Movement[];
}

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  requests(): Observable<{ requests: WaitingRequest[] }> {
    return this.http.get<{ requests: WaitingRequest[] }>('/api/v1/inventory/requests');
  }

  stock(query?: string): Observable<StockTable> {
    return this.http.get<StockTable>('/api/v1/inventory/stock', { params: query ? { q: query } : {} });
  }

  item(id: string): Observable<ItemDetail> {
    return this.http.get<ItemDetail>(`/api/v1/inventory/items/${id}`);
  }

  approve(id: string): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/requests/${id}/approve`, {});
  }

  issue(id: string, warehouseId: string, quantity: number): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/requests/${id}/issue`, { warehouseId, quantity });
  }

  reject(id: string, reason?: string): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/requests/${id}/reject`, { reason });
  }
}

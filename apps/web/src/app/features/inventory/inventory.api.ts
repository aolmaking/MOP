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

  movements(filters: MovementFilters): Observable<MovementPage> {
    const params: Record<string, string> = {};
    if (filters.warehouseId) params['warehouseId'] = filters.warehouseId;
    if (filters.itemId) params['itemId'] = filters.itemId;
    if (filters.type) params['type'] = filters.type;
    if (filters.from) params['from'] = filters.from;
    if (filters.to) params['to'] = filters.to;
    if (filters.page) params['page'] = String(filters.page);
    return this.http.get<MovementPage>('/api/v1/inventory/movements', { params });
  }

  openReturns(): Observable<{ returns: OpenReturn[] }> {
    return this.http.get<{ returns: OpenReturn[] }>('/api/v1/inventory/returns');
  }

  acceptReturn(id: string, warehouseId: string, quantity: number, damaged: boolean): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/returns/${id}/accept`, { warehouseId, quantity, damaged });
  }

  rejectReturn(id: string, reason?: string): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/returns/${id}/reject`, { reason });
  }

  requestReturnClarification(id: string, question: string): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/returns/${id}/clarify`, { question });
  }

  home(): Observable<InventoryHome> {
    return this.http.get<InventoryHome>('/api/v1/inventory/home');
  }

  catalog(filters: { q?: string; category?: string; stockTracked?: boolean; page?: number }): Observable<CatalogPage> {
    const params: Record<string, string> = {};
    if (filters.q) params['q'] = filters.q;
    if (filters.category) params['category'] = filters.category;
    if (filters.stockTracked !== undefined) params['stockTracked'] = String(filters.stockTracked);
    if (filters.page) params['page'] = String(filters.page);
    return this.http.get<CatalogPage>('/api/v1/inventory/catalog', { params });
  }

  createItem(draft: CatalogDraft): Observable<CatalogItem> {
    return this.http.post<CatalogItem>('/api/v1/inventory/catalog', draft);
  }

  updateItem(id: string, draft: CatalogDraft): Observable<CatalogItem> {
    return this.http.post<CatalogItem>(`/api/v1/inventory/catalog/${id}`, draft);
  }

  reports(): Observable<InventoryReports> {
    return this.http.get<InventoryReports>('/api/v1/inventory/reports');
  }
}

/* ------------------------------------------------------------------ *
 * Inventory Home, Catalog Control, Reports.
 * ------------------------------------------------------------------ */

export interface WarehouseSlice {
  readonly warehouseId: string;
  readonly code: string;
  readonly name: string;
  readonly count: number;
}

/** A total that carries its own breakdown, so no screen recomputes it. */
export interface ScopedCount {
  readonly total: number;
  readonly byWarehouse: readonly WarehouseSlice[];
}

export interface FastMovingItem {
  readonly itemId: string;
  readonly name: string;
  readonly sku: string;
  readonly movements: number;
  readonly quantity: number;
}

export interface InventoryHome {
  readonly warehouses: readonly { id: string; code: string; name: string }[];
  readonly pendingRequests: ScopedCount;
  readonly toDispatch: ScopedCount;
  readonly awaitingArrival: ScopedCount;
  readonly returnRequests: ScopedCount;
  readonly lowStock: ScopedCount;
  readonly criticalStock: ScopedCount;
  readonly outOfStock: ScopedCount;
  readonly fastMoving: readonly FastMovingItem[];
}

export interface CatalogItem {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly itemType: string;
  readonly category: string | null;
  readonly subcategory: string | null;
  readonly compatibleCategories: readonly string[];
  readonly lowStockThreshold: number;
  readonly criticalStockThreshold: number;
  readonly sellingPrice: string;
  /** Null when this reader may not see cost -- the server omits it. */
  readonly cost: string | null;
  readonly workOrderUsable: boolean;
  readonly posVisible: boolean;
  readonly stockTracked: boolean;
  readonly barcode: string | null;
  readonly supplier: string | null;
  readonly notes: string | null;
  readonly onHand: number;
}

export interface CatalogPage {
  readonly items: readonly CatalogItem[];
  readonly total: number;
  readonly categories: readonly string[];
}

export interface CatalogDraft {
  sku: string;
  name: string;
  itemType: string;
  category?: string;
  subcategory?: string;
  compatibleCategories?: string[];
  lowStockThreshold?: number;
  criticalStockThreshold?: number;
  sellingPrice: string;
  cost?: string;
  workOrderUsable?: boolean;
  posVisible?: boolean;
  stockTracked?: boolean;
  barcode?: string;
  supplier?: string;
  notes?: string;
}

export interface InventoryReports {
  readonly windowDays: number;
  readonly usage: readonly { itemId: string; name: string; sku: string; issued: number; movements: number }[];
  readonly categoryUsage: readonly { category: string; issued: number }[];
  readonly stockRisk: readonly {
    itemId: string;
    name: string;
    sku: string;
    warehouseCode: string;
    available: number;
    velocity: number;
    daysLeft: number | null;
  }[];
  readonly returns: { total: number; backToStock: number; damaged: number };
  readonly requesters: readonly { requestedById: string; requests: number; averageFulfilmentHours: number | null }[];
  /** Null for a single-warehouse scope -- not an empty array. */
  readonly warehouseComparison: readonly { warehouseId: string; code: string; name: string; issued: number }[] | null;
}

/* ------------------------------------------------------------------ *
 * Returns / Movements.
 * ------------------------------------------------------------------ */

export interface MovementRow {
  readonly id: string;
  readonly type: string;
  readonly quantity: number;
  readonly beforeQty: number;
  readonly afterQty: number;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly actorId: string;
  readonly createdAt: string;
  readonly inventoryItem: { id: string; name: string; sku: string };
  readonly warehouse: { id: string; name: string; code: string };
}

export interface MovementPage {
  readonly rows: readonly MovementRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface OpenReturn {
  readonly partRequestId: string;
  readonly status: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly sku: string;
  readonly workOrderId: string;
  readonly quantity: number;
  readonly reason: string | null;
  readonly clarificationQuestion: string | null;
  readonly requestedById: string;
  readonly requestedAt: string;
}

export interface MovementFilters {
  warehouseId?: string;
  itemId?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: number;
}

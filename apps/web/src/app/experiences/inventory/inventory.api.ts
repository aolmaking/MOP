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

  catalog(filters: { q?: string; categoryId?: string; stockTracked?: boolean; page?: number }): Observable<CatalogPage> {
    const params: Record<string, string> = {};
    if (filters.q) params['q'] = filters.q;
    // 'none' is a real filter -- the items nobody has filed yet.
    if (filters.categoryId) params['categoryId'] = filters.categoryId;
    if (filters.stockTracked !== undefined) params['stockTracked'] = String(filters.stockTracked);
    if (filters.page) params['page'] = String(filters.page);
    return this.http.get<CatalogPage>('/api/v1/inventory/catalog', { params });
  }

  /* ---------------------------------------------------------------- *
   * Catalog configuration
   * ---------------------------------------------------------------- */

  catalogConfiguration(): Observable<CatalogConfiguration> {
    return this.http.get<CatalogConfiguration>('/api/v1/inventory/catalog-config');
  }

  createCategory(draft: CategoryDraft): Observable<unknown> {
    return this.http.post('/api/v1/inventory/catalog-config/categories', draft);
  }

  updateCategory(id: string, draft: CategoryDraft): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/catalog-config/categories/${id}`, draft);
  }

  setCategoryAttributes(id: string, attributeIds: readonly string[]): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/catalog-config/categories/${id}/attributes`, { attributeIds });
  }

  /**
   * The order a technician reads. Sends the whole sibling group, not one
   * row's new position -- a single number is how two rows end up sharing
   * one and the order quietly reverts to alphabetical.
   */
  reorderCategories(parentId: string | null, orderedIds: readonly string[]): Observable<unknown> {
    return this.http.post('/api/v1/inventory/catalog-config/categories/reorder', {
      orderedIds,
      ...(parentId ? { parentId } : {}),
    });
  }

  reorderAttributes(orderedIds: readonly string[]): Observable<unknown> {
    return this.http.post('/api/v1/inventory/catalog-config/attributes/reorder', { orderedIds });
  }

  reorderAttributeValues(attributeId: string, orderedIds: readonly string[]): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/catalog-config/attributes/${attributeId}/values/reorder`, { orderedIds });
  }

  createAttribute(draft: AttributeDraft): Observable<unknown> {
    return this.http.post('/api/v1/inventory/catalog-config/attributes', draft);
  }

  updateAttribute(id: string, draft: AttributeDraft): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/catalog-config/attributes/${id}`, draft);
  }

  addAttributeValue(attributeId: string, draft: AttributeValueDraft): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/catalog-config/attributes/${attributeId}/values`, draft);
  }

  updateAttributeValue(id: string, draft: AttributeValueDraft): Observable<unknown> {
    return this.http.post(`/api/v1/inventory/catalog-config/attribute-values/${id}`, draft);
  }

  /**
   * "This is what the technician will see."
   *
   * Hits the same browse the technician's page hits, so a
   * misconfiguration that would hide a part from them hides it here too.
   */
  catalogPreview(filters: {
    q?: string;
    categoryId?: string;
    attributes?: Readonly<Record<string, readonly string[]>>;
    inStockOnly?: boolean;
    page?: number;
  }): Observable<PreviewPage> {
    const params: Record<string, string> = {};
    if (filters.q) params['q'] = filters.q;
    if (filters.categoryId) params['categoryId'] = filters.categoryId;
    const encoded = Object.entries(filters.attributes ?? {})
      .filter(([, values]) => values.length > 0)
      .map(([attributeId, values]) => `${attributeId}:${values.join(',')}`)
      .join(';');
    if (encoded) params['attributes'] = encoded;
    if (filters.inStockOnly) params['inStockOnly'] = 'true';
    if (filters.page && filters.page > 1) params['page'] = String(filters.page);
    return this.http.get<PreviewPage>('/api/v1/inventory/catalog-preview', { params });
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
  readonly catalogCategoryId: string | null;
  readonly categoryName: string | null;
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
  readonly imageUrl: string | null;
  readonly summary: string | null;
  readonly attributeValueIds: readonly string[];
  readonly onHand: number;
}

export interface CatalogPage {
  readonly items: readonly CatalogItem[];
  readonly total: number;
  /** The workshop's configured categories, flat, for the list filter. */
  readonly categories: readonly { id: string; name: string; parentId: string | null; isActive: boolean }[];
}

export interface CatalogDraft {
  sku: string;
  name: string;
  itemType: string;
  catalogCategoryId?: string;
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
  imageUrl?: string;
  summary?: string;
  /**
   * Absent means "leave the part's filters alone"; an empty array means
   * "it has none". The editor always sends it, so a save is always the
   * whole truth about this part.
   */
  attributeValueIds?: string[];
}

/* ------------------------------------------------------------------ *
 * Catalog configuration -- what the technician's catalog is made of.
 * ------------------------------------------------------------------ */

export interface ConfiguredCategory {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly technicianVisible: boolean;
  readonly itemCount: number;
  readonly attributeIds: readonly string[];
  readonly children: readonly ConfiguredCategory[];
}

export interface ConfiguredAttributeValue {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  /** How many parts already carry it -- read before deactivating. */
  readonly itemCount: number;
}

export interface ConfiguredAttribute {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly showOnCard: boolean;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly usedByCategoryIds: readonly string[];
  readonly values: readonly ConfiguredAttributeValue[];
}

export interface CatalogConfiguration {
  readonly categories: readonly ConfiguredCategory[];
  readonly attributes: readonly ConfiguredAttribute[];
  readonly uncategorisedItemCount: number;
}

export interface CategoryDraft {
  name: string;
  parentId?: string | null;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  technicianVisible?: boolean;
}

export interface AttributeDraft {
  label: string;
  showOnCard?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

export interface AttributeValueDraft {
  label: string;
  sortOrder?: number;
  isActive?: boolean;
}

/** Exactly the shape the technician's page receives -- see PreviewPage. */
export interface PreviewCard {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly summary: string | null;
  readonly imageUrl: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly sellingPrice: string;
  readonly stockTracked: boolean;
  readonly onHand: number;
  readonly availability: 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK' | 'NOT_TRACKED';
  readonly attributes: readonly { attributeId: string; label: string; valueLabel: string }[];
}

export interface PreviewCategoryNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly itemCount: number;
  readonly children: readonly PreviewCategoryNode[];
}

export interface PreviewFilter {
  readonly attributeId: string;
  readonly key: string;
  readonly label: string;
  readonly options: readonly { valueId: string; value: string; label: string; count: number; selected: boolean }[];
}

/**
 * The preview response.
 *
 * Identical to the technician's `PartsCatalogPage` because it comes from
 * the same server method with the same arguments. Two shapes here would
 * be the first crack in the guarantee the preview exists to give.
 */
export interface PreviewPage {
  readonly categories: readonly PreviewCategoryNode[];
  readonly filters: readonly PreviewFilter[];
  readonly items: readonly PreviewCard[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly categoryId: string | null;
  readonly query: string | null;
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

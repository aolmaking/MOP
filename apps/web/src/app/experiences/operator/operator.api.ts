import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface OperatorVehicle {
  id: string;
  plateNumber: string | null;
  vinOrChassisNumber: string | null;
  category: string;
  ownedSince: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerCustomerId: string | null;
  activeWorkOrder?: {
    id: string;
    status: string;
    complaint?: string | null;
    createdAt: string;
    hasInspectionReport?: boolean;
  } | null;
}

export interface OperatorOverview {
  metrics: {
    totalVehicles: number;
    inServiceCount: number;
    intakeQueueCount: number;
    pendingReportsCount?: number;
  };
  branches: Array<{ id: string; name: string; code: string }>;
  vehicles: OperatorVehicle[];
}

export interface RegisterCustomerVehiclePayload {
  fullName: string;
  phone: string;
  email?: string;
  plateNumber: string;
  category?: 'CARS' | 'MOTORCYCLES' | 'HEAVY_EQUIPMENT';
  vinOrChassisNumber?: string;
}

export interface OperatorIntakePayload {
  assetId: string;
  branchId?: string;
  complaint: string;
  inspectionDeclined?: boolean;
  inspectionParts?: string[];
}

export interface OperatorIntakeResult {
  workOrderId: string;
  status: string;
  assetId: string;
}

/**
 * The till reads the SAME catalogue contract the technician's parts page does.
 *
 * Re-declaring it here would be a second definition of one wire shape, which
 * is how the operator page came to read `item.price`, `item.nameEn` and
 * `item.partNumber` -- three fields the server has never sent. The call was
 * typed `Observable<any>`, so nothing objected, and every price fell through
 * to a literal: the tile advertised a fabricated 45 and adding the part to a
 * quote charged the customer a fabricated 50.
 */
import type { PartCard, PartsCatalogPage } from '../technician/technician.api';

export type OperatorCatalogItem = PartCard;
export type OperatorCatalogPage = PartsCatalogPage;

export interface OperatorPosOrderResult {
  workOrderId: string;
  invoiceId: string;
  invoiceNumber: string;
  total: string;
  itemsCount: number;
}

export interface OperatorInspectionFinding {
  id?: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedService?: string;
  code?: string;
}

export interface OperatorInspectionPart {
  id?: string;
  inventoryItemId?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OperatorInspectionService {
  id?: string;
  serviceName: string;
  laborPrice: number;
}

export interface OperatorInspectionReportItem {
  workOrderId: string;
  vehicle: {
    id: string;
    plateNumber: string;
    model: string;
    vin: string;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  submittedAt: string;
  status: string;
  findingsCount: number;
  partsCount: number;
  servicesCount: number;
  totalEstimate: number;
}

export interface OperatorInspectionReportDetail {
  workOrderId: string;
  status: string;
  vehicle: {
    id: string;
    plateNumber: string;
    model: string;
    vin: string;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  inspection: {
    id?: string;
    submittedAt?: string;
    submittedBy?: string;
    note?: string;
    findings: OperatorInspectionFinding[];
    parts: OperatorInspectionPart[];
    services: OperatorInspectionService[];
    pricing: {
      partsTotal: number;
      laborTotal: number;
      grandTotal: number;
    };
  };
}

@Injectable({ providedIn: 'root' })
export class OperatorApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/operator';

  overview(): Observable<OperatorOverview> {
    return this.http.get<OperatorOverview>(`${this.base}/overview`);
  }

  search(q: string): Observable<OperatorVehicle[]> {
    const params = new HttpParams().set('q', q);
    return this.http.get<OperatorVehicle[]>(`${this.base}/search`, { params });
  }

  registerCustomerVehicle(payload: RegisterCustomerVehiclePayload): Observable<OperatorVehicle> {
    return this.http.post<OperatorVehicle>(`${this.base}/register-vehicle`, payload);
  }

  createIntake(payload: OperatorIntakePayload): Observable<OperatorIntakeResult> {
    return this.http.post<OperatorIntakeResult>(`${this.base}/intake`, payload);
  }

  /**
   * The workshop's own catalogue, as the till sees it.
   *
   * Typed, because `Observable<any>` is what let the page read
   * `item.price || item.unitPrice || 45` for a field the server has never
   * sent: every tile showed a fabricated $45, and adding one to a quote
   * charged the customer a fabricated 50. The server's own contract says
   * `sellingPrice`, and says it is a string.
   */
  posCatalog(query: {
    q?: string;
    categoryId?: string;
    inStockOnly?: boolean;
    page?: number;
  }): Observable<OperatorCatalogPage> {
    let params = new HttpParams();
    if (query.q) params = params.set('q', query.q);
    if (query.categoryId) params = params.set('categoryId', query.categoryId);
    if (query.inStockOnly) params = params.set('inStockOnly', 'true');
    if (query.page) params = params.set('page', query.page.toString());
    return this.http.get<OperatorCatalogPage>(`${this.base}/pos/catalog`, { params });
  }

  submitPosOrder(payload: { lines: Array<{ inventoryItemId: string; quantity: number }>; customerId?: string }): Observable<OperatorPosOrderResult> {
    return this.http.post<OperatorPosOrderResult>(`${this.base}/pos/order`, payload);
  }

  getInspectionReports(): Observable<OperatorInspectionReportItem[]> {
    return this.http.get<OperatorInspectionReportItem[]>(`${this.base}/inspection-reports`);
  }

  getInspectionReportDetail(workOrderId: string): Observable<OperatorInspectionReportDetail> {
    return this.http.get<OperatorInspectionReportDetail>(`${this.base}/work-orders/${encodeURIComponent(workOrderId)}/inspection-report`);
  }

  updateQuote(
    workOrderId: string,
    payload: {
      findings?: OperatorInspectionFinding[];
      parts?: OperatorInspectionPart[];
      services?: OperatorInspectionService[];
      note?: string;
    },
  ): Observable<{ success: boolean; pricing: { partsTotal: number; laborTotal: number; grandTotal: number } }> {
    return this.http.post<{ success: boolean; pricing: { partsTotal: number; laborTotal: number; grandTotal: number } }>(
      `${this.base}/work-orders/${encodeURIComponent(workOrderId)}/update-quote`,
      payload,
    );
  }

  approveRepair(
    workOrderId: string,
    payload: {
      approvedFindingIds?: string[];
      approvedPartIds?: string[];
      approvedServiceIds?: string[];
      approvedFindings?: any[];
      approvedServices?: any[];
      operatorNote?: string;
      note?: string;
      technicianId?: string;
      tasks?: Array<{ title: string; estimatedMinutes?: number }>;
    },
  ): Observable<{ success: boolean; workOrderId: string; status: string }> {
    return this.http.post<{ success: boolean; workOrderId: string; status: string }>(
      `${this.base}/work-orders/${encodeURIComponent(workOrderId)}/approve-repair`,
      payload,
    );
  }

}

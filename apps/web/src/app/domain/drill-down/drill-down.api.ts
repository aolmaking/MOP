import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";
import type { DrillDownQueryParams, DrillDownResult } from "./drill-down.types";

@Injectable({ providedIn: "root" })
export class DrillDownApi {
  private readonly http = inject(HttpClient);

  drillDown(params: DrillDownQueryParams): Observable<DrillDownResult> {
    let httpParams = new HttpParams().set("metric", params.metric);

    if (params.from) httpParams = httpParams.set("from", params.from);
    if (params.to) httpParams = httpParams.set("to", params.to);
    if (params.branchId) httpParams = httpParams.set("branchId", params.branchId);
    if (params.serviceKey) httpParams = httpParams.set("serviceKey", params.serviceKey);
    if (params.technicianId) httpParams = httpParams.set("technicianId", params.technicianId);
    if (params.workOrderId) httpParams = httpParams.set("workOrderId", params.workOrderId);
    if (params.dimension) httpParams = httpParams.set("dimension", params.dimension);
    if (params.dimensionValue) httpParams = httpParams.set("dimensionValue", params.dimensionValue);
    if (params.cursor) httpParams = httpParams.set("cursor", params.cursor);
    if (params.limit) httpParams = httpParams.set("limit", params.limit.toString());

    return this.http.get<DrillDownResult>("/api/v1/analytics/drill-down", { params: httpParams });
  }

  exportCsvUrl(params: DrillDownQueryParams): string {
    const searchParams = new URLSearchParams();
    searchParams.set("metric", params.metric);
    if (params.from) searchParams.set("from", params.from);
    if (params.to) searchParams.set("to", params.to);
    if (params.branchId) searchParams.set("branchId", params.branchId);
    if (params.serviceKey) searchParams.set("serviceKey", params.serviceKey);
    if (params.technicianId) searchParams.set("technicianId", params.technicianId);
    if (params.workOrderId) searchParams.set("workOrderId", params.workOrderId);
    if (params.dimension) searchParams.set("dimension", params.dimension);
    if (params.dimensionValue) searchParams.set("dimensionValue", params.dimensionValue);

    return `/api/v1/analytics/drill-down/export?${searchParams.toString()}`;
  }
}

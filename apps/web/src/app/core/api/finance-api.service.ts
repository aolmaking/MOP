import { Injectable, inject } from "@angular/core";
import type {
  FinalInvoiceDto,
  FinanceConfigurationDto,
  FinanceDashboardDto,
  FinanceWorkOrderDto,
  SellableItemDto
} from "@mop/shared";
import { ApiClient } from "./api-client.service";

@Injectable({ providedIn: "root" })
export class FinanceApiService {
  private readonly api = inject(ApiClient);

  configuration() {
    return this.api.get<FinanceConfigurationDto>("/finance/configuration");
  }

  saveConfiguration(body: Partial<FinanceConfigurationDto>) {
    return this.api.post<FinanceConfigurationDto>("/finance/configuration", body);
  }

  catalog(branchId?: string) {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    return this.api.get<SellableItemDto[]>(`/finance/catalog${query}`);
  }

  saveCatalogItem(body: unknown) {
    return this.api.post<SellableItemDto>("/finance/catalog", body);
  }

  dashboard() {
    return this.api.get<FinanceDashboardDto>("/finance/dashboard");
  }

  invoices() {
    return this.api.get<FinalInvoiceDto[]>("/finance/invoices");
  }

  workOrder(id: string) {
    return this.api.get<FinanceWorkOrderDto>(`/finance/work-orders/${id}`);
  }

  issueInvoice(workOrderId: string) {
    return this.api.post<FinanceWorkOrderDto>(`/finance/work-orders/${workOrderId}/issue`, {});
  }

  recordPayment(invoiceId: string, body: unknown) {
    return this.api.post<FinanceWorkOrderDto>(`/finance/invoices/${invoiceId}/payments`, body);
  }

  requestRefund(invoiceId: string, body: unknown) {
    return this.api.post(`/finance/invoices/${invoiceId}/refunds`, body);
  }
}

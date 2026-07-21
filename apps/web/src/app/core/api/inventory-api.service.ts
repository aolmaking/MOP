import { Injectable, inject } from "@angular/core";
import type {
  InventoryHomeDto,
  InventoryItemDto,
  InventoryMovementDto,
  InventoryReportsDto,
  InventoryReturnRequestDto,
  InventoryStockStatusDto,
  InventoryTechnicianRequestDto
} from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

@Injectable({ providedIn: "root" })
export class InventoryApiService {
  private readonly api = inject(ApiClient);

  home() { return this.request(() => firstValueFrom(this.api.get<InventoryHomeDto>("/inventory/home")), "Inventory home failed."); }
  technicianRequests() { return this.request(() => firstValueFrom(this.api.get<InventoryTechnicianRequestDto[]>("/inventory/technician-requests")), "Inventory requests failed."); }
  items() { return this.request(() => firstValueFrom(this.api.get<InventoryItemDto[]>("/inventory/items")), "Inventory catalog failed."); }
  stockStatus() { return this.request(() => firstValueFrom(this.api.get<InventoryStockStatusDto[]>("/inventory/stock-status")), "Stock status failed."); }
  returns() { return this.request(() => firstValueFrom(this.api.get<InventoryReturnRequestDto[]>("/inventory/returns")), "Inventory returns failed."); }
  movements() { return this.request(() => firstValueFrom(this.api.get<InventoryMovementDto[]>("/inventory/movements")), "Inventory movements failed."); }
  reports() { return this.request(() => firstValueFrom(this.api.get<InventoryReportsDto>("/inventory/reports-lite")), "Inventory reports failed."); }
  technicianRequestAction(id: string, body: Record<string, unknown>) { return this.request(() => firstValueFrom(this.api.post(`/inventory/technician-requests/${id}/action`, body)), "Inventory request action failed."); }
  returnAction(id: string, action: string) { return this.request(() => firstValueFrom(this.api.post(`/inventory/returns/${id}/action`, { action })), "Return action failed."); }
  itemAction(id: string, body: Record<string, unknown>) { return this.request(() => firstValueFrom(this.api.post(`/inventory/catalog/items/${id}/action`, body)), "Catalog item action failed."); }
  createItem(body: Record<string, unknown>) { return this.request(() => firstValueFrom(this.api.post("/inventory/catalog/items", body)), "Create item failed."); }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}

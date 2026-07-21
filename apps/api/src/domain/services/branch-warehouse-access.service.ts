import { Injectable } from "@nestjs/common";
import type { WarehouseAccessOption } from "./warehouse-resolution.service";

@Injectable()
export class BranchWarehouseAccessService {
  canIssue(access: WarehouseAccessOption) {
    return access.accessType === "PRIMARY" || access.accessType === "BACKUP" || access.accessType === "SHARED";
  }

  canTransfer(access: WarehouseAccessOption) {
    return access.accessType === "BACKUP" || access.accessType === "SHARED" || access.accessType === "TRANSFER_ONLY";
  }

  visibleWarehouses(options: WarehouseAccessOption[]) {
    return [...options].sort((a, b) => a.priority - b.priority);
  }
}

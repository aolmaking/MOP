import { Injectable } from "@nestjs/common";
import type { AuditEventContract } from "@mop/shared";

@Injectable()
export class AuditEventService {
  build(input: Omit<AuditEventContract, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }): AuditEventContract {
    return {
      eventId: input.eventId || `evt_${Date.now()}`,
      timestamp: input.timestamp || new Date().toISOString(),
      ...input
    };
  }
}

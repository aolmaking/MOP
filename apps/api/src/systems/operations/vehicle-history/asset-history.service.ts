import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../../../runtime/database/prisma.service";

export interface AssetHistoryVisit {
  readonly workOrderId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly closedAt: string | null;
  /** From the `work_order.created` OperationEvent -- there is no stored `complaint` column; the event log is the record. */
  readonly complaint: string | null;
  readonly inspections: readonly { readonly type: string; readonly note: string | null; readonly createdAt: string }[];
  readonly faults: readonly {
    readonly code: string | null;
    readonly description: string;
    readonly severity: string;
    readonly recommendedService: string | null;
  }[];
  readonly partsUsed: readonly { readonly name: string; readonly quantity: number }[];
  readonly decisions: readonly { readonly name: string; readonly decision: string }[];
  /** False marks a visit from a PRIOR ownership period -- see the service doc comment for what that changes. */
  readonly sameOwnerAsCurrent: boolean;
}

export interface AssetHistorySummary {
  readonly assetId: string;
  readonly category: string;
  readonly identifier: string | null;
  readonly currentOwnerCustomerId: string | null;
  readonly totalPriorVisits: number;
  readonly hasPriorOwnerHistory: boolean;
  readonly visits: readonly AssetHistoryVisit[];
}

/**
 * Staff-facing vehicle history (P-81,
 * docs/POLICY_DECISION_INVENTORY.md §8.B) -- "not just a customer-facing
 * history feature... operationally important." Every field here already
 * existed (Inspection, Fault, WorkOrderPartLine, CustomerDecisionItem,
 * OperationEvent); this service is the first thing that reads them back
 * as one asset's story instead of one work order's fields.
 *
 * Deliberately excludes any customer name/phone/email at every layer --
 * unlike `SafeTechnicalHistory` (customer-facing, keyed per owner), this
 * feed serves the technician working the CURRENT visit, who already
 * knows who the current customer is from the work order they opened;
 * this service only needs to answer "what has this VEHICLE been through,"
 * never "who owned it when." `sameOwnerAsCurrent` marks the ownership
 * boundary explicitly so a caller can still visually separate "this
 * customer's own history" from "history from before this customer owned
 * it" without ever naming who the prior owner was.
 */
@Injectable()
export class AssetHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, assetId: string, excludeWorkOrderId?: string): Promise<AssetHistorySummary> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId },
      select: { id: true, category: true, plateNumber: true, serialNumber: true, currentOwnerCustomerId: true },
    });
    if (!asset) throw new NotFoundException({ code: "asset_not_found", message: "That vehicle was not found." });

    const currentOwnershipStart = await this.prisma.assetOwnershipHistory.findFirst({
      where: { tenantId, assetId, endedAt: null },
      select: { startedAt: true },
    });

    const workOrders = await this.prisma.workOrder.findMany({
      where: { tenantId, assetId, ...(excludeWorkOrderId ? { id: { not: excludeWorkOrderId } } : {}) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        closedAt: true,
        inspections: { select: { type: true, note: true, createdAt: true } },
        faults: { select: { code: true, description: true, severity: true, recommendedService: true } },
        partLines: { select: { name: true, quantity: true } },
        decisionRequests: {
          select: { items: { select: { name: true, decision: true } } },
        },
      },
    });

    const complaintByWorkOrder = await this.complaintText(tenantId, workOrders.map((w) => w.id));

    const visits: AssetHistoryVisit[] = workOrders.map((wo) => ({
      workOrderId: wo.id,
      status: wo.status,
      createdAt: wo.createdAt.toISOString(),
      closedAt: wo.closedAt?.toISOString() ?? null,
      complaint: complaintByWorkOrder.get(wo.id) ?? null,
      inspections: wo.inspections.map((i) => ({ type: i.type, note: i.note, createdAt: i.createdAt.toISOString() })),
      faults: wo.faults,
      partsUsed: wo.partLines.map((p) => ({ name: p.name, quantity: p.quantity })),
      decisions: wo.decisionRequests.flatMap((r) => r.items.map((item) => ({ name: item.name, decision: item.decision }))),
      sameOwnerAsCurrent: currentOwnershipStart ? wo.createdAt >= currentOwnershipStart.startedAt : true,
    }));

    return {
      assetId: asset.id,
      category: asset.category,
      identifier: asset.plateNumber ?? asset.serialNumber,
      currentOwnerCustomerId: asset.currentOwnerCustomerId,
      totalPriorVisits: visits.length,
      hasPriorOwnerHistory: visits.some((v) => !v.sameOwnerAsCurrent),
      visits,
    };
  }

  /**
   * A raw, JSONB-filtered query rather than `findMany` + JS filtering --
   * `OperationEvent` is tenant-wide and unbounded over a workshop's
   * lifetime; scanning every `work_order.created` row to find the
   * handful belonging to one asset's work orders would get slower every
   * month a real workshop stays open. The `->>'workOrderId'` filter lets
   * Postgres do the elimination instead of this service.
   *
   * Public: also the fix for `TechnicianWorkViewService`'s two
   * hardcoded `complaint: null` fields -- there was no `complaint`
   * column to read from, so nothing was ever filled in; this is that
   * lookup, not a second one.
   */
  async complaintText(tenantId: string, workOrderIds: string[]): Promise<Map<string, string>> {
    if (workOrderIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<{ workOrderId: string; complaint: string }[]>(Prisma.sql`
      SELECT payload->>'workOrderId' AS "workOrderId", payload->>'complaint' AS complaint
      FROM "operation_events"
      WHERE "tenantId" = ${tenantId}
        AND "eventKey" = 'work_order.created'
        AND payload->>'workOrderId' IN (${Prisma.join(workOrderIds)})
        AND payload->>'complaint' IS NOT NULL
    `);

    return new Map(rows.map((r) => [r.workOrderId, r.complaint]));
  }
}

import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../../../runtime/database/prisma.service";

/**
 * The one thing in this product that knows where a complaint is written
 * down.
 *
 * `WorkOrder` has no `complaint` column: what the customer said is
 * carried on the `work_order.created` OperationEvent, and every surface
 * that shows a complaint -- the technician's job list, the work card,
 * the owner's history index, the deep record, the decision-support brief
 * -- reads it back through the single query below.
 *
 * This service used to ALSO assemble a flat, staff-facing vehicle
 * history (`build`), which was superseded by
 * `WorkshopHistoryService.technicianBrief`. The two disagreed in a way
 * that mattered: the flat version reported a customer decision as its
 * raw `APPROVED` with no notion of whether the work was ever done, so a
 * team leader read "approved" for the exact item the technician's panel
 * reported as not performed. One question now has one answer, and the
 * competing projection is gone rather than left to drift.
 */
@Injectable()
export class AssetHistoryService {
  constructor(private readonly prisma: PrismaService) {}

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

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { AssetHistoryService } from "../vehicle-history/asset-history.service";
import { UNRESOLVED_OUTCOMES, resolveOutcome } from "./recommendation-outcome";
import type {
  HistoryFinding,
  HistoryInspection,
  HistoryMoney,
  HistoryPart,
  HistoryRecommendation,
  HistoryVisit,
  OwnerHistoryIndex,
  OwnerHistoryIndexRow,
  OwnerHistoryRecord,
  TechnicianHistoryBrief,
} from "./workshop-history.types";

export interface OwnerHistoryQuery {
  readonly search?: string;
  /** `open` = at least one live visit, `closed` = none. `all` is the default. */
  readonly activity?: "all" | "open" | "closed";
  readonly sort?: OwnerHistorySort;
  readonly direction?: "asc" | "desc";
  readonly page?: number;
  readonly pageSize?: number;
}

export type OwnerHistorySort = "lastVisit" | "firstVisit" | "visits" | "customer" | "plate" | "outstanding";

/**
 * The whitelist that makes dynamic ordering safe.
 *
 * Every one of these is interpolated as raw SQL, so the map is the ONLY
 * place a sort key may come from -- a caller-supplied column name never
 * reaches the query, whatever the DTO validation does or does not catch.
 */
const SORT_EXPRESSION: Readonly<Record<OwnerHistorySort, string>> = {
  lastVisit: 'MAX(wo."createdAt")',
  firstVisit: 'MIN(wo."createdAt")',
  visits: "COUNT(wo.id)",
  customer: 'c."fullName"',
  plate: 'a."plateNumber"',
  outstanding: 'SUM(COALESCE(i."balance", 0))',
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/**
 * How many previous visits the technician's brief reads.
 *
 * A decision-support surface is answering "what should I know before I
 * touch this car", and the answer is not sixty visits of findings on a
 * tablet. Ten is enough to cover a normal service life and keeps the
 * read a fixed cost; the count of ALL prior visits is reported
 * separately, so the brief can say which it looked at rather than
 * pretending the tenth-oldest was the oldest.
 */
const TECHNICIAN_BRIEF_VISITS = 10;

/** Statuses that mean the job is over. Used for "open visits", never for lifecycle decisions. */
const TERMINAL = ["CLOSED", "CANCELLED"];

interface IndexAggregateRow {
  customerId: string;
  assetId: string;
  customerName: string;
  customerPhone: string;
  category: string;
  plateNumber: string | null;
  vin: string | null;
  serialNumber: string | null;
  visits: number;
  firstVisitAt: Date;
  lastVisitAt: Date;
  openVisits: number;
  lastStatus: string;
  lastWorkOrderId: string;
  billedTotal: string;
  outstanding: string;
}

/**
 * The workshop's operational memory.
 *
 * One historical truth, projected three ways. This service owns the
 * truth; the projections differ only in what they select from it and how
 * they arrange it:
 *
 *   Owner       -- everything that happened, indexed by customer+vehicle
 *   Technician  -- what matters before the next diagnostic decision
 *   Customer    -- unchanged, and still owned by CustomerSafeProjection
 *
 * **It is a read layer and nothing else.** Nothing here writes, nothing
 * here decides a status, nothing here re-derives money. Every field is
 * read from the system that owns it -- work orders, inspections and
 * faults from Operations, part requests from Inventory, invoices and
 * payments from Finance -- and no historical fact is copied into a
 * reporting table that could later drift from the records it came from.
 * The one derived value in the module, a recommendation's outcome, is
 * computed in `recommendation-outcome.ts` from stored evidence and ships
 * that evidence alongside the answer.
 *
 * It is deliberately NOT a second lifecycle: `WorkOrder.status` is read
 * and never interpreted, and the ordered chronology comes from
 * `OperationEvent` rows the lifecycle service already wrote.
 */
@Injectable()
export class WorkshopHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetHistory: AssetHistoryService,
  ) {}

  // -------------------------------------------------------------------------
  // Owner: the index
  // -------------------------------------------------------------------------

  /**
   * Every customer+vehicle that has ever been through this workshop.
   *
   * Grouped by the PAIR rather than by customer or by vehicle, because
   * the historical identity a workshop actually reasons about is "this
   * person's car": a customer with three vehicles has three histories,
   * and a vehicle that changed hands has two.
   *
   * Aggregated in Postgres rather than in JavaScript. A workshop open for
   * five years has tens of thousands of work orders and the index must
   * stay a page-sized read -- pulling them all back to count visits per
   * customer is the exact shape of query that makes an owner's history
   * page unusable in year two. Search, filter, sort and paging are all
   * pushed into the same statement for the same reason.
   */
  async ownerIndex(tenantId: string, query: OwnerHistoryQuery = {}): Promise<OwnerHistoryIndex> {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)));
    const sort: OwnerHistorySort = SORT_EXPRESSION[query.sort as OwnerHistorySort] ? (query.sort as OwnerHistorySort) : "lastVisit";
    const direction = query.direction === "asc" ? "asc" : "desc";
    const activity = query.activity ?? "all";

    const search = (query.search ?? "").trim();
    const searchClause = search
      ? Prisma.sql`AND (
          c."fullName" ILIKE ${`%${search}%`}
          OR c."phone" ILIKE ${`%${search}%`}
          OR COALESCE(a."plateNumber", '') ILIKE ${`%${search}%`}
          OR COALESCE(a."vinOrChassisNumber", '') ILIKE ${`%${search}%`}
          OR COALESCE(a."serialNumber", '') ILIKE ${`%${search}%`}
        )`
      : Prisma.empty;

    // Applied as HAVING, not WHERE: "this relationship has an open visit"
    // is a fact about the GROUP. As a row filter it would silently drop
    // the closed visits from the same relationship's counts, and the
    // visit total would then disagree with the detail view.
    //
    // `::text` because `status` is a Postgres enum and the terminal list
    // arrives as text parameters; without the cast the whole statement
    // fails at 42883 rather than returning a wrong answer, which is the
    // better failure but still a failure.
    const havingClause =
      activity === "open"
        ? Prisma.sql`HAVING COUNT(*) FILTER (WHERE wo."status"::text NOT IN (${Prisma.join(TERMINAL)})) > 0`
        : activity === "closed"
          ? Prisma.sql`HAVING COUNT(*) FILTER (WHERE wo."status"::text NOT IN (${Prisma.join(TERMINAL)})) = 0`
          : Prisma.empty;

    const groupBy = Prisma.sql`
      GROUP BY wo."customerId", wo."assetId", c."fullName", c."phone",
               a."category", a."plateNumber", a."vinOrChassisNumber", a."serialNumber"`;

    const from = Prisma.sql`
      FROM "work_orders" wo
      JOIN "customers" c ON c."id" = wo."customerId"
      JOIN "assets" a ON a."id" = wo."assetId"
      LEFT JOIN "invoices" i ON i."workOrderId" = wo."id"
      WHERE wo."tenantId" = ${tenantId}
      ${searchClause}`;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<IndexAggregateRow[]>(Prisma.sql`
        SELECT
          wo."customerId" AS "customerId",
          wo."assetId" AS "assetId",
          c."fullName" AS "customerName",
          c."phone" AS "customerPhone",
          a."category"::text AS "category",
          a."plateNumber" AS "plateNumber",
          a."vinOrChassisNumber" AS "vin",
          a."serialNumber" AS "serialNumber",
          COUNT(wo.id)::int AS "visits",
          MIN(wo."createdAt") AS "firstVisitAt",
          MAX(wo."createdAt") AS "lastVisitAt",
          COUNT(*) FILTER (WHERE wo."status"::text NOT IN (${Prisma.join(TERMINAL)}))::int AS "openVisits",
          (ARRAY_AGG(wo."status"::text ORDER BY wo."createdAt" DESC))[1] AS "lastStatus",
          (ARRAY_AGG(wo."id" ORDER BY wo."createdAt" DESC))[1] AS "lastWorkOrderId",
          -- Cast to numeric(14,2) BEFORE text: COALESCE(..., 0) yields an
          -- integer zero, and a text cast on that produces "0" rather than
          -- "0.00". Money crosses this API as a two-decimal string
          -- everywhere else, and one endpoint quietly disagreeing is how
          -- a currency formatter starts rendering "0" next to "1,200.00".
          SUM(COALESCE(i."total", 0))::numeric(14,2)::text AS "billedTotal",
          SUM(COALESCE(i."balance", 0))::numeric(14,2)::text AS "outstanding"
        ${from}
        ${groupBy}
        ${havingClause}
        ORDER BY ${Prisma.raw(SORT_EXPRESSION[sort])} ${Prisma.raw(direction === "asc" ? "ASC NULLS LAST" : "DESC NULLS LAST")}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT 1
          ${from}
          ${groupBy}
          ${havingClause}
        ) grouped
      `),
    ]);

    // One extra query for the whole page rather than one per row. The
    // complaint lives in the `work_order.created` event because there is
    // no complaint column -- see AssetHistoryService.complaintText.
    const complaints = await this.assetHistory.complaintText(
      tenantId,
      rows.map((row) => row.lastWorkOrderId),
    );

    return {
      rows: rows.map(
        (row): OwnerHistoryIndexRow => ({
          key: `${row.customerId}:${row.assetId}`,
          customerId: row.customerId,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          assetId: row.assetId,
          category: row.category,
          plateNumber: row.plateNumber,
          vin: row.vin,
          serialNumber: row.serialNumber,
          visits: row.visits,
          firstVisitAt: row.firstVisitAt.toISOString(),
          lastVisitAt: row.lastVisitAt.toISOString(),
          openVisits: row.openVisits,
          lastStatus: row.lastStatus,
          lastWorkOrderId: row.lastWorkOrderId,
          lastComplaint: complaints.get(row.lastWorkOrderId) ?? null,
          // Postgres already produced these as text. Money never becomes
          // a JS number anywhere on this path.
          billedTotal: row.billedTotal,
          outstanding: row.outstanding,
        }),
      ),
      total: Number(totals[0]?.count ?? 0n), // money-lint-ok: a row count returned as bigint by COUNT(*), never an amount.
      page,
      pageSize,
      sort,
      direction,
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Owner: the complete record
  // -------------------------------------------------------------------------

  /**
   * Everything that ever happened between one customer and one vehicle.
   *
   * Assembled in a fixed number of queries regardless of how many visits
   * the relationship has: the work orders come back with their own
   * nested records in one read, and the four things Prisma cannot nest
   * (events, staff names, part-request fulfilment, complaints) are each
   * fetched once for the whole set. Nothing loops a query.
   */
  async ownerRecord(tenantId: string, customerId: string, assetId: string): Promise<OwnerHistoryRecord> {
    const [customer, asset] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        select: { id: true, fullName: true, phone: true, email: true, portalStatus: true },
      }),
      this.prisma.asset.findFirst({
        where: { id: assetId, tenantId },
        select: {
          id: true,
          category: true,
          plateNumber: true,
          vinOrChassisNumber: true,
          engineNumber: true,
          serialNumber: true,
          currentOwnerCustomerId: true,
        },
      }),
    ]);

    // Missing and not-yours are the same answer, so an owner of one
    // tenant cannot discover another tenant's ids by probing.
    if (!customer || !asset) {
      throw new NotFoundException({ code: "history_not_found", message: "That history is not available." });
    }

    const [ownership, workOrders, otherOwnerVisits] = await Promise.all([
      this.prisma.assetOwnershipHistory.findFirst({
        where: { tenantId, assetId, customerId },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, endedAt: true },
      }),
      this.prisma.workOrder.findMany({
        where: { tenantId, assetId, customerId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          closedAt: true,
          promisedAt: true,
          inspectionDeclined: true,
          branch: { select: { name: true } },
          assignments: { select: { staffUserId: true } },
          tasks: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              serviceKey: true,
              status: true,
              actualMinutes: true,
              createdAt: true,
              updatedAt: true,
              decisionItemId: true,
              assignments: { select: { staffUserId: true } },
              blockers: { select: { reason: true, note: true, status: true, createdAt: true } },
            },
          },
          inspections: {
            orderBy: { createdAt: "asc" },
            select: { id: true, type: true, createdAt: true, technicianId: true, odometerOrHours: true, note: true, fields: true },
          },
          faults: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              code: true,
              description: true,
              severity: true,
              recommendedService: true,
              inspectionId: true,
              createdAt: true,
            },
          },
          partLines: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              quantity: true,
              provenance: true,
              sellingPrice: true,
              workshopWarranted: true,
              taskId: true,
              partRequestId: true,
              createdAt: true,
            },
          },
          decisionRequests: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              status: true,
              sentAt: true,
              viewedAt: true,
              respondedAt: true,
              expiresAt: true,
              items: {
                select: {
                  id: true,
                  name: true,
                  explanation: true,
                  importance: true,
                  price: true,
                  laborPrice: true,
                  total: true,
                  decision: true,
                  decidedAt: true,
                },
              },
            },
          },
          runningInvoice: { select: { lines: { select: { total: true } } } },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              issuedAt: true,
              subtotal: true,
              discount: true,
              tax: true,
              total: true,
              paid: true,
              balance: true,
              lines: { select: { name: true, itemType: true, quantity: true, lockedUnitPrice: true, lockedLaborPrice: true, total: true } },
              payments: { select: { id: true, amount: true, method: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
            },
          },
        },
      }),
      this.prisma.workOrder.count({ where: { tenantId, assetId, customerId: { not: customerId } } }),
    ]);

    const workOrderIds = workOrders.map((workOrder) => workOrder.id);
    const [complaints, events, staff, fulfilment, taskLinks] = await Promise.all([
      this.assetHistory.complaintText(tenantId, workOrderIds),
      this.eventsFor(tenantId, workOrderIds),
      this.staffFor(
        tenantId,
        workOrders.flatMap((workOrder) => [
          ...workOrder.assignments.map((assignment) => assignment.staffUserId),
          ...workOrder.tasks.flatMap((task) => task.assignments.map((assignment) => assignment.staffUserId)),
        ]),
      ),
      this.partFulfilment(
        tenantId,
        workOrders.flatMap((workOrder) => workOrder.partLines.map((line) => line.partRequestId).filter(isPresent)),
      ),
      this.tasksByDecisionItem(workOrders),
    ]);

    const ownershipStart = ownership?.startedAt ?? null;
    const now = new Date();

    const visits = workOrders.map((workOrder): HistoryVisit => {
      const visitEvents = events.get(workOrder.id) ?? [];
      return {
        workOrderId: workOrder.id,
        status: workOrder.status,
        branchName: workOrder.branch?.name ?? null,
        openedAt: workOrder.createdAt.toISOString(),
        closedAt: workOrder.closedAt?.toISOString() ?? null,
        promisedAt: workOrder.promisedAt?.toISOString() ?? null,
        complaint: complaints.get(workOrder.id) ?? null,
        inspectionDeclined: workOrder.inspectionDeclined,
        staff: [
          ...new Set([
            ...workOrder.assignments.map((assignment) => assignment.staffUserId),
            ...workOrder.tasks.flatMap((task) => task.assignments.map((assignment) => assignment.staffUserId)),
          ]),
        ].flatMap((id) => {
          const person = staff.get(id);
          return person ? [{ id, fullName: person.fullName, role: person.role }] : [];
        }),
        inspections: workOrder.inspections.map(
          (inspection): HistoryInspection => ({
            id: inspection.id,
            type: inspection.type,
            at: inspection.createdAt.toISOString(),
            technicianName: staff.get(inspection.technicianId)?.fullName ?? null,
            // money-lint-ok: an odometer reading, not a currency amount.
            odometerOrHours: inspection.odometerOrHours === null ? null : inspection.odometerOrHours.toString(),
            note: inspection.note,
            fields: (inspection.fields ?? {}) as Record<string, unknown>,
          }),
        ),
        findings: workOrder.faults.map(
          (fault): HistoryFinding => ({
            id: fault.id,
            workOrderId: workOrder.id,
            at: fault.createdAt.toISOString(),
            code: fault.code,
            description: fault.description,
            severity: fault.severity,
            recommendedService: fault.recommendedService,
            inspectionId: fault.inspectionId,
            inspectionType: workOrder.inspections.find((inspection) => inspection.id === fault.inspectionId)?.type ?? null,
          }),
        ),
        recommendations: workOrder.decisionRequests.flatMap((request) =>
          request.items.map((item) =>
            this.recommendation({
              item,
              request,
              workOrder,
              tasks: taskLinks.get(item.id) ?? [],
              now,
              withMoney: true,
            }),
          ),
        ),
        decisionRequests: workOrder.decisionRequests.map((request) => ({
          id: request.id,
          status: request.status,
          sentAt: request.sentAt?.toISOString() ?? null,
          viewedAt: request.viewedAt?.toISOString() ?? null,
          respondedAt: request.respondedAt?.toISOString() ?? null,
          expiresAt: request.expiresAt?.toISOString() ?? null,
          itemCount: request.items.length,
        })),
        operations: workOrder.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          serviceKey: task.serviceKey,
          status: task.status,
          actualMinutes: task.actualMinutes,
          createdAt: task.createdAt.toISOString(),
          lastChangedAt: task.updatedAt.toISOString(),
          fromRecommendationId: task.decisionItemId,
          blockers: task.blockers.map((blocker) => ({
            reason: blocker.reason,
            note: blocker.note,
            status: blocker.status,
            at: blocker.createdAt.toISOString(),
          })),
        })),
        parts: workOrder.partLines.map((line): HistoryPart => {
          const request = line.partRequestId ? fulfilment.get(line.partRequestId) : undefined;
          return {
            name: line.name,
            quantity: line.quantity,
            provenance: line.provenance,
            charged: line.sellingPrice.toFixed(2),
            workshopWarranted: line.workshopWarranted,
            addedAt: line.createdAt.toISOString(),
            taskId: line.taskId,
            requestId: line.partRequestId,
            requestStatus: request?.status ?? null,
            requestedAt: request?.requestedAt ?? null,
            issuedQuantity: request?.issuedQuantity ?? 0,
            issuedAt: request?.issuedAt ?? null,
            receivedAt: request?.receivedAt ?? null,
            usedAt: request?.usedAt ?? null,
          };
        }),
        money: this.money(workOrder.runningInvoice, workOrder.invoice),
        lifecycle: visitEvents
          .filter((event) => event.eventKey === "work_order.status_changed")
          .map((event) => ({
            at: event.at,
            from: typeof event.payload.from === "string" ? event.payload.from : null,
            to: typeof event.payload.to === "string" ? event.payload.to : null,
            actorId: event.actorId,
          })),
        events: visitEvents.map((event) => ({ at: event.at, eventKey: event.eventKey, actorId: event.actorId })),
        // No ownership row at all means the workshop never recorded a
        // transfer, which for a single-owner vehicle is the normal case.
        sameOwnerAsCurrent: ownershipStart ? workOrder.createdAt >= ownershipStart : true,
      };
    });

    return {
      key: `${customer.id}:${asset.id}`,
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        portalStatus: customer.portalStatus,
      },
      asset: {
        id: asset.id,
        category: asset.category,
        plateNumber: asset.plateNumber,
        vin: asset.vinOrChassisNumber,
        engineNumber: asset.engineNumber,
        serialNumber: asset.serialNumber,
        currentOwnerCustomerId: asset.currentOwnerCustomerId,
      },
      isCurrentOwner: asset.currentOwnerCustomerId === customer.id,
      ownershipStartedAt: ownership?.startedAt?.toISOString() ?? null,
      ownershipEndedAt: ownership?.endedAt?.toISOString() ?? null,
      otherOwnerVisits,
      totalVisits: visits.length,
      // Ordered newest-first above, so the ends are the other way round.
      firstVisitAt: visits.at(-1)?.openedAt ?? null,
      lastVisitAt: visits[0]?.openedAt ?? null,
      visits,
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Technician: decision support
  // -------------------------------------------------------------------------

  /**
   * What a technician needs to know before deciding what to do next.
   *
   * The same records the owner record reads, arranged around a different
   * question. Three differences are deliberate and load-bearing:
   *
   *  - **The current visit is excluded from every historical list.** A
   *    finding recorded ten minutes ago must not come back as "previous
   *    inspection found", which is how a technician ends up chasing
   *    their own note.
   *  - **No money.** The price fields are absent from these objects
   *    rather than blanked, because a technician's tablet is not where
   *    the workshop's pricing belongs.
   *  - **Unresolved items are ranked to the top**, since "approved last
   *    time and never done" is the most likely explanation for a
   *    complaint that has come back.
   */
  async technicianBrief(tenantId: string, assetId: string, currentWorkOrderId: string): Promise<TechnicianHistoryBrief> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId },
      select: { id: true, category: true, plateNumber: true, vinOrChassisNumber: true, serialNumber: true },
    });
    if (!asset) {
      throw new NotFoundException({ code: "asset_not_found", message: "That vehicle was not found." });
    }

    const [current, priorVisitCount, priorWorkOrders, ownership] = await Promise.all([
      this.prisma.workOrder.findFirst({
        where: { id: currentWorkOrderId, tenantId },
        select: { id: true, inspectionDeclined: true },
      }),
      // The true total, counted rather than inferred from the page below.
      this.prisma.workOrder.count({ where: { tenantId, assetId, id: { not: currentWorkOrderId } } }),
      this.prisma.workOrder.findMany({
        where: { tenantId, assetId, id: { not: currentWorkOrderId } },
        orderBy: { createdAt: "desc" },
        // Bounded, and the bound is reported back as `visitsExamined`.
        // A vehicle with sixty visits would otherwise put sixty visits'
        // worth of findings on a tablet, which is the opposite of
        // decision support -- and the technician who needs the sixtieth
        // has the Owner's full record to go to. Never silently
        // truncated: the brief says how many it looked at, beside how
        // many exist.
        take: TECHNICIAN_BRIEF_VISITS,
        select: {
          id: true,
          status: true,
          createdAt: true,
          closedAt: true,
          inspections: { select: { id: true, type: true, note: true } },
          faults: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              code: true,
              description: true,
              severity: true,
              recommendedService: true,
              inspectionId: true,
              createdAt: true,
            },
          },
          tasks: { select: { id: true, title: true, status: true, createdAt: true, updatedAt: true, decisionItemId: true } },
          decisionRequests: {
            select: {
              id: true,
              status: true,
              sentAt: true,
              viewedAt: true,
              respondedAt: true,
              expiresAt: true,
              items: {
                select: {
                  id: true,
                  name: true,
                  explanation: true,
                  importance: true,
                  price: true,
                  laborPrice: true,
                  total: true,
                  decision: true,
                  decidedAt: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.assetOwnershipHistory.findFirst({
        where: { tenantId, assetId, endedAt: null },
        select: { startedAt: true },
      }),
    ]);

    if (!current) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job was not found." });
    }

    const complaints = await this.assetHistory.complaintText(tenantId, [currentWorkOrderId, ...priorWorkOrders.map((w) => w.id)]);
    const taskLinks = this.tasksByDecisionItem(priorWorkOrders);
    const now = new Date();
    const sameOwner = (openedAt: Date) => (ownership ? openedAt >= ownership.startedAt : true);

    const previousRecommendations = priorWorkOrders.flatMap((workOrder) =>
      workOrder.decisionRequests.flatMap((request) =>
        request.items.map((item) =>
          this.recommendation({
            item,
            request,
            workOrder,
            tasks: taskLinks.get(item.id) ?? [],
            now,
            withMoney: false,
          }),
        ),
      ),
    );

    return {
      workOrderId: currentWorkOrderId,
      asset: {
        id: asset.id,
        category: asset.category,
        identifier: asset.plateNumber ?? asset.serialNumber,
        plateNumber: asset.plateNumber,
        vin: asset.vinOrChassisNumber,
      },
      currentComplaint: complaints.get(currentWorkOrderId) ?? null,
      currentInspectionDeclined: current.inspectionDeclined,
      priorVisits: priorVisitCount,
      visitsExamined: priorWorkOrders.length,
      hasPriorOwnerHistory: priorWorkOrders.some((workOrder) => !sameOwner(workOrder.createdAt)),
      previousComplaints: priorWorkOrders.flatMap((workOrder) => {
        const text = complaints.get(workOrder.id);
        // A visit with no recorded complaint is left out rather than
        // shown as an empty line: an absent complaint is not a complaint.
        return text
          ? [
              {
                workOrderId: workOrder.id,
                at: workOrder.createdAt.toISOString(),
                text,
                status: workOrder.status,
                closedAt: workOrder.closedAt?.toISOString() ?? null,
                sameOwnerAsCurrent: sameOwner(workOrder.createdAt),
              },
            ]
          : [];
      }),
      previousFindings: priorWorkOrders.flatMap((workOrder) =>
        workOrder.faults.map((fault) => {
          const inspection = workOrder.inspections.find((candidate) => candidate.id === fault.inspectionId);
          return {
            id: fault.id,
            workOrderId: workOrder.id,
            at: fault.createdAt.toISOString(),
            code: fault.code,
            description: fault.description,
            severity: fault.severity,
            recommendedService: fault.recommendedService,
            inspectionId: fault.inspectionId,
            inspectionType: inspection?.type ?? null,
            inspectionNote: inspection?.note ?? null,
            sameOwnerAsCurrent: sameOwner(workOrder.createdAt),
          };
        }),
      ),
      previousRecommendations,
      unresolved: previousRecommendations.filter((recommendation) => UNRESOLVED_OUTCOMES.includes(recommendation.outcome)),
      generatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Shared internals
  // -------------------------------------------------------------------------

  /**
   * One recommendation, with its outcome and the evidence behind it.
   *
   * The single place both projections build this shape, so the owner's
   * "PERFORMED" and the technician's "PERFORMED" can never be computed
   * two different ways. `withMoney` omits the price keys entirely for
   * readers who may not see them -- absent, not blank.
   */
  private recommendation(input: {
    item: {
      id: string;
      name: string;
      explanation: string;
      importance: string;
      price: Prisma.Decimal;
      laborPrice: Prisma.Decimal;
      total: Prisma.Decimal;
      decision: string;
      decidedAt: Date | null;
    };
    request: { id: string; status: string; sentAt: Date | null; viewedAt: Date | null; respondedAt: Date | null; expiresAt: Date | null };
    workOrder: { id: string; status: string; closedAt: Date | null };
    tasks: readonly { id: string; title: string; status: string; createdAt: Date; updatedAt: Date }[];
    now: Date;
    withMoney: boolean;
  }): HistoryRecommendation {
    const { item, request, workOrder, tasks } = input;
    const outcome = resolveOutcome({
      decision: item.decision,
      decidedAt: item.decidedAt,
      requestStatus: request.status,
      sentAt: request.sentAt,
      viewedAt: request.viewedAt,
      respondedAt: request.respondedAt,
      expiresAt: request.expiresAt,
      workOrderStatus: workOrder.status,
      workOrderClosedAt: workOrder.closedAt,
      tasks,
      now: input.now,
    });

    return {
      id: item.id,
      workOrderId: workOrder.id,
      name: item.name,
      explanation: item.explanation,
      importance: item.importance,
      decision: item.decision,
      decidedAt: item.decidedAt?.toISOString() ?? null,
      requestId: request.id,
      requestStatus: request.status,
      sentAt: request.sentAt?.toISOString() ?? null,
      viewedAt: request.viewedAt?.toISOString() ?? null,
      respondedAt: request.respondedAt?.toISOString() ?? null,
      expiresAt: request.expiresAt?.toISOString() ?? null,
      outcome: outcome.outcome,
      outcomeLabel: outcome.label,
      evidence: outcome.evidence,
      linkedTasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        lastChangedAt: task.updatedAt.toISOString(),
      })),
      ...(input.withMoney
        ? { price: item.price.toFixed(2), laborPrice: item.laborPrice.toFixed(2), total: item.total.toFixed(2) }
        : {}),
    };
  }

  /** Tasks indexed by the recommendation they carry out. Built once per read, never per item. */
  private tasksByDecisionItem(
    workOrders: readonly {
      tasks: readonly { id: string; title: string; status: string; createdAt: Date; updatedAt: Date; decisionItemId: string | null }[];
    }[],
  ): Map<string, { id: string; title: string; status: string; createdAt: Date; updatedAt: Date }[]> {
    const index = new Map<string, { id: string; title: string; status: string; createdAt: Date; updatedAt: Date }[]>();
    for (const workOrder of workOrders) {
      for (const task of workOrder.tasks) {
        if (!task.decisionItemId) continue;
        const bucket = index.get(task.decisionItemId) ?? [];
        bucket.push({ id: task.id, title: task.title, status: task.status, createdAt: task.createdAt, updatedAt: task.updatedAt });
        index.set(task.decisionItemId, bucket);
      }
    }
    return index;
  }

  /**
   * Every operation event for a set of work orders, in one JSONB-filtered
   * read.
   *
   * `OperationEvent` is tenant-wide and unbounded over a workshop's life,
   * so the `workOrderId` filter has to run in Postgres. Same reasoning as
   * `AssetHistoryService.complaintText`, which this deliberately mirrors.
   */
  private async eventsFor(
    tenantId: string,
    workOrderIds: readonly string[],
  ): Promise<Map<string, { at: string; eventKey: string; actorId: string; payload: Record<string, unknown> }[]>> {
    const index = new Map<string, { at: string; eventKey: string; actorId: string; payload: Record<string, unknown> }[]>();
    if (workOrderIds.length === 0) return index;

    const rows = await this.prisma.$queryRaw<
      { workOrderId: string; eventKey: string; actorId: string; createdAt: Date; payload: Record<string, unknown> }[]
    >(Prisma.sql`
      SELECT payload->>'workOrderId' AS "workOrderId", "eventKey", "actorId", "createdAt", payload
      FROM "operation_events"
      WHERE "tenantId" = ${tenantId}
        AND payload->>'workOrderId' IN (${Prisma.join([...workOrderIds])})
      ORDER BY "createdAt" ASC
    `);

    for (const row of rows) {
      const bucket = index.get(row.workOrderId) ?? [];
      bucket.push({
        at: row.createdAt.toISOString(),
        eventKey: row.eventKey,
        actorId: row.actorId,
        payload: row.payload ?? {},
      });
      index.set(row.workOrderId, bucket);
    }
    return index;
  }

  private async staffFor(tenantId: string, ids: readonly string[]): Promise<Map<string, { fullName: string; role: string }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const people = await this.prisma.staffUser.findMany({
      where: { tenantId, id: { in: unique } },
      select: { id: true, fullName: true, role: true },
    });
    return new Map(people.map((person) => [person.id, { fullName: person.fullName, role: person.role }]));
  }

  /**
   * What actually happened to each part request: how much left the store,
   * when the technician took it, and when it went on the vehicle.
   *
   * Fulfilment is summed from `IssuedItem` rather than read from a
   * column, because the schema deliberately stores no cached total -- one
   * request can be filled by several hand-overs, and a cached sum would
   * be a second source of truth.
   */
  private async partFulfilment(
    tenantId: string,
    requestIds: readonly string[],
  ): Promise<
    Map<
      string,
      { status: string; requestedAt: string; issuedQuantity: number; issuedAt: string | null; receivedAt: string | null; usedAt: string | null }
    >
  > {
    const unique = [...new Set(requestIds)];
    if (unique.length === 0) return new Map();

    const requests = await this.prisma.partRequest.findMany({
      where: { tenantId, id: { in: unique } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        issuedItems: { select: { quantity: true, issuedAt: true, receivedAt: true, usedAt: true }, orderBy: { issuedAt: "asc" } },
      },
    });

    return new Map(
      requests.map((request) => [
        request.id,
        {
          status: request.status,
          requestedAt: request.createdAt.toISOString(),
          // money-lint-ok: a count of physical objects, not a currency amount.
          issuedQuantity: request.issuedItems.reduce((sum, issue) => sum + issue.quantity, 0),
          issuedAt: request.issuedItems[0]?.issuedAt?.toISOString() ?? null,
          receivedAt: request.issuedItems.find((issue) => issue.receivedAt)?.receivedAt?.toISOString() ?? null,
          usedAt: request.issuedItems.find((issue) => issue.usedAt)?.usedAt?.toISOString() ?? null,
        },
      ]),
    );
  }

  /**
   * The money on one visit, exactly as Finance recorded it.
   *
   * Read, never recomputed. `paid` and `balance` are maintained on the
   * invoice by the payment path, and summing payments a second time here
   * is how two screens start disagreeing about what a customer owes.
   * An invoiced job reports its invoice; an open one reports its running
   * total, and never both -- a second figure beside the first only
   * invites the reader to wonder which is real.
   */
  private money(
    running: { lines: readonly { total: Prisma.Decimal }[] } | null,
    invoice: {
      id: string;
      invoiceNumber: string;
      status: string;
      issuedAt: Date;
      subtotal: Prisma.Decimal;
      discount: Prisma.Decimal;
      tax: Prisma.Decimal;
      total: Prisma.Decimal;
      paid: Prisma.Decimal;
      balance: Prisma.Decimal;
      lines: readonly { name: string; itemType: string; quantity: number; lockedUnitPrice: Prisma.Decimal; lockedLaborPrice: Prisma.Decimal; total: Prisma.Decimal }[];
      payments: readonly { id: string; amount: Prisma.Decimal; method: string; status: string; createdAt: Date }[];
    } | null,
  ): HistoryMoney {
    if (!invoice) {
      return {
        runningTotal: running ? running.lines.reduce((acc, line) => acc.plus(line.total), new Prisma.Decimal(0)).toFixed(2) : null,
        invoiceId: null,
        invoiceNumber: null,
        invoiceStatus: null,
        issuedAt: null,
        subtotal: null,
        discount: null,
        tax: null,
        total: null,
        paid: null,
        outstanding: null,
        lines: [],
        payments: [],
      };
    }

    return {
      runningTotal: null,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: invoice.status,
      issuedAt: invoice.issuedAt.toISOString(),
      subtotal: invoice.subtotal.toFixed(2),
      discount: invoice.discount.toFixed(2),
      tax: invoice.tax.toFixed(2),
      total: invoice.total.toFixed(2),
      paid: invoice.paid.toFixed(2),
      outstanding: invoice.balance.toFixed(2),
      lines: invoice.lines.map((line) => ({
        name: line.name,
        itemType: line.itemType,
        quantity: line.quantity,
        unitPrice: line.lockedUnitPrice.toFixed(2),
        laborPrice: line.lockedLaborPrice.toFixed(2),
        total: line.total.toFixed(2),
      })),
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        at: payment.createdAt.toISOString(),
        amount: payment.amount.toFixed(2),
        method: payment.method,
        status: payment.status,
      })),
    };
  }
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

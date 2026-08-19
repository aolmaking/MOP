import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface DossierTimelineEntry {
  readonly at: string;
  readonly kind: "STATUS" | "TASK" | "INSPECTION" | "FAULT" | "BLOCKER" | "DECISION" | "PART" | "STOCK" | "MONEY";
  readonly summary: string;
  readonly actorId: string | null;
  readonly detail: Record<string, unknown>;
}

export interface DossierPartLine {
  readonly name: string;
  readonly quantity: number;
  readonly provenance: string;
  readonly inventoryItemId: string | null;
  readonly charged: string;
  /** Null unless the reader holds inventory.cost.view. */
  readonly cost: string | null;
  readonly workshopWarranted: boolean;
  readonly taskId: string | null;
  /** Null for a part with no PartRequest -- e.g. customer-supplied. */
  readonly partRequestId: string | null;
}

export interface DossierMoney {
  readonly lines: readonly { name: string; itemType: string; quantity: number; total: string }[];
  readonly runningTotal: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceTotal: string | null;
  readonly paid: string | null;
  readonly outstanding: string | null;
}

export interface WorkOrderDossier {
  readonly workOrderId: string;
  readonly status: string;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly customer: { id: string; fullName: string; phone: string } | null;
  readonly asset: { id: string; category: string; identifier: string | null } | null;
  readonly servicesPerformed: readonly { taskId: string; serviceKey: string | null; title: string; status: string }[];
  readonly people: readonly { staffUserId: string; fullName: string; role: string }[];
  readonly parts: readonly DossierPartLine[];
  readonly stockMovements: readonly { itemId: string; type: string; quantity: number; beforeQty: number; afterQty: number; at: string }[];
  readonly money: DossierMoney;
  readonly timeline: readonly DossierTimelineEntry[];
  readonly priorVisits: number;
}

/**
 * Everything that happened to one job, assembled in one place.
 *
 * The question this answers is the one that previously required opening
 * five unrelated screens and correlating them by eye: what was this job,
 * who touched it, what was done, what came off the shelf, what did it
 * cost us, what did we charge, and in what order did all of that happen.
 *
 * Composed rather than duplicated. Every field here is read from the
 * system that owns it -- tasks and events from Operations, part lines and
 * movements from Inventory, invoice and payments from Finance -- and
 * nothing is copied into a reporting table that could then drift from the
 * records it was derived from.
 *
 * `canViewCost` is passed in rather than resolved here: what the reader is
 * allowed to see is an access question, and this service deliberately does
 * not decide access. When it is false the cost fields are ABSENT from the
 * response rather than blanked client-side, which is the rule the whole
 * product follows -- anyone can open developer tools.
 */
@Injectable()
export class WorkOrderDossierService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    tenantId: string,
    workOrderId: string,
    options: { branchScope?: readonly string[]; canViewCost: boolean },
  ): Promise<WorkOrderDossier> {
    const branchScope = options.branchScope ?? [];

    const workOrder = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId,
        ...(branchScope.length > 0 ? { branchId: { in: [...branchScope] } } : {}),
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        closedAt: true,
        assetId: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        asset: { select: { id: true, category: true, plateNumber: true, serialNumber: true } },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            serviceKey: true,
            createdAt: true,
            updatedAt: true,
            assignments: { select: { staffUserId: true, assignedAt: true } },
            blockers: { select: { reason: true, note: true, status: true, createdAt: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Out of scope and non-existent are the same answer on purpose: a
    // different message would confirm that a job exists in a branch the
    // reader cannot see.
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not available to you." });
    }

    const [events, partLines, inspections, faults, running, invoice, priorVisits] = await Promise.all([
      this.prisma.operationEvent.findMany({
        where: { tenantId, payload: { path: ["workOrderId"], equals: workOrderId } },
        select: { eventKey: true, actorId: true, createdAt: true, payload: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.workOrderPartLine.findMany({
        where: { workOrderId },
        select: {
          name: true,
          quantity: true,
          provenance: true,
          inventoryItemId: true,
          sellingPrice: true,
          cost: true,
          workshopWarranted: true,
          taskId: true,
          partRequestId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.inspection.findMany({
        where: { workOrderId },
        select: { id: true, type: true, createdAt: true, technicianId: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.fault.findMany({
        where: { workOrderId },
        select: { code: true, description: true, severity: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.runningInvoice.findUnique({
        where: { workOrderId },
        select: { lines: { select: { name: true, itemType: true, quantity: true, total: true } } },
      }),
      this.prisma.invoice.findUnique({
        where: { workOrderId },
        // `paid` and `balance` are maintained on the invoice itself by the
        // payment path, so they are read rather than recomputed here --
        // summing payments in a second place is how two screens start
        // disagreeing about what a customer owes.
        select: { invoiceNumber: true, total: true, paid: true, balance: true },
      }),
      this.priorVisitCount(tenantId, workOrder.assetId, workOrderId),
    ]);

    const itemIds = partLines.map((p) => p.inventoryItemId).filter((id): id is string => Boolean(id));
    const stockMovements = itemIds.length
      ? await this.prisma.stockMovement.findMany({
          where: { tenantId, referenceType: "WorkOrder", referenceId: workOrderId },
          select: { inventoryItemId: true, type: true, quantity: true, beforeQty: true, afterQty: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const staffIds = [...new Set(workOrder.tasks.flatMap((t) => t.assignments.map((a) => a.staffUserId)))];
    const staff = staffIds.length
      ? await this.prisma.staffUser.findMany({
          where: { tenantId, id: { in: staffIds } },
          select: { id: true, fullName: true, role: true },
        })
      : [];

    return {
      workOrderId: workOrder.id,
      status: workOrder.status,
      openedAt: workOrder.createdAt.toISOString(),
      closedAt: workOrder.closedAt?.toISOString() ?? null,
      customer: workOrder.customer,
      asset: workOrder.asset
        ? {
            id: workOrder.asset.id,
            category: workOrder.asset.category,
            identifier: workOrder.asset.plateNumber ?? workOrder.asset.serialNumber,
          }
        : null,
      servicesPerformed: workOrder.tasks.map((t) => ({
        taskId: t.id,
        serviceKey: t.serviceKey,
        title: t.title,
        status: t.status,
      })),
      people: staff.map((s) => ({ staffUserId: s.id, fullName: s.fullName, role: s.role })),
      parts: partLines.map((p) => ({
        name: p.name,
        quantity: p.quantity,
        provenance: p.provenance,
        inventoryItemId: p.inventoryItemId,
        charged: p.sellingPrice.toString(),
        cost: options.canViewCost ? (p.cost === null ? null : p.cost.toString()) : null,
        workshopWarranted: p.workshopWarranted,
        taskId: p.taskId,
        partRequestId: p.partRequestId,
      })),
      stockMovements: stockMovements.map((m) => ({
        itemId: m.inventoryItemId,
        type: m.type,
        quantity: m.quantity,
        beforeQty: m.beforeQty,
        afterQty: m.afterQty,
        at: m.createdAt.toISOString(),
      })),
      money: this.money(running?.lines ?? [], invoice),
      timeline: this.timeline(workOrder.tasks, events, inspections, faults, partLines, stockMovements),
      priorVisits,
    };
  }

  /** How many times this vehicle has been in before, excluding this visit. */
  private async priorVisitCount(tenantId: string, assetId: string, exceptWorkOrderId: string): Promise<number> {
    return this.prisma.workOrder.count({
      where: { tenantId, assetId, id: { not: exceptWorkOrderId } },
    });
  }

  private money(
    lines: readonly { name: string; itemType: string; quantity: number; total: unknown }[],
    invoice: { invoiceNumber: string; total: unknown; paid: unknown; balance: unknown } | null,
  ): DossierMoney {
    const mapped = lines.map((l) => ({
      name: l.name,
      itemType: l.itemType,
      quantity: l.quantity,
      total: String(l.total),
    }));
    const runningTotal = mapped.length
      ? mapped.reduce((sum, l) => sum + Number(l.total), 0).toFixed(2)
      : null;

    if (!invoice) {
      return { lines: mapped, runningTotal, invoiceNumber: null, invoiceTotal: null, paid: null, outstanding: null };
    }

    return {
      lines: mapped,
      runningTotal,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: String(invoice.total),
      paid: String(invoice.paid),
      outstanding: String(invoice.balance),
    };
  }

  /**
   * One ordered narrative out of six separate record types. Sorted by
   * time rather than grouped by kind, because the question a dossier
   * answers is "what happened, in what order" -- grouping by table is how
   * the information ends up back on five screens.
   */
  private timeline(
    tasks: readonly {
      id: string;
      title: string;
      status: string;
      serviceKey: string | null;
      createdAt: Date;
      assignments: readonly { staffUserId: string; assignedAt: Date }[];
      blockers: readonly { reason: string; note: string | null; status: string; createdAt: Date }[];
    }[],
    events: readonly { eventKey: string; actorId: string; createdAt: Date; payload: unknown }[],
    inspections: readonly { id: string; type: string; createdAt: Date; technicianId: string }[],
    faults: readonly { code: string | null; description: string; severity: string; createdAt: Date }[],
    parts: readonly { name: string; quantity: number; partRequestId: string | null; createdAt: Date }[],
    movements: readonly { type: string; quantity: number; createdAt: Date }[],
  ): DossierTimelineEntry[] {
    const entries: DossierTimelineEntry[] = [];

    for (const e of events) {
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      const isStatus = e.eventKey === "work_order.status_changed";
      entries.push({
        at: e.createdAt.toISOString(),
        kind: isStatus ? "STATUS" : "TASK",
        summary: isStatus ? `${payload.from ?? "?"} -> ${payload.to ?? "?"}` : e.eventKey,
        actorId: e.actorId,
        detail: payload,
      });
    }

    for (const t of tasks) {
      entries.push({
        at: t.createdAt.toISOString(),
        kind: "TASK",
        summary: `Task added: ${t.title}`,
        actorId: t.assignments[0]?.staffUserId ?? null,
        detail: { taskId: t.id, serviceKey: t.serviceKey, status: t.status },
      });
      for (const b of t.blockers) {
        entries.push({
          at: b.createdAt.toISOString(),
          kind: "BLOCKER",
          summary: `Blocked: ${b.reason}`,
          actorId: null,
          detail: { note: b.note, status: b.status, taskId: t.id },
        });
      }
    }

    for (const i of inspections) {
      entries.push({
        at: i.createdAt.toISOString(),
        kind: "INSPECTION",
        summary: `${i.type} inspection recorded`,
        actorId: i.technicianId,
        detail: { inspectionId: i.id },
      });
    }

    for (const f of faults) {
      entries.push({
        at: f.createdAt.toISOString(),
        kind: "FAULT",
        summary: f.code ? `Fault ${f.code}: ${f.description}` : `Fault: ${f.description}`,
        actorId: null,
        detail: { severity: f.severity },
      });
    }

    for (const p of parts) {
      entries.push({
        at: p.createdAt.toISOString(),
        kind: "PART",
        summary: p.partRequestId
          ? `Part added: ${p.name} x${p.quantity} (from parts request)`
          : `Part added: ${p.name} x${p.quantity}`,
        actorId: null,
        detail: { partRequestId: p.partRequestId },
      });
    }

    for (const m of movements) {
      entries.push({
        at: m.createdAt.toISOString(),
        kind: "STOCK",
        summary: `Stock ${m.type.toLowerCase()}: ${m.quantity}`,
        actorId: null,
        detail: {},
      });
    }

    return entries.sort((a, b) => a.at.localeCompare(b.at));
  }
}

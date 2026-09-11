import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { IntakeService } from "../../systems/operations/intake.service";
import { CatalogBrowseService } from "../../systems/inventory/catalog-browse.service";
import { StockService } from "../../systems/inventory/stock.service";
import { PartRequestService } from "../../systems/inventory/part-request.service";
import { WORK_ORDER_GRAPH, findVehicleMake, type SessionContext, percentage } from "@mop/shared";
import { type CategoryCode, Prisma, type WorkOrderStatus } from "@mop/database";
import { WorkOrderLifecycleService, type LifecycleActor } from "../../systems/operations/work-order-lifecycle.service";
import type {
  OperatorApproveRepairDto,
  OperatorIntakeDto,
  OperatorPosOrderDto,
  OperatorRepairApprovalRecord,
  OperatorUpdateQuoteDto,
  RegisterCustomerVehicleDto,
} from "./operator.dto";

/**
 * Unified canonical predicate for operator inspection review:
 * Only returns true if the order is UNDER_INSPECTION and has a completed/submitted inspection report.
 */
export function isAwaitingOperatorReview(
  order: { status: string } | null | undefined,
  insp?: { fields?: any; state?: string } | null,
): boolean {
  if (!order || !insp) return false;
  const fields = (insp.fields as Record<string, any>) ?? {};

  /*
    Work found after the job started.

    A technician who takes a wheel off and finds a seized caliper is in
    exactly the position the inspection report exists for -- somebody has
    to say yes and the customer has to be charged -- but the job is
    IN_PROGRESS by then, so it could never reach this queue. The
    technician's only options were to do unauthorised work or to walk to
    the front desk and describe it.

    It arrives here the same way an inspection does, on the same screen,
    and is approved by the same press.
  */
  if (fields.extraWorkPending === true) return true;

  if (order.status !== "UNDER_INSPECTION") return false;
  return (
    insp.state === "SUBMITTED" ||
    insp.state === "OPERATOR_REVIEW" ||
    fields.state === "SUBMITTED" ||
    fields.state === "OPERATOR_REVIEW" ||
    fields.inspectionReportSubmitted === true
  );
}

/**
 * What to call the vehicle on the approval screen.
 *
 * The operator is confirming they are quoting the right car, so this says
 * what it is -- "BMW 320i" -- rather than repeating the plate they can
 * already see with the category in brackets after it. Falls back to the
 * category alone when nobody recorded a make; it never guesses one.
 */
function describeVehicle(asset: {
  category?: string | null;
  make?: string | null;
  model?: string | null;
}): string {
  const known = findVehicleMake(asset.make);
  const words = [known?.label, asset.model?.trim() || null].filter((word): word is string => !!word);
  if (words.length > 0) return words.join(" ");
  return asset.category ? asset.category.replace(/_/g, " ") : "Vehicle";
}

export interface OperatorVehicleSummary {
  id: string;
  plateNumber: string | null;
  vinOrChassisNumber: string | null;
  category: string;
  /** The VEHICLE_MAKES id, or null for an asset registered before the field existed. */
  make: string | null;
  model: string | null;
  modelYear: number | null;
  ownedSince: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerCustomerId: string | null;
  activeWorkOrder?: {
    id: string;
    status: string;
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
  vehicles: OperatorVehicleSummary[];
}

@Injectable()
export class OperatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intakeService: IntakeService,
    private readonly lifecycle: WorkOrderLifecycleService,
    private readonly stock: StockService,
    private readonly partRequests: PartRequestService,
    @Optional() private readonly browse?: CatalogBrowseService,
  ) {}

  /**
   * The job, if this operator's branch scope actually reaches it.
   *
   * `getOverview` and `getInspectionReports` were already scoped, but the
   * three per-work-order routes took only a tenant id -- so an operator
   * restricted to one branch could read another branch's inspection report,
   * reprice its quote and dispatch its repair simply by holding the id. The
   * list they were shown never contained it; the id is guessable from any
   * other page that shows one, and nothing here checked.
   *
   * An empty scope means "every branch", which is how the session encodes an
   * unrestricted role -- see `branch-manager.controller.ts` for the same shape.
   */
  private async requireWorkOrderInScope(
    tenantId: string,
    workOrderId: string,
    branchScope: readonly string[],
  ): Promise<void> {
    const order = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId,
        ...(branchScope.length > 0 ? { branchId: { in: [...branchScope] } } : {}),
      },
      select: { id: true },
    });
    if (!order) {
      // Deliberately the same answer as a job that does not exist: telling a
      // caller "that one is real, just not yours" leaks the other branch's
      // workload back to them one id at a time.
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }
  }

  /**
   * Puts stock aside for an approved repair, through the ledger.
   *
   * This used to be a bare `warehouseStockBalance.update` with
   * `availableQty: { decrement }` and `reservedQty: { increment }`, wrapped in
   * a `catch {}` commented "non-fatal". Three things were wrong with that, and
   * the swallowed error was the least of them:
   *
   *   - `StockService`'s header states that nothing else in the codebase may
   *     update a balance, for the reason PHASE_7 is judged by -- every number
   *     on every screen traces to the movements that produced it. No movement
   *     row was written here, so `reservedQty` was the one bucket in inventory
   *     that `replay()` could not reproduce.
   *   - The read that decided there was enough stock took no lock, and the
   *     write took no lock either, so two operators approving the same part at
   *     the same instant could both reserve the last unit. `StockService.record`
   *     re-reads under `FOR UPDATE`.
   *   - A reservation that would overdraw the shelf was applied anyway, since
   *     nothing refused a negative result.
   *
   * `RESERVE` moves both buckets in one movement, so the shelf count and the
   * promised count can never disagree.
   */
  /**
   * The deposit this workshop asks for on a quote of this size.
   *
   * Percentage arithmetic happens in the money module, once, so the rounding
   * is the same rounding every other percentage in the product uses.
   */
  private async depositFor(tenantId: string, quoteTotal: string): Promise<string | null> {
    const config = await this.prisma.financeConfiguration.findUnique({
      where: { tenantId },
      select: { depositRequired: true, depositPercent: true },
    });
    if (!config?.depositRequired) return null;

    // money-lint-ok: a percentage (0-100), not currency.
    const percent = Number(config.depositPercent);
    if (percent <= 0) return null;

    return percentage(quoteTotal, percent);
  }

  private async reserve(
    tenantId: string,
    inventoryItemId: string,
    warehouseId: string,
    quantity: number,
    workOrderId: string,
    actorId: string,
  ): Promise<void> {
    await this.stock.record({
      tenantId,
      inventoryItemId,
      warehouseId,
      type: "RESERVE",
      quantity,
      actorId,
      referenceType: "WorkOrder",
      referenceId: workOrderId,
    });
  }

  /**
   * The warehouse that serves this job's branch.
   *
   * Deliberately refuses rather than falling back to "the first active
   * warehouse in the tenant", which is what this did before. That fallback is
   * exactly the hardcode the recovery mission forbids without architectural
   * justification, and it is wrong in the shape of workshop the fallback
   * exists for: in a multi-branch, multi-warehouse chain it silently reserved
   * North's brake pads against a repair booked in the South, so the shelf the
   * technician walks to still had the part and the shelf a hundred miles away
   * was short one. `BranchWarehouseAccess` is the serving relationship the
   * product models for exactly this question; if a branch has none, that is a
   * configuration answer the workshop has to give, not one to guess.
   */
  private async servingWarehouseId(tenantId: string, branchId: string | null): Promise<string | null> {
    if (!branchId) return null;
    const access = await this.prisma.branchWarehouseAccess.findFirst({
      where: { tenantId, branchId },
      select: { warehouseId: true },
      orderBy: { id: "asc" },
    });
    return access?.warehouseId ?? null;
  }

  /**
   * Complete overview of reception floor for the operator.
   */
  async getOverview(tenantId: string, branchScope: string[]): Promise<OperatorOverview> {
    const [branches, assets, activeOrders] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          tenantId,
          isActive: true,
          ...(branchScope.length > 0 ? { id: { in: branchScope } } : {}),
        },
        select: { id: true, name: true, code: true },
        orderBy: { code: "asc" },
      }),
      this.prisma.asset.findMany({
        where: { tenantId },
        select: {
          id: true,
          plateNumber: true,
          vinOrChassisNumber: true,
          category: true,
          make: true,
          model: true,
          modelYear: true,
          createdAt: true,
          ownershipHistory: {
            where: { endedAt: null },
            take: 1,
            select: {
              startedAt: true,
              customer: {
                select: { id: true, fullName: true, phone: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          status: { notIn: ["CLOSED", "CANCELLED"] },
          ...(branchScope.length > 0 ? { branchId: { in: branchScope } } : {}),
        },
        select: {
          id: true,
          assetId: true,
          status: true,
          createdAt: true,
          inspections: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { id: true, fields: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const activeOrderByAsset = new Map<string, (typeof activeOrders)[0]>();
    for (const order of activeOrders) {
      if (!activeOrderByAsset.has(order.assetId)) {
        activeOrderByAsset.set(order.assetId, order);
      }
    }

    const vehicleSummaries: OperatorVehicleSummary[] = assets.map((a) => {
      const owner = a.ownershipHistory[0]?.customer ?? null;
      const activeOrder = activeOrderByAsset.get(a.id) ?? null;
      const hasReport = isAwaitingOperatorReview(activeOrder, activeOrder?.inspections?.[0]);

      return {
        id: a.id,
        plateNumber: a.plateNumber,
        vinOrChassisNumber: a.vinOrChassisNumber,
        category: a.category,
        make: a.make,
        model: a.model,
        modelYear: a.modelYear,
        ownedSince: a.ownershipHistory[0]?.startedAt ? a.ownershipHistory[0].startedAt.toISOString() : a.createdAt.toISOString(),
        ownerName: owner?.fullName ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerCustomerId: owner?.id ?? null,
        activeWorkOrder: activeOrder
          ? {
              id: activeOrder.id,
              status: activeOrder.status,
              createdAt: activeOrder.createdAt.toISOString(),
              hasInspectionReport: hasReport,
            }
          : null,
      };
    });

    const inServiceCount = activeOrders.filter((o) => o.status !== "REGISTERED" && o.status !== "DRAFT").length;
    const intakeQueueCount = activeOrders.filter((o) => o.status === "REGISTERED" || o.status === "DRAFT").length;
    const pendingReportsCount = activeOrders.filter((o) =>
      isAwaitingOperatorReview(o, o.inspections?.[0]),
    ).length;

    return {
      metrics: {
        totalVehicles: assets.length,
        inServiceCount,
        intakeQueueCount,
        pendingReportsCount,
      },
      branches,
      vehicles: vehicleSummaries,
    };
  }

  /**
   * Omnibar search for reception: searches plate, VIN, customer name, and customer phone.
   */
  async searchReception(tenantId: string, rawQuery: string): Promise<OperatorVehicleSummary[]> {
    const q = rawQuery.trim();
    if (!q) {
      const overview = await this.getOverview(tenantId, []);
      return overview.vehicles;
    }

    const assets = await this.prisma.asset.findMany({
      where: {
        tenantId,
        OR: [
          { plateNumber: { contains: q, mode: "insensitive" } },
          { vinOrChassisNumber: { contains: q, mode: "insensitive" } },
          {
            ownershipHistory: {
              some: {
                endedAt: null,
                customer: {
                  OR: [
                    { fullName: { contains: q, mode: "insensitive" } },
                    { phone: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        plateNumber: true,
        vinOrChassisNumber: true,
        category: true,
        make: true,
        model: true,
        modelYear: true,
        createdAt: true,
        ownershipHistory: {
          where: { endedAt: null },
          take: 1,
          select: {
            startedAt: true,
            customer: {
              select: { id: true, fullName: true, phone: true },
            },
          },
        },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    const assetIds = assets.map((a) => a.id);
    const activeOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        assetId: { in: assetIds },
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      select: {
        id: true,
        assetId: true,
        status: true,
        createdAt: true,
      },
    });

    const activeOrderByAsset = new Map<string, (typeof activeOrders)[0]>();
    for (const order of activeOrders) {
      activeOrderByAsset.set(order.assetId, order);
    }

    return assets.map((a) => {
      const owner = a.ownershipHistory[0]?.customer ?? null;
      const activeOrder = activeOrderByAsset.get(a.id) ?? null;
      return {
        id: a.id,
        plateNumber: a.plateNumber,
        vinOrChassisNumber: a.vinOrChassisNumber,
        category: a.category,
        make: a.make,
        model: a.model,
        modelYear: a.modelYear,
        ownedSince: a.ownershipHistory[0]?.startedAt ? a.ownershipHistory[0].startedAt.toISOString() : a.createdAt.toISOString(),
        ownerName: owner?.fullName ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerCustomerId: owner?.id ?? null,
        activeWorkOrder: activeOrder
          ? {
              id: activeOrder.id,
              status: activeOrder.status,
              createdAt: activeOrder.createdAt.toISOString(),
            }
          : null,
      };
    });
  }

  /**
   * Register walk-in customer and vehicle together.
   */
  async registerCustomerAndVehicle(
    tenantId: string,
    dto: RegisterCustomerVehicleDto,
  ): Promise<OperatorVehicleSummary> {
    const cleanPhone = dto.phone.trim();
    const cleanName = dto.fullName.trim();
    const cleanPlate = dto.plateNumber.trim().toUpperCase();

    if (!cleanPhone || !cleanName || !cleanPlate) {
      throw new BadRequestException({
        code: "invalid_input",
        message: "Customer Name, Phone number, and Vehicle Plate are required.",
      });
    }

    // Find or create customer
    let customer = await this.prisma.customer.findFirst({
      where: { tenantId, phone: cleanPhone },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          tenantId,
          fullName: cleanName,
          phone: cleanPhone,
          email: dto.email?.trim() || null,
        },
      });
    }

    // Create vehicle asset
    const asset = await this.prisma.asset.create({
      data: {
        tenantId,
        plateNumber: cleanPlate,
        vinOrChassisNumber: dto.vinOrChassisNumber?.trim() || null,
        category: (dto.category ?? "CARS") as CategoryCode,
        // Stored lower-case because that is the key the fitment rules
        // match on; the label is a presentation concern.
        make: dto.make?.trim().toLowerCase() || null,
        model: dto.model?.trim() || null,
        modelYear: dto.modelYear ?? null,
      },
    });

    // Create ownership history
    const ownership = await this.prisma.assetOwnershipHistory.create({
      data: {
        tenantId,
        assetId: asset.id,
        customerId: customer.id,
        startedAt: new Date(),
      },
    });

    return {
      id: asset.id,
      plateNumber: asset.plateNumber,
      vinOrChassisNumber: asset.vinOrChassisNumber,
      category: asset.category,
      make: asset.make,
      model: asset.model,
      modelYear: asset.modelYear,
      ownedSince: ownership.startedAt.toISOString(),
      ownerName: customer.fullName,
      ownerPhone: customer.phone,
      ownerCustomerId: customer.id,
      activeWorkOrder: null,
    };
  }

  /**
   * Intake and book service for a pre-selected vehicle.
   */
  async createIntake(
    tenantId: string,
    dto: OperatorIntakeDto,
    session: SessionContext,
  ): Promise<{ workOrderId: string; status: string; assetId: string }> {
    if (!dto.complaint?.trim()) {
      throw new BadRequestException({
        code: "complaint_required",
        message: "Please describe the problem or select at least one inspection subsystem.",
      });
    }

    const asset = await this.prisma.asset.findFirst({
      where: { id: dto.assetId, tenantId },
      include: {
        ownershipHistory: {
          where: { endedAt: null },
          take: 1,
          include: { customer: true },
        },
      },
    });

    if (!asset || asset.tenantId !== tenantId) {
      throw new BadRequestException({
        code: "asset_not_found",
        message: "Selected vehicle not found in this workshop.",
      });
    }

    const customer = asset.ownershipHistory[0]?.customer;
    if (!customer) {
      throw new BadRequestException({
        code: "owner_not_found",
        message: "This vehicle has no active owner assigned. Please register an owner first.",
      });
    }

    // Resolve branch
    let branchId = dto.branchId;
    if (!branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          tenantId,
          isActive: true,
          ...(session.branchScope.length > 0 ? { id: { in: session.branchScope } } : {}),
        },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException({
          code: "no_active_branch",
          message: "No active branches configured for this workshop.",
        });
      }
      branchId = branch.id;
    }

    const actor: LifecycleActor = {
      accountId: session.accountId,
      displayName: session.displayName || "Operator",
      actorType: "TENANT_STAFF",
    };

    const partsFormatted =
      dto.inspectionParts && dto.inspectionParts.length > 0
        ? `[Inspection Parts: ${dto.inspectionParts.join(", ")}] `
        : "";
    const fullComplaint = `${partsFormatted}${dto.complaint.trim()}`;

    const result = await this.intakeService.intake(
      {
        tenantId,
        branchId,
        customer: { existingCustomerId: customer.id },
        asset: { existingAssetId: asset.id },
        complaint: fullComplaint,
        inspectionDeclined: dto.inspectionDeclined ?? false,
      },
      actor,
    );

    let finalStatus = result.status;
    if (!dto.inspectionDeclined) {
      // Ask for the INTENT and let the graph decide where it lands.
      //
      // This used to write `status: "UNDER_INSPECTION" as any` directly, behind
      // an `if (this.prisma.workOrder?.update)` guard and a `catch {}` whose
      // comment read "non-fatal if in mock test" -- production code shaped
      // around a unit-test mock, which meant intake could report a status the
      // database never reached, and the transition produced no OperationEvent,
      // no audit row and no gate check. A workshop that has inspection turned
      // off would still have been forced into UNDER_INSPECTION here.
      const transition = await this.lifecycle.apply(result.workOrderId, tenantId, "START_INSPECTION", actor);
      finalStatus = transition.to;

      // Not swallowed. The transition above says this job is under
      // inspection; an inspection row that quietly failed to exist leaves the
      // technician a job in a state with nothing to fill in.
      await this.prisma.inspection.create({
        data: {
          tenantId,
          workOrderId: result.workOrderId,
          technicianId: session.accountId,
          type: "QUICK",
          fields: {
            requestedParts: dto.inspectionParts && dto.inspectionParts.length > 0 ? dto.inspectionParts : undefined,
            // A recorded decision, not an absence -- see the note on the DTO.
            fullInspection: dto.fullInspection === true ? true : undefined,
            completedBoxes: {},
          },
        },
      });
    }

    return {
      workOrderId: result.workOrderId,
      status: finalStatus,
      assetId: asset.id,
    };
  }

  /**
   * Browse parts catalog for over-the-counter POS.
   */
  async browseCatalog(tenantId: string, query: any) {
    if (!this.browse) {
      return { items: [], total: 0, page: 1, pageSize: 24, categories: [], filters: [] };
    }
    return this.browse.browse(tenantId, query);
  }

  /**
   * Over-the-counter POS parts checkout executed by the Operator.
   */
  async createPosOrder(tenantId: string, dto: OperatorPosOrderDto, session: SessionContext) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: "lines_required",
        message: "No parts in cart to order.",
      });
    }

    // Resolve branch
    const branch = await this.prisma.branch.findFirst({
      where: {
        tenantId,
        isActive: true,
        ...(session.branchScope.length > 0 ? { id: { in: session.branchScope } } : {}),
      },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException({
        code: "no_active_branch",
        message: "No active branch found.",
      });
    }

    // Verify stock and fetch item details
    const itemIds = dto.lines.map((l) => l.inventoryItemId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, id: { in: itemIds } },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    let grandTotal = 0;
    const lineDetails = [];

    for (const line of dto.lines) {
      const item = itemMap.get(line.inventoryItemId);
      if (!item) {
        throw new BadRequestException({
          code: "item_not_found",
          message: `Item ${line.inventoryItemId} not found.`,
        });
      }
      const price = item.sellingPrice ? Number(item.sellingPrice) : 0;
      grandTotal += price * line.quantity;
      lineDetails.push({
        item,
        quantity: line.quantity,
        unitPrice: price,
        lineTotal: price * line.quantity,
      });
    }

    // Resolve or create counter customer
    let customerId = dto.customerId;
    if (!customerId) {
      let counterCustomer = await this.prisma.customer.findFirst({
        where: { tenantId, phone: "0000000000" },
      });
      if (!counterCustomer) {
        counterCustomer = await this.prisma.customer.create({
          data: {
            tenantId,
            fullName: "Counter Walk-in Customer",
            phone: "0000000000",
          },
        });
      }
      customerId = counterCustomer.id;
    }

    // Resolve or create counter asset
    let counterAsset = await this.prisma.asset.findFirst({
      where: { tenantId, plateNumber: "COUNTER-SALE" },
    });
    if (!counterAsset) {
      counterAsset = await this.prisma.asset.create({
        data: {
          tenantId,
          plateNumber: "COUNTER-SALE",
          category: "CARS",
        },
      });
    }

    // A counter sale starts where every work order starts, then takes the
    // graph's declared counter-sale edge to PAYMENT_PENDING. Assigning that
    // status here skipped the FINANCE_CORE requirement on both the edge in and
    // the only edge out, stranding the sale in a shop that has no finance
    // module -- see WORK_ORDER_GRAPH's "counter sale -> invoice".
    const workOrder = await this.prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branch.id,
        customerId,
        assetId: counterAsset.id,
        status: WORK_ORDER_GRAPH.initial as WorkOrderStatus,
      },
    });

    await this.lifecycle.apply(workOrder.id, tenantId, "ISSUE_INVOICE", {
      accountId: session.accountId,
      displayName: session.displayName || "Operator",
      actorType: "TENANT_STAFF",
    });

    const invoiceNumber = `INV-POS-${Date.now().toString().slice(-6)}`;
    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        workOrderId: workOrder.id,
        invoiceNumber,
        subtotal: grandTotal.toFixed(2),
        total: grandTotal.toFixed(2),
        balance: grandTotal.toFixed(2),
        paid: "0.00",
        issuedById: session.accountId,
      },
    });

    const totalItems = lineDetails.reduce((s, l) => s + l.quantity, 0);

    return {
      workOrderId: workOrder.id,
      invoiceId: invoice.id,
      invoiceNumber,
      total: grandTotal.toFixed(2),
      itemsCount: totalItems,
    };
  }

  /**
   * Fetch all inspection reports submitted by technicians awaiting operator review & quote dispatch.
   */
  async getInspectionReports(tenantId: string, branchScope?: string[]) {
    const orders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...(branchScope && branchScope.length > 0 ? { branchId: { in: branchScope } } : {}),
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      include: {
        asset: { select: { id: true, plateNumber: true, category: true, vinOrChassisNumber: true, make: true, model: true } },
        customer: { select: { id: true, fullName: true, phone: true } },
        inspections: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
        faults: {
          select: { id: true, description: true, severity: true, recommendedService: true, code: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return orders
      .filter((o) => isAwaitingOperatorReview(o, o.inspections[0]))
      .map((o) => {
        const insp = o.inspections[0];
        const fields = (insp?.fields as Record<string, any>) ?? {};
        const pricing = fields.pricing ?? { partsTotal: 0, laborTotal: 0, grandTotal: 0 };
        const findingsList =
          fields.findings && Array.isArray(fields.findings) && fields.findings.length > 0
            ? fields.findings
            : o.faults.map((f) => ({
                id: f.id,
                description: f.description,
                severity: f.severity,
                recommendedService: f.recommendedService,
                code: f.code,
              }));

        const plate = o.asset.plateNumber ?? "Vehicle";
        const vehicleModel = describeVehicle(o.asset);
        const vin = o.asset.vinOrChassisNumber ?? "VIN-UNSPECIFIED";

        return {
          workOrderId: o.id,
          identifier: plate,
          vehicleModel,
          vin,
          customerName: o.customer.fullName,
          customerPhone: o.customer.phone ?? null,
          vehicle: {
            id: o.asset.id ?? o.assetId ?? "asset",
            plateNumber: plate,
            model: vehicleModel,
            vin,
          },
          customer: {
            id: o.customer.id ?? o.customerId ?? "cust",
            name: o.customer.fullName,
            phone: o.customer.phone ?? "",
          },
          status: o.status,
          inspectionId: insp?.id ?? null,
          submittedAt: fields.submittedAt ?? (o.updatedAt?.toISOString ? o.updatedAt.toISOString() : new Date().toISOString()),
          findingsCount: findingsList.length,
          findings: findingsList,
          partsCount: (fields.parts ?? []).length,
          parts: fields.parts ?? [],
          servicesCount: (fields.services ?? []).length,
          services: fields.services ?? [],
          pricing,
          totalEstimate: Number(pricing.grandTotal || 0),
        };
      });
  }

  /**
   * Get single inspection report detail for the quote builder drawer.
   */
  async getInspectionReportDetail(tenantId: string, workOrderId: string, branchScope: readonly string[] = []) {
    await this.requireWorkOrderInScope(tenantId, workOrderId, branchScope);
    const order = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      include: {
        asset: { select: { id: true, plateNumber: true, category: true, vinOrChassisNumber: true, make: true, model: true } },
        customer: { select: { id: true, fullName: true, phone: true } },
        inspections: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
        faults: true,
      },
    });

    if (!order) {
      throw new BadRequestException({ code: "order_not_found", message: "Work order not found" });
    }

    const insp = order.inspections[0];
    const fields = (insp?.fields as Record<string, any>) ?? {};
    const findings =
      fields.findings && fields.findings.length > 0
        ? fields.findings
        : order.faults.map((f) => ({
            id: f.id,
            description: f.description,
            severity: f.severity,
            recommendedService: f.recommendedService,
            code: f.code,
          }));

    const parts = fields.parts ?? [];
    const services = fields.services ?? [];
    const partsTotal = parts.reduce((sum: number, p: any) => sum + Number(p.unitPrice || 0) * (p.quantity || 1), 0);
    const laborTotal = services.reduce((sum: number, s: any) => sum + Number(s.laborPrice || 0), 0);
    const grandTotal = partsTotal + laborTotal;

    const plate = order.asset.plateNumber ?? "Vehicle";
    const vehicleModel = describeVehicle(order.asset);
    const vin = order.asset.vinOrChassisNumber ?? "VIN-UNSPECIFIED";

    return {
      workOrderId: order.id,
      identifier: plate,
      vehicleModel,
      vin,
      customerName: order.customer.fullName,
      customerPhone: order.customer.phone ?? null,
      vehicle: {
        id: order.asset.id ?? order.assetId ?? "asset",
        plateNumber: plate,
        model: vehicleModel,
        vin,
      },
      customer: {
        id: order.customer.id ?? order.customerId ?? "cust",
        name: order.customer.fullName,
        phone: order.customer.phone ?? "",
      },
      status: order.status,
      submittedAt: fields.submittedAt ?? (order.updatedAt?.toISOString ? order.updatedAt.toISOString() : new Date().toISOString()),
      findings,
      parts,
      services,
      notes: fields.note ?? "",
      pricing: {
        partsTotal,
        laborTotal,
        grandTotal,
      },
      inspection: {
        id: insp?.id ?? null,
        submittedAt: fields.submittedAt ?? (order.updatedAt?.toISOString ? order.updatedAt.toISOString() : new Date().toISOString()),
        submittedBy: fields.submittedBy ?? null,
        note: fields.note ?? "",
        findings,
        parts,
        services,
        pricing: {
          partsTotal,
          laborTotal,
          grandTotal,
        },
      },
    };
  }

  /**
   * Update quote items (parts from POS, services, severities) on an inspection report.
   */
  async updateQuote(tenantId: string, workOrderId: string, dto: OperatorUpdateQuoteDto, branchScope: readonly string[] = []) {
    await this.requireWorkOrderInScope(tenantId, workOrderId, branchScope);
    const inspection = await this.prisma.inspection.findFirst({
      where: { workOrderId, tenantId },
      orderBy: { startedAt: "desc" },
    });

    const currentFields = (inspection?.fields as Record<string, any>) ?? {};
    const parts = dto.parts ?? currentFields.parts ?? [];
    const services = dto.services ?? currentFields.services ?? [];
    const findings = dto.findings ?? currentFields.findings ?? [];

    const partsTotal = parts.reduce((sum: number, p: any) => sum + Number(p.unitPrice || 0) * (p.quantity || 1), 0);
    const laborTotal = services.reduce((sum: number, s: any) => sum + Number(s.laborPrice || 0), 0);
    const grandTotal = partsTotal + laborTotal;

    const updatedFields = {
      ...currentFields,
      findings,
      parts,
      services,
      note: dto.note ?? currentFields.note ?? "",
      pricing: { partsTotal, laborTotal, grandTotal },
    };

    if (inspection) {
      await this.prisma.inspection.update({
        where: { id: inspection.id },
        data: { fields: updatedFields },
      });
    }

    return {
      success: true,
      workOrderId,
      pricing: { partsTotal, laborTotal, grandTotal },
    };
  }

  /**
   * Approve repair quote & dispatch work order to repair stage.
   * Authoritative backend validation:
   * - Validates work order is UNDER_INSPECTION and awaiting review.
   * - Filters approved findings, services, and parts.
   * - Recalculates authoritative pricing on backend.
   * - Persists OperatorRepairApproval audit trail.
   * - Creates tasks ONLY for approved services.
   * - Processes inventory allocation & PartRequests ONLY for approved parts.
   * - Transitions work order to APPROVED_FOR_WORK.
   */
  async approveRepair(
    tenantId: string,
    workOrderId: string,
    dto: OperatorApproveRepairDto,
    session: SessionContext,
  ) {
    // The branch filter goes on the load this method already does, rather than
    // in a separate guard call before it: one query, and no way for a later
    // edit to move the load above the check.
    const branchScope = session.branchScope ?? [];
    const order = await this.prisma.workOrder.findFirst({
      where: {
        id: workOrderId,
        tenantId,
        ...(branchScope.length > 0 ? { branchId: { in: [...branchScope] } } : {}),
      },
      include: {
        inspections: { orderBy: { startedAt: "desc" }, take: 1 },
        faults: true,
      },
    });

    if (!order) {
      // Not found, not forbidden — a 403 on another branch's id confirms the
      // id is real, which hands that branch's workload back one guess at a time.
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }

    const insp = order.inspections[0];
    if (!isAwaitingOperatorReview(order, insp)) {
      throw new BadRequestException({
        code: "invalid_state",
        message: "Work order is not awaiting operator review or inspection report is not submitted.",
      });
    }

    const fields = (insp?.fields as Record<string, any>) ?? {};
    const allParts: any[] = fields.parts ?? [];
    const allServices: any[] = fields.services ?? [];
    const allFindings: any[] =
      fields.findings && Array.isArray(fields.findings) && fields.findings.length > 0
        ? fields.findings
        : (order.faults ?? []).map((f: any) => ({
            id: f.id,
            description: f.description,
            severity: f.severity,
            recommendedService: f.recommendedService,
            code: f.code,
          }));

    // 1. Resolve approved findings
    let approvedFindings: any[];
    if (dto.approvedFindingIds && dto.approvedFindingIds.length > 0) {
      const allowedFindingIds = new Set(dto.approvedFindingIds.map(String));
      approvedFindings = allFindings.filter(
        (f, idx) =>
          allowedFindingIds.has(String(f.id)) ||
          allowedFindingIds.has(String(f.code)) ||
          allowedFindingIds.has(String(idx)),
      );
    } else if (dto.approvedFindings && Array.isArray(dto.approvedFindings) && dto.approvedFindings.length > 0) {
      approvedFindings = dto.approvedFindings;
    } else {
      approvedFindings = allFindings;
    }

    // 2. Resolve approved services
    let approvedServices: any[];
    if (dto.approvedServiceIds && dto.approvedServiceIds.length > 0) {
      const allowedServiceIds = new Set(dto.approvedServiceIds.map(String));
      approvedServices = allServices.filter(
        (s, idx) =>
          allowedServiceIds.has(String(s.id)) ||
          allowedServiceIds.has(String(s.serviceName)) ||
          allowedServiceIds.has(String(s.name)) ||
          allowedServiceIds.has(String(s.code)) ||
          allowedServiceIds.has(String(idx)),
      );
    } else if (dto.approvedFindingIds && dto.approvedFindingIds.length > 0) {
      const allowedFindingIds = new Set(dto.approvedFindingIds.map(String));
      approvedServices = allServices.filter(
        (s, idx) =>
          (s.findingId && allowedFindingIds.has(String(s.findingId))) ||
          allowedFindingIds.has(String(idx)),
      );
      if (approvedServices.length === 0 && allServices.length > 0 && approvedFindings.length > 0) {
        approvedServices = allServices.filter((_, idx) => allowedFindingIds.has(String(idx)));
      }
    } else if (dto.approvedServices && Array.isArray(dto.approvedServices) && dto.approvedServices.length > 0) {
      approvedServices = dto.approvedServices;
    } else {
      approvedServices = allServices;
    }

    // 3. Resolve approved parts (CRITICAL: unapproved parts have ZERO inventory impact)
    let approvedParts: any[];
    if (dto.approvedPartIds && dto.approvedPartIds.length > 0) {
      const allowedPartIds = new Set(dto.approvedPartIds.map(String));
      approvedParts = allParts.filter(
        (p, idx) =>
          allowedPartIds.has(String(p.id)) ||
          allowedPartIds.has(String(p.sku)) ||
          allowedPartIds.has(String(p.inventoryItemId)) ||
          allowedPartIds.has(String(p.name)) ||
          allowedPartIds.has(String(idx)),
      );
    } else if (dto.approvedFindingIds && dto.approvedFindingIds.length > 0) {
      const allowedFindingIds = new Set(dto.approvedFindingIds.map(String));
      approvedParts = allParts.filter(
        (p, idx) =>
          (p.findingId && allowedFindingIds.has(String(p.findingId))) ||
          allowedFindingIds.has(String(idx)),
      );
      if (approvedParts.length === 0 && allParts.length > 0 && approvedFindings.length > 0) {
        approvedParts = allParts.filter((_, idx) => allowedFindingIds.has(String(idx)));
      }
    } else if ((dto as any).approvedParts && Array.isArray((dto as any).approvedParts)) {
      approvedParts = (dto as any).approvedParts;
    } else {
      approvedParts = allParts;
    }

    // 4. Backend Authoritative Price Recalculation
    const partsTotal = approvedParts.reduce(
      (sum: number, p: any) => sum + Number(p.unitPrice || 0) * (p.quantity || 1),
      0,
    );
    const laborTotal = approvedServices.reduce(
      (sum: number, s: any) => sum + Number(s.laborPrice || 0),
      0,
    );
    const grandTotal = partsTotal + laborTotal;

    // What the customer is asked for up front, if this workshop asks.
    //
    // `depositRequired` and `depositPercent` are settable on the owner's
    // Pricing page and were read by nothing, so a workshop that configured a
    // 30% deposit was configuring a checkbox. This is the point in the journey
    // where a deposit is actually collected -- the moment the customer agrees
    // to the work -- so it is the moment the number has to appear.
    //
    // MOP does not hold the deposit as its own record: money reaches the
    // system as a payment against the invoice, and a deposit taken before an
    // invoice exists has nothing to settle against. What the workshop gets is
    // the amount to collect, computed from the quote it just approved,
    // through the money module rather than the float arithmetic above.
    const depositDue = await this.depositFor(tenantId, grandTotal.toFixed(2));

    // 4b. Everything this approval needs, checked before anything is written.
    //
    // The serving-warehouse check used to live inside the part loop at step 9,
    // after the inspection had been stamped approved, after the lifecycle had
    // already applied APPROVE, and after the repair tasks had been created --
    // none of it in a transaction. So a branch with no store answered
    // `400 branch_has_no_serving_warehouse` to the operator while the database
    // kept the approval: the work order sat in APPROVED_FOR_WORK with two
    // ASSIGNED tasks, an approved quote naming a part, and no reservation, no
    // part request and no part line anywhere. The operator was told the job
    // could not be dispatched; the technician found it dispatched.
    //
    // Resolving the catalogued parts here also removes the per-part lookups
    // the loop used to do.
    const warehouseId = await this.servingWarehouseId(tenantId, order.branchId);
    const resolvedParts = new Map<number, { id: string; sku: string; name: string }>();
    for (const [index, part] of approvedParts.entries()) {
      let item: { id: string; sku: string; name: string } | null = null;
      if (part.inventoryItemId) {
        item = await this.prisma.inventoryItem.findFirst({
          where: { id: part.inventoryItemId, tenantId },
          select: { id: true, sku: true, name: true },
        });
      }
      if (!item && part.sku) {
        item = await this.prisma.inventoryItem.findFirst({
          where: { sku: part.sku, tenantId },
          select: { id: true, sku: true, name: true },
        });
      }
      if (item) resolvedParts.set(index, item);
    }

    // A catalogued part with nowhere to draw it from is a configuration answer
    // the workshop owes, not something to slide past. Booking the customer for
    // a part no shelf was ever asked for is how the technician finds out at
    // the bay.
    if (resolvedParts.size > 0 && !warehouseId) {
      throw new BadRequestException({
        code: "branch_has_no_serving_warehouse",
        message:
          "This branch is not served by any store, so parts cannot be reserved for it. " +
          "Link a warehouse to the branch before dispatching a repair that needs stock.",
      });
    }

    // 5. Persisted OperatorRepairApproval Record (Audit Trail)
    const approvalRecord: OperatorRepairApprovalRecord = {
      workOrderId,
      approvedFindingIds: dto.approvedFindingIds ?? approvedFindings.map((f: any, idx: number) => String(f.id || f.code || idx)),
      approvedPartIds: dto.approvedPartIds ?? approvedParts.map((p: any, idx: number) => String(p.inventoryItemId || p.id || p.sku || p.name || idx)),
      approvedServiceIds: dto.approvedServiceIds ?? approvedServices.map((s: any, idx: number) => String(s.id || s.serviceName || s.name || idx)),
      approvedAt: new Date().toISOString(),
      approvedByStaffId: session.accountId,
      operatorNote: dto.operatorNote || dto.note || "",
      pricing: {
        partsTotal,
        laborTotal,
        grandTotal,
      },
    };

    // 6. Mark inspection completed and persist approval record
    if (insp) {
      // tenant-scope-ok: `insp` came off `order`, which was loaded by
      // tenantId and branch scope above.
      await this.prisma.inspection.update({
        where: { id: insp.id },
        data: {
          completedAt: new Date(),
          fields: {
            ...fields,
            operatorApproved: true,
            approvedAt: approvalRecord.approvedAt,
            approvedBy: approvalRecord.approvedByStaffId,
            operatorApproval: approvalRecord,
            approvedFindings,
            approvedServices,
            approvedParts,
            approvedPricing: {
              partsTotal,
              laborTotal,
              grandTotal,
            },
          } as any,
        },
      });
    }

    // 7. Authorize the work -- through the graph, not by assignment.
    //
    // Writing "APPROVED_FOR_WORK" here skipped the `inspection_completed` gate
    // and the APPROVAL_REQUIRED_SCOPE policy, so a workshop configured to send
    // findings to the customer first had that requirement bypassed every time
    // an operator pressed Dispatch. Where the graph routes an APPROVE from
    // UNDER_INSPECTION depends on that policy, which is exactly why this
    // service must not name the destination.
    const authorized = await this.lifecycle.apply(workOrderId, tenantId, "APPROVE", {
      accountId: session.accountId,
      displayName: session.displayName || "Operator",
      actorType: "TENANT_STAFF",
    });

    // 8. Plan the approved work.
    //
    // The titles come from the tasks the operator actually composed on the
    // page, falling back to the approved services. Both of those used to miss:
    // the page sends `tasks`, this read `tasksToCreate` (which nothing has ever
    // sent), and the fallback read `s.name` while the page writes
    // `serviceName` -- so every dispatched task was called
    // "Perform Vehicle Repair", whatever the operator approved.
    const plannedTitles: string[] =
      dto.tasks && dto.tasks.length > 0
        ? dto.tasks.map((task) => task.title).filter((title) => title.trim().length > 0)
        : approvedServices
            .map((service: { serviceName?: string; name?: string; title?: string }) =>
              (service.serviceName ?? service.name ?? service.title ?? "").trim(),
            )
            .filter((title) => title.length > 0);

    // A job with nothing nameable still needs one task, or the technician is
    // dispatched to a card with no work on it.
    const titles = plannedTitles.length > 0 ? plannedTitles : ["Complete Inspected Repairs & Adjustments"];

    for (const title of titles) {
      // Not swallowed, for the reason the line above states: a dispatched job
      // whose tasks silently did not save is a technician staring at an empty
      // card, and the operator was told it went through.
      await this.prisma.task.create({
        data: {
          tenantId,
          workOrderId,
          title,
          status: "ASSIGNED",
        },
      });
    }

    // 9. Process approved parts against inventory:
    // ONLY approved parts are processed. Unapproved parts have ZERO inventory impact.
    const parts = approvedParts;
    let partsAllocated = 0;
    let partsRequested = 0;

    for (const [partIndex, p] of parts.entries()) {
      const requiredQty = Math.max(1, Number(p.quantity) || 1);
      const unitPrice = new Prisma.Decimal(Number(p.unitPrice) || 0);
      const partName = p.name || "Replacement Part";

      // Idempotency: Check if this part was already processed for this work order
      // Whether this part has already been put on the job.
      //
      // The read used to sit inside `try {} catch { /* non-fatal in mock
      // tests */ }`, so any failure answered "not handled yet" and the part
      // was allocated, charged and requested a second time. An idempotency
      // check that fails open is not an idempotency check.
      const existingLines = await this.prisma.workOrderPartLine.findMany({
        where: { tenantId, workOrderId },
        select: { inventoryItemId: true, name: true },
      });
      const alreadyHandled = existingLines.some(
        (line) => (p.inventoryItemId && line.inventoryItemId === p.inventoryItemId) || line.name === partName,
      );

      if (alreadyHandled) {
        continue;
      }

      // Which catalogued part this quote line means, resolved at step 4b
      // before anything was written.
      const inventoryItem = resolvedParts.get(partIndex) ?? null;

      // If inventory item and warehouse exist, check stock balance
      if (inventoryItem && warehouseId) {
        // How much is actually on that shelf. Swallowed, this read answered
        // "nothing available" on any failure, which sent a part that was in
        // stock down the shortfall path and told the store to order one.
        const balanceRow = await this.prisma.warehouseStockBalance.findUnique({
          where: {
            inventoryItemId_warehouseId: {
              inventoryItemId: inventoryItem.id,
              warehouseId,
            },
          },
          select: { availableQty: true, reservedQty: true },
        });

        const available = balanceRow ? Math.max(0, balanceRow.availableQty) : 0;

        if (available >= requiredQty) {
          // Scenario A: FULLY IN STOCK
          await this.reserve(tenantId, inventoryItem.id, warehouseId, requiredQty, workOrderId, session.accountId);

          await this.prisma.workOrderPartLine.create({
            data: {
              tenantId,
              workOrderId,
              name: partName,
              provenance: "INVENTORY",
              inventoryItemId: inventoryItem.id,
              quantity: requiredQty,
              sellingPrice: unitPrice,
              addedById: session.accountId,
              workshopWarranted: true,
            },
          });
          partsAllocated++;
        } else {
          // Scenario B: SHORTFALL OR COMPLETELY OUT OF STOCK
          const allocQty = available > 0 ? available : 0;
          const shortfallQty = requiredQty - allocQty;

          if (allocQty > 0) {
            // Reserve whatever is actually on the shelf. The previous version
            // set `availableQty: 0` outright rather than decrementing by the
            // amount it reserved, so a concurrent receipt landing between the
            // read and this write was silently erased.
            await this.reserve(tenantId, inventoryItem.id, warehouseId, allocQty, workOrderId, session.accountId);

            await this.prisma.workOrderPartLine.create({
              data: {
                tenantId,
                workOrderId,
                name: partName,
                provenance: "INVENTORY",
                inventoryItemId: inventoryItem.id,
                quantity: allocQty,
                sellingPrice: unitPrice,
                addedById: session.accountId,
                workshopWarranted: true,
              },
            });
            partsAllocated++;
          }

          // The shortfall becomes a real part request, through the service
          // that owns the concept.
          //
          // This used to write the row by hand behind an `as any` cast, inside
          // a `try {} catch { /* non-fatal */ }` -- so it produced a
          // PartRequest with no `part_request.created` event, no audit entry,
          // and no `REQUEST_PART` transition, and when it failed the operator
          // was told the repair had been dispatched anyway. A second writer of
          // a table with different rules is the same defect as the operator
          // writing WarehouseStockBalance by hand (REC-015); this one hid
          // longer because the cast turned the type system off.
          //
          // Not swallowed: the customer has approved a repair that needs a part
          // the shelf cannot supply, and if the store is never told, the job
          // waits for a part nobody ordered.
          const created = await this.partRequests.request(
            {
              tenantId,
              workOrderId,
              inspectionId: insp?.id ?? undefined,
              inventoryItemId: inventoryItem.id,
              quantity: shortfallQty,
              reason: `Required part for approved inspection quote (${partName})`,
              urgency: "urgent",
            },
            {
              accountId: session.accountId,
              displayName: session.displayName ?? "Operator",
              actorType: "TENANT_STAFF",
            },
          );
          const partRequestId: string = created.id;

          await this.prisma.workOrderPartLine.create({
            data: {
              tenantId,
              workOrderId,
              name: partName,
              provenance: "INVENTORY",
              inventoryItemId: inventoryItem.id,
              partRequestId: partRequestId ?? undefined,
              quantity: shortfallQty,
              sellingPrice: unitPrice,
              addedById: session.accountId,
              workshopWarranted: true,
            },
          });
          partsRequested++;
        }
      } else {
        // Scenario C: Non-inventory / custom workshop-sourced part
        await this.prisma.workOrderPartLine.create({
          data: {
            tenantId,
            workOrderId,
            name: partName,
            provenance: inventoryItem ? "INVENTORY" : "EXTERNAL_PURCHASE",
            inventoryItemId: inventoryItem?.id ?? null,
            quantity: requiredQty,
            sellingPrice: unitPrice,
            addedById: session.accountId,
            workshopWarranted: true,
          },
        });
      }
    }

    return {
      success: true,
      workOrderId,
      // Where the job actually landed, which is not always APPROVED_FOR_WORK:
      // under APPROVAL_REQUIRED_SCOPE the same intent routes to
      // AWAITING_CUSTOMER_APPROVAL, and the page must not be told otherwise.
      newStatus: authorized.to,
      // Null when the workshop asks for no deposit -- an absent obligation,
      // not a zero one, so the page can say nothing rather than "0.00 due".
      depositDue,
      message: "Inspection quote approved and dispatched to technician for repair!",
      partsProcessed: parts.length,
      partsAllocated,
      partsRequested,
      approval: approvalRecord,
    };
  }

}

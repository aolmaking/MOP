import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { sum, WORK_ORDER_GRAPH } from "@mop/shared";
import type { CategoryCode, WorkOrderStatus } from "@mop/database";
import type { SessionContext } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AWAITING_CUSTOMER_STATUSES } from "./decision.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { IntakeService } from "../operations/intake.service";
import { WorkOrderLifecycleService, type LifecycleActor } from "../operations/work-order-lifecycle.service";
import type { ReportCustomerIssueDto } from "./report-issue.dto";
import type { CustomerPosOrderDto } from "./customer-pos-order.dto";

export interface PortalHome {
  readonly assetCount: number;
  readonly currentServiceCount: number;
  readonly pendingDecisions: number;
  readonly openInvoiceBalance: string;
  readonly recentActivity: readonly { id: string; message: string; createdAt: string }[];
}

export interface PortalAsset {
  readonly id: string;
  readonly category: string;
  readonly plateNumber: string | null;
  readonly vinOrChassisNumber: string | null;
  readonly ownedSince: string;
}

export interface CurrentServiceItem {
  readonly workOrderId: string;
  readonly status: string;
  readonly asset: string;
  readonly createdAt: string;
  readonly promisedAt?: string | null;
}

export interface InvoiceStatusRow {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly status: string;
  readonly total: string;
  readonly paid: string;
  readonly balance: string;
  readonly issuedAt: string;
}

export interface SafeHistoryEntry {
  readonly id: string;
  readonly assetId: string;
  readonly summary: string;
  readonly serviceDate: string;
}

/** Every open work-order status a customer's own job can currently be in. */
const CURRENT_SERVICE_STATUSES = [
  "DRAFT",
  "REGISTERED",
  "UNDER_INSPECTION",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED_FOR_WORK",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "WAITING_CUSTOMER",
  "BLOCKED",
  "READY_FOR_TEAM_REVIEW",
  "READY_FOR_QC",
  "QC_FAILED",
  "READY_FOR_DELIVERY",
  "PAYMENT_PENDING",
] as const;

/**
 * The Customer Portal's own surfaces.
 *
 * Every query here is keyed by `customerId` from the session, never by a
 * parameter -- a customer's portal must never be able to widen its own
 * scope by passing somebody else's id. Restricted fields (internal notes,
 * cost, warehouse, staff identity) are absent from every shape returned
 * here, the same discipline `SafeTechnicalHistory`/`CustomerDecisionService`
 * already apply -- never hidden client-side.
 */
@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly policies?: PolicyResolutionService,
    @Optional() private readonly intakeService?: IntakeService,
    // Required in the module; last so the several specs that construct this
    // service by hand keep working. A counter sale cannot be created without
    // it -- see createPosOrder.
    @Optional() private readonly lifecycle?: WorkOrderLifecycleService,
  ) {}

  /**
   * Directly reports an issue / requests a service from an authenticated
   * customer session.
   *
   * Validates the customer owns the selected asset (or provisions a new
   * vehicle under their ownership), assigns the workshop branch, emits
   * the intake registration event, and moves the job directly into the
   * workshop's operational cycle as REGISTERED.
   */
  async reportIssue(
    tenantId: string,
    customerId: string,
    dto: ReportCustomerIssueDto,
    session: SessionContext,
  ): Promise<{ workOrderId: string; status: string; assetId: string }> {
    if (!this.intakeService) {
      throw new BadRequestException({
        code: "intake_unavailable",
        message: "Intake service is currently unavailable.",
      });
    }

    if (!dto.complaint?.trim()) {
      throw new BadRequestException({
        code: "complaint_required",
        message: "Please describe your vehicle problem or service request.",
      });
    }

    // 1. Resolve branch
    let branchId = dto.preferredBranchId;
    if (!branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { tenantId, isActive: true },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException({
          code: "no_active_branch",
          message: "No active branches are configured for this workshop.",
        });
      }
      branchId = branch.id;
    } else {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException({
          code: "branch_not_found",
          message: "Selected branch does not belong to this workshop.",
        });
      }
    }

    // 2. Resolve asset
    let assetInput: { existingAssetId?: string; plateNumber?: string; vinOrChassisNumber?: string; category?: CategoryCode };
    if (dto.assetId) {
      const owned = await this.prisma.assetOwnershipHistory.findFirst({
        where: { tenantId, customerId, assetId: dto.assetId, endedAt: null },
        select: { assetId: true },
      });
      if (!owned) {
        throw new BadRequestException({
          code: "asset_not_owned",
          message: "The selected vehicle is not registered under your account.",
        });
      }
      assetInput = { existingAssetId: dto.assetId };
    } else if (dto.plateNumber || dto.vinOrChassisNumber) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { primaryCategory: true, plan: { select: { allowedCategories: true } } },
      });
      const category =
        dto.category ?? (tenant?.primaryCategory as CategoryCode) ?? tenant?.plan.allowedCategories[0] ?? "CARS";
      assetInput = {
        plateNumber: dto.plateNumber?.trim() || undefined,
        vinOrChassisNumber: dto.vinOrChassisNumber?.trim() || undefined,
        category: category as CategoryCode,
      };
    } else {
      const defaultOwned = await this.prisma.assetOwnershipHistory.findFirst({
        where: { tenantId, customerId, endedAt: null },
        select: { assetId: true },
        orderBy: { startedAt: "desc" },
      });
      if (defaultOwned) {
        assetInput = { existingAssetId: defaultOwned.assetId };
      } else {
        throw new BadRequestException({
          code: "vehicle_required",
          message: "Please select an existing vehicle or provide vehicle plate details.",
        });
      }
    }

    const actor: LifecycleActor = {
      accountId: session.accountId,
      displayName: session.displayName || "Customer",
      actorType: "CUSTOMER",
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
        customer: { existingCustomerId: customerId },
        asset: assetInput,
        complaint: fullComplaint,
        inspectionDeclined: dto.inspectionDeclined ?? false,
      },
      actor,
    );

    if (dto.inspectionParts && dto.inspectionParts.length > 0) {
      await this.prisma.inspection.create({
        data: {
          tenantId,
          workOrderId: result.workOrderId,
          technicianId: session.accountId,
          type: "QUICK",
          fields: {
            requestedParts: dto.inspectionParts,
            completedBoxes: {},
          },
        },
      });
    }

    await this.prisma.customerTimelineEvent.create({
      data: {
        tenantId,
        customerId,
        workOrderId: result.workOrderId,
        eventKey: "customer.service_requested",
        message: `Service request submitted: "${fullComplaint.slice(0, 80)}"`,
      },
    });

    return {
      workOrderId: result.workOrderId,
      status: result.status,
      assetId: result.assetId,
    };
  }

  /**
   * Over-the-counter POS parts checkout for customers who only need
   * to purchase replacement parts and leave without booking a repair job.
   */
  async createPosOrder(
    tenantId: string,
    customerId: string,
    dto: CustomerPosOrderDto,
    session: SessionContext,
  ): Promise<{ workOrderId: string; invoiceId: string; invoiceNumber: string; total: string; itemsCount: number }> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: "lines_required",
        message: "Your cart is empty. Please select at least one part.",
      });
    }

    // 1. Resolve requested items
    const itemIds = dto.lines.map((l) => l.inventoryItemId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, id: { in: itemIds }, workOrderUsable: true },
      select: { id: true, name: true, sku: true, sellingPrice: true },
    });

    let grandTotal = 0;
    const lineDetails = dto.lines.map((line) => {
      const item = items.find((i) => i.id === line.inventoryItemId);
      if (!item) {
        throw new BadRequestException({
          code: "item_not_found",
          message: `Item ${line.inventoryItemId} is not currently available.`,
        });
      }
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      const price = item.sellingPrice ? Number(item.sellingPrice) : 0;
      const total = price * qty;
      grandTotal += total;
      return { item, quantity: qty, price, total };
    });

    // 2. Resolve active branch
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException({
        code: "no_active_branch",
        message: "No active branches are configured for this workshop.",
      });
    }

    // 3. Resolve customer's vehicle or provision an OTC counter asset
    let asset = await this.prisma.asset.findFirst({
      where: { tenantId, currentOwnerCustomerId: customerId },
      select: { id: true },
    });

    if (!asset) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { primaryCategory: true },
      });
      asset = await this.prisma.asset.create({
        data: {
          tenantId,
          category: tenant?.primaryCategory ?? "CARS",
          plateNumber: "COUNTER-SALE",
          currentOwnerCustomerId: customerId,
        },
      });
      await this.prisma.assetOwnershipHistory.create({
        data: {
          tenantId,
          assetId: asset.id,
          customerId,
        },
      });
    }

    // 4. A counter sale starts at the graph's initial state and takes the
    // declared counter-sale edge -- the same route the operator's till uses.
    // Assigning PAYMENT_PENDING here bypassed the FINANCE_CORE requirement on
    // both that edge and the only edge out of PAYMENT_PENDING, so a customer
    // buying parts from a shop with no finance module got an order that could
    // never be settled or closed.
    // No lifecycle, no sale. The alternative -- creating the order and skipping
    // the transition -- would leave a DRAFT work order carrying a real invoice,
    // which is worse than refusing.
    if (!this.lifecycle) {
      throw new BadRequestException({
        code: "lifecycle_unavailable",
        message: "Counter sales are not available right now.",
      });
    }

    const workOrder = await this.prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branch.id,
        customerId,
        assetId: asset.id,
        status: WORK_ORDER_GRAPH.initial as WorkOrderStatus,
      },
    });

    await this.lifecycle.apply(workOrder.id, "ISSUE_INVOICE", {
      accountId: session.accountId,
      displayName: session.displayName || "Customer",
      actorType: "CUSTOMER",
    });

    const staff = (await this.prisma.account.findFirst({
      where: { tenantId, accountType: "TENANT_STAFF" },
      select: { id: true },
    })) ?? (await this.prisma.account.findFirst({
      where: { tenantId },
      select: { id: true },
    }));

    // 5. Create instant invoice for the counter parts
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
        issuedById: staff?.id ?? session.accountId,
      },
    });

    // 6. Record timeline event
    const totalItems = lineDetails.reduce((s, l) => s + l.quantity, 0);
    await this.prisma.customerTimelineEvent.create({
      data: {
        tenantId,
        customerId,
        workOrderId: workOrder.id,
        eventKey: "customer.pos_parts_ordered",
        message: `Purchased ${totalItems} parts at the counter (Invoice #${invoiceNumber}, Total: ${grandTotal.toFixed(2)}).`,
      },
    });

    return {
      workOrderId: workOrder.id,
      invoiceId: invoice.id,
      invoiceNumber,
      total: grandTotal.toFixed(2),
      itemsCount: totalItems,
    };
  }

  async home(tenantId: string, customerId: string): Promise<PortalHome> {
    const [assetCount, currentService, pendingDecisions, invoices, activity] = await Promise.all([
      this.prisma.assetOwnershipHistory.count({ where: { tenantId, customerId, endedAt: null } }),
      this.prisma.workOrder.count({
        where: { tenantId, customerId, status: { in: [...CURRENT_SERVICE_STATUSES] } },
      }),
      // Was `status: "PENDING"`, which counted DRAFTED-BUT-NOT-SENT
      // requests -- the one set a customer must never be shown -- and
      // therefore read zero for every decision actually sent to them.
      // Shares its definition with the list on /customer/decisions so the
      // count and the page can never disagree.
      this.prisma.customerDecisionRequest.count({
        where: { tenantId, customerId, status: { in: [...AWAITING_CUSTOMER_STATUSES] } },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, workOrder: { customerId } },
        select: { balance: true },
      }),
      this.prisma.customerTimelineEvent.findMany({
        where: { tenantId, customerId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, message: true, createdAt: true },
      }),
    ]);

    return {
      assetCount,
      currentServiceCount: currentService,
      pendingDecisions,
      openInvoiceBalance: sum(invoices.map((invoice) => invoice.balance.toFixed(2))),
      recentActivity: activity.map((row) => ({ id: row.id, message: row.message, createdAt: row.createdAt.toISOString() })),
    };
  }

  async myAssets(tenantId: string, customerId: string): Promise<readonly PortalAsset[]> {
    const rows = await this.prisma.assetOwnershipHistory.findMany({
      where: { tenantId, customerId, endedAt: null },
      select: {
        startedAt: true,
        asset: { select: { id: true, category: true, plateNumber: true, vinOrChassisNumber: true } },
      },
      orderBy: { startedAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.asset.id,
      category: row.asset.category,
      plateNumber: row.asset.plateNumber,
      vinOrChassisNumber: row.asset.vinOrChassisNumber,
      ownedSince: row.startedAt.toISOString(),
    }));
  }

  async currentService(tenantId: string, customerId: string): Promise<readonly CurrentServiceItem[]> {
    const [visibility, rows] = await Promise.all([
      this.policies ? this.policies.resolveValue(tenantId, "PROMISED_TIME_VISIBILITY") : "VISIBLE",
      this.prisma.workOrder.findMany({
        where: { tenantId, customerId, status: { in: [...CURRENT_SERVICE_STATUSES] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          promisedAt: true,
          asset: { select: { plateNumber: true, vinOrChassisNumber: true } },
        },
      }),
    ]);

    return rows.map((row) => ({
      workOrderId: row.id,
      status: row.status,
      asset: row.asset.plateNumber ?? row.asset.vinOrChassisNumber ?? "Unknown vehicle",
      createdAt: row.createdAt.toISOString(),
      promisedAt: visibility === "VISIBLE" ? row.promisedAt?.toISOString() ?? null : null,
    }));
  }

  /**
   * Is this work order this customer's own?
   *
   * ANY status, deliberately. Access is a question about whose car it is,
   * not about whether the job is still running -- and the two were
   * conflated: the journey endpoint scoped itself through
   * `currentService`, so a customer watching their repair was refused the
   * moment it closed. The last thing their journey is for is telling them
   * it finished, and the page broke exactly then.
   *
   * Scoped by `customerId` AND `tenantId` in the query, so a work-order
   * id from another customer -- or another workshop -- is simply not
   * theirs. The id in the URL is never the capability; the session is.
   */
  async ownsWorkOrder(tenantId: string, customerId: string, workOrderId: string): Promise<boolean> {
    const mine = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId, customerId },
      select: { id: true },
    });
    return mine !== null;
  }

  async invoiceStatus(tenantId: string, customerId: string): Promise<readonly InvoiceStatusRow[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { tenantId, workOrder: { customerId } },
      orderBy: { issuedAt: "desc" },
      select: { id: true, invoiceNumber: true, status: true, total: true, paid: true, balance: true, issuedAt: true },
    });

    return rows.map((row) => ({
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      total: row.total.toFixed(2),
      paid: row.paid.toFixed(2),
      balance: row.balance.toFixed(2),
      issuedAt: row.issuedAt.toISOString(),
    }));
  }

  /**
   * Scoped per ownership period, not per asset: a customer who bought a
   * used vehicle must never see the previous owner's service entries, so
   * this reads `SafeTechnicalHistory.ownerCustomerId` rather than
   * `Asset.currentOwnerCustomerId` history broadly.
   */
  async safeHistory(tenantId: string, customerId: string): Promise<readonly SafeHistoryEntry[]> {
    const rows = await this.prisma.safeTechnicalHistory.findMany({
      where: { tenantId, ownerCustomerId: customerId },
      orderBy: { serviceDate: "desc" },
      select: { id: true, assetId: true, summary: true, serviceDate: true },
    });

    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      summary: row.summary,
      serviceDate: row.serviceDate.toISOString(),
    }));
  }
}

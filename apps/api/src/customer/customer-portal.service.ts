import { Injectable } from "@nestjs/common";
import { sum } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { AWAITING_CUSTOMER_STATUSES } from "./decision.service";

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
  constructor(private readonly prisma: PrismaService) {}

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
    const rows = await this.prisma.workOrder.findMany({
      where: { tenantId, customerId, status: { in: [...CURRENT_SERVICE_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        asset: { select: { plateNumber: true, vinOrChassisNumber: true } },
      },
    });

    return rows.map((row) => ({
      workOrderId: row.id,
      status: row.status,
      asset: row.asset.plateNumber ?? row.asset.vinOrChassisNumber ?? "Unknown vehicle",
      createdAt: row.createdAt.toISOString(),
    }));
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

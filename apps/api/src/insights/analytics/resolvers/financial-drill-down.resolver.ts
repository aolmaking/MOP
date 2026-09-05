import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../../../runtime/database/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.util";
import type {
  DrillDownQuery,
  DrillDownResult,
  DrillDownRecord,
  DrillDownDimensionBreakdown,
  EvidenceReference,
} from "../drill-down.types";
import type { DrillDownResolver } from "./drill-down-resolver.interface";
import { decodeCursor, paginateRecords, resolvePageLimit } from "../drill-down-pagination.util";
import { toDecimalNumber } from "../../owner-reports/date-range.util";

@Injectable()
export class FinancialDrillDownResolver implements DrillDownResolver {
  readonly supportedMetrics = ["invoicedRevenue", "collectedCash"] as const;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
  ): Promise<DrillDownResult> {
    const effectiveBranchId = query.branchId ?? (scope.branchIds.length === 1 ? scope.branchIds[0] : undefined);
    const limit = resolvePageLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { currency: true },
    });

    if (query.metric === "invoicedRevenue") {
      return this.resolveInvoicedRevenue(tenantId, effectiveBranchId, query, range, tenant.currency, limit, cursor);
    } else {
      return this.resolveCollectedCash(tenantId, effectiveBranchId, query, range, tenant.currency, limit, cursor);
    }
  }

  // ==========================================================================
  // INVOICED REVENUE
  // Prompt 2 Canonical Semantics:
  // - Issued within range
  // - Excluding fully refunded invoices
  // - Excluding unpaid invoices on cancelled work orders
  // - Branch attribution: i.branchId ?? w.branchId
  // ==========================================================================
  private async resolveInvoicedRevenue(
    tenantId: string,
    branchId: string | undefined,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    currency: string,
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        issuedAt: { gte: range.from, lte: range.to },
        ...(branchId
          ? {
              OR: [{ branchId }, { branchId: null, workOrder: { branchId } }],
            }
          : {}),
        NOT: {
          OR: [
            { status: "REFUNDED" },
            { workOrder: { status: "CANCELLED" }, paid: 0 },
          ],
        },
      },
      include: {
        workOrder: { select: { id: true, branchId: true, status: true, asset: { select: { plateNumber: true } } } },
        lines: { select: { id: true, name: true, itemType: true, total: true } },
      },
      orderBy: { issuedAt: "desc" },
    });

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();
    let totalRevenue = 0;

    for (const inv of invoices) {
      if (!inv.issuedAt) continue;
      const totalAmount = toDecimalNumber(inv.total);
      const effectiveBranch = inv.branchId ?? inv.workOrder.branchId;

      const dimKey = query.dimension ?? "status";
      let dimVal: string = inv.status;
      if (dimKey === "branch") dimVal = effectiveBranch ?? "UNASSIGNED";

      if (query.dimension && query.dimensionValue && dimVal !== query.dimensionValue) {
        continue;
      }

      dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);
      totalRevenue += totalAmount;

      const evidenceReferences: EvidenceReference[] = [
        {
          entityType: "INVOICE",
          entityId: inv.id,
          tenantId,
          workOrderId: inv.workOrderId,
          occurredAt: inv.issuedAt.toISOString(),
          label: `Invoice #${inv.invoiceNumber} (${currency} ${totalAmount.toFixed(2)})`,
        },
        {
          entityType: "WORK_ORDER",
          entityId: inv.workOrderId,
          tenantId,
          workOrderId: inv.workOrderId,
          label: `Work Order #${inv.workOrderId.slice(-6)}`,
        },
      ];

      for (const line of inv.lines.slice(0, 5)) {
        evidenceReferences.push({
          entityType: "INVOICE_LINE",
          entityId: line.id,
          tenantId,
          workOrderId: inv.workOrderId,
          relation: "INVOICE_LINE",
          label: `Line: ${line.name} (${currency} ${toDecimalNumber(line.total).toFixed(2)})`,
        });
      }

      rawRecords.push({
        entityType: "INVOICE",
        entityId: inv.id,
        label: `Invoice #${inv.invoiceNumber} - ${currency} ${totalAmount.toFixed(2)}`,
        occurredAt: inv.issuedAt.toISOString(),
        status: inv.status,
        branchId: effectiveBranch,
        workOrderId: inv.workOrderId,
        attributes: {
          invoiceNumber: inv.invoiceNumber,
          total: totalAmount,
          subtotal: toDecimalNumber(inv.subtotal),
          tax: toDecimalNumber(inv.tax),
          paid: toDecimalNumber(inv.paid),
          linesCount: inv.lines.length,
          plateNumber: inv.workOrder.asset?.plateNumber ?? null,
          workOrderStatus: inv.workOrder.status,
        },
        evidenceReferences,
      });
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    const dimensions: DrillDownDimensionBreakdown[] = Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
      key: query.dimension ?? "status",
      value: val,
      label: val,
      count: cnt,
    }));

    return {
      metric: {
        key: "invoicedRevenue",
        label: "Invoiced Revenue",
        value: Number(totalRevenue.toFixed(2)),
        unit: currency,
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions,
      records: items,
      nextCursor,
      integrity: {
        totalMatchingRecords: rawRecords.length,
        returnedRecords: items.length,
        historicalAttributionPreserved: true,
        financialAttributionComputable: true,
        financialAttributionNote:
          "Uses canonical Phase 1 financial rules: excluding refunded invoices and unpaid invoices on cancelled work orders.",
      },
    };
  }

  // ==========================================================================
  // COLLECTED CASH
  // Prompt 2 Canonical Semantics:
  // - Payments created within range
  // - Linked to valid invoices and work orders
  // - Branch attribution inherited from invoice / work order
  // ==========================================================================
  private async resolveCollectedCash(
    tenantId: string,
    branchId: string | undefined,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    currency: string,
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...(branchId
          ? {
              invoice: {
                OR: [{ branchId }, { branchId: null, workOrder: { branchId } }],
              },
            }
          : {}),
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            branchId: true,
            workOrderId: true,
            workOrder: { select: { id: true, branchId: true, status: true, asset: { select: { plateNumber: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();
    let totalCollected = 0;

    for (const p of payments) {
      const amount = toDecimalNumber(p.amount);
      const effectiveBranch = p.invoice.branchId ?? p.invoice.workOrder.branchId;

      const dimKey = query.dimension ?? "paymentMethod";
      let dimVal: string = p.method ?? "OTHER";
      if (dimKey === "branch") dimVal = effectiveBranch ?? "UNASSIGNED";

      if (query.dimension && query.dimensionValue && dimVal !== query.dimensionValue) {
        continue;
      }

      dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);
      totalCollected += amount;

      const evidenceReferences: EvidenceReference[] = [
        {
          entityType: "PAYMENT",
          entityId: p.id,
          tenantId,
          workOrderId: p.invoice.workOrderId,
          occurredAt: p.createdAt.toISOString(),
          label: `Payment: ${p.method} (${currency} ${amount.toFixed(2)})`,
        },
        {
          entityType: "INVOICE",
          entityId: p.invoice.id,
          tenantId,
          workOrderId: p.invoice.workOrderId,
          label: `Invoice #${p.invoice.invoiceNumber}`,
        },
        {
          entityType: "WORK_ORDER",
          entityId: p.invoice.workOrderId,
          tenantId,
          workOrderId: p.invoice.workOrderId,
          label: `Work Order #${p.invoice.workOrderId.slice(-6)}`,
        },
      ];

      rawRecords.push({
        entityType: "PAYMENT",
        entityId: p.id,
        label: `Payment - ${p.method} (${currency} ${amount.toFixed(2)})`,
        occurredAt: p.createdAt.toISOString(),
        branchId: effectiveBranch,
        workOrderId: p.invoice.workOrderId,
        attributes: {
          method: p.method,
          amount,
          invoiceNumber: p.invoice.invoiceNumber,
          workOrderId: p.invoice.workOrderId,
          plateNumber: p.invoice.workOrder.asset?.plateNumber ?? null,
        },
        evidenceReferences,
      });
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    const dimensions: DrillDownDimensionBreakdown[] = Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
      key: query.dimension ?? "paymentMethod",
      value: val,
      label: val,
      count: cnt,
    }));

    return {
      metric: {
        key: "collectedCash",
        label: "Collected Cash",
        value: Number(totalCollected.toFixed(2)),
        unit: currency,
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions,
      records: items,
      nextCursor,
      integrity: {
        totalMatchingRecords: rawRecords.length,
        returnedRecords: items.length,
        historicalAttributionPreserved: true,
        financialAttributionComputable: true,
        financialAttributionNote: "Uses authoritative settled payment ledger records.",
      },
    };
  }
}

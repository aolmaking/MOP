import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { InspectionAggregate } from "./domain/inspection.aggregate";
import { InspectionAggregateDocument } from "./domain/inspection.types";
import { findFindingDefByKey } from "./domain/finding-catalog.dataset";
import { Prisma } from "@mop/database";

export class ConcurrentModificationError extends Error {
  constructor(message: string) {
    super(`[ConcurrentModificationError] ${message}`);
    this.name = "ConcurrentModificationError";
  }
}

/**
 * Inspection Repository.
 *
 * Implements the Hybrid Domain Document + Relational Projection pattern with A.2 Hardening:
 * - Optimistic Concurrency Control (OCC): Detects concurrent updates via aggregateVersion.
 * - Idempotent Fault Projection: Safe against network retries, zero duplicates.
 * - Fault Projection Policy: Respects WHEN_ACTIONABLE / NEVER policies, preventing INFO pollution.
 */
@Injectable()
export class InspectionRepository {
  private readonly logger = new Logger(InspectionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds an Inspection Aggregate by work order ID.
   */
  async findByWorkOrderId(tenantId: string, workOrderId: string): Promise<InspectionAggregate | null> {
    const row = await this.prisma.inspection.findFirst({
      where: { tenantId, workOrderId },
      orderBy: { startedAt: "desc" },
    });

    if (!row) {
      return null;
    }

    const fields = (row.fields as unknown as InspectionAggregateDocument) || {};
    if (!fields.state || !fields.targets) {
      // Legacy or uninitialized inspection row: wrap in aggregate
      return InspectionAggregate.create({
        id: row.id,
        tenantId: row.tenantId,
        workOrderId: row.workOrderId,
        technicianStaffId: row.technicianId,
        catalogVersion: 2,
        templateCode: "CARS_MULTI_POINT_V2",
      });
    }

    return InspectionAggregate.reconstitute(row.id, row.tenantId, row.workOrderId, fields);
  }

  /**
   * Finds an Inspection Aggregate by primary key ID.
   */
  async findById(tenantId: string, id: string): Promise<InspectionAggregate | null> {
    const row = await this.prisma.inspection.findFirst({
      where: { id, tenantId },
    });

    if (!row) {
      return null;
    }

    const fields = (row.fields as unknown as InspectionAggregateDocument) || {};
    return InspectionAggregate.reconstitute(row.id, row.tenantId, row.workOrderId, fields);
  }

  /**
   * Saves the Inspection Aggregate to the database with Optimistic Concurrency Control (OCC).
   * If state is SUBMITTED, projects actionable findings into model Fault idempotently.
   */
  async save(aggregate: InspectionAggregate, extraFields?: Record<string, any>): Promise<void> {
    const existing = await this.prisma.inspection.findFirst({
      where: { id: aggregate.id },
    });

    // GAP-A1: Optimistic Concurrency Control (OCC) Check
    if (existing && existing.fields) {
      const existingDoc = existing.fields as unknown as InspectionAggregateDocument;
      const storedVersion = existingDoc.aggregateVersion || 1;

      if (aggregate.aggregateVersion !== storedVersion) {
        throw new ConcurrentModificationError(
          `Inspection '${aggregate.id}' has been concurrently modified. ` +
          `Expected version ${aggregate.aggregateVersion}, but database has version ${storedVersion}.`,
        );
      }
    }

    // Bump aggregate version on save
    aggregate.bumpAggregateVersion();

    const existingFields = (existing?.fields as Record<string, any>) || {};
    const doc = {
      ...existingFields,
      ...aggregate.toDocument(),
      ...(extraFields || {}),
    };
    const completedAt = aggregate.completedAt ? new Date(aggregate.completedAt) : null;

    // 1. Upsert aggregate document into Inspection table
    await this.prisma.inspection.upsert({
      where: { id: aggregate.id },
      create: {
        id: aggregate.id,
        tenantId: aggregate.tenantId,
        workOrderId: aggregate.workOrderId,
        technicianId: aggregate.technicianStaffId,
        type: "FULL",
        startedAt: new Date(aggregate.startedAt),
        completedAt,
        fields: doc as unknown as Prisma.InputJsonValue,
      },
      update: {
        technicianId: aggregate.technicianStaffId,
        completedAt,
        fields: doc as unknown as Prisma.InputJsonValue,
      },
    });

    // 2. Relational Projections (only when SUBMITTED or beyond)
    if (aggregate.state === "SUBMITTED" || aggregate.state === "OPERATOR_REVIEW" || aggregate.state === "LOCKED") {
      await this.projectFindingsToFaults(aggregate);
    }
  }

  /**
   * GAP-A2 & GAP-A4: Idempotent Projection respecting FaultProjectionPolicy.
   */
  private async projectFindingsToFaults(aggregate: InspectionAggregate): Promise<void> {
    for (const target of aggregate.targets) {
      if (target.status !== "INSPECTED" || target.findings.length === 0) {
        continue;
      }

      for (const finding of target.findings) {
        const def = findFindingDefByKey(finding.findingKey);
        const policy = def?.faultProjectionPolicy || "WHEN_ACTIONABLE";

        // GAP-A4: Filter out non-actionable findings
        if (policy === "NEVER") {
          continue;
        }
        if (policy === "WHEN_ACTIONABLE" && finding.severity === "INFO") {
          continue;
        }

        const description = finding.technicianObservation
          ? `${def ? def.label : finding.findingKey} — ${finding.technicianObservation}`
          : def ? def.label : finding.findingKey;

        // A critical finding is stored as CRITICAL.
        //
        // This used to map CRITICAL onto HIGH, which meant nothing in the
        // shipped inspection flow could ever write `SeverityLevel.CRITICAL` --
        // and three separate mechanisms read exactly that value:
        //
        //   work_order.has_critical_fault   the fact QC_MANDATORY's
        //                                   RISK_FLAGGED_ONLY option routes on
        //   evaluateCriticalFaultProgression  APPROVAL_REQUIRED_SCOPE's
        //                                   CRITICAL_ONLY option
        //   the attention queue's critical rejections
        //
        // So a workshop could configure risk-based QC or critical-only customer
        // approval, and the option could never fire on a single job. The
        // operator hub even mapped HIGH back to "CRITICAL" for display, so the
        // screen and the database disagreed about the same brake finding.
        //
        // HIGH stays reachable through `TechnicianWorkService.createFault`,
        // which takes the full four-value scale directly.
        const prismaSeverity =
          finding.severity === "CRITICAL"
            ? "CRITICAL"
            : finding.severity === "ATTENTION"
              ? "MEDIUM"
              : "LOW";

        try {
          // GAP-A2: Idempotent check — zero duplicates on retry
          const existingFault = await this.prisma.fault.findFirst({
            where: {
              tenantId: aggregate.tenantId,
              workOrderId: aggregate.workOrderId,
              inspectionId: aggregate.id,
              code: finding.findingKey,
            },
          });

          if (!existingFault) {
            await this.prisma.fault.create({
              data: {
                tenantId: aggregate.tenantId,
                workOrderId: aggregate.workOrderId,
                inspectionId: aggregate.id,
                code: finding.findingKey,
                description,
                severity: prismaSeverity as any,
                customerApprovalRequired: finding.severity === "CRITICAL",
              },
            });
          } else {
            // Update in-place if description or severity changed on re-projection
            await this.prisma.fault.update({
              where: { id: existingFault.id },
              data: {
                description,
                severity: prismaSeverity as any,
                customerApprovalRequired: finding.severity === "CRITICAL",
              },
            });
          }
        } catch (err: any) {
          this.logger.warn(`Failed to project finding to Fault row: ${err.message}`);
        }
      }
    }
  }
}

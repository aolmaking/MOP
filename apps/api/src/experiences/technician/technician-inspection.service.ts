import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { InspectionRepository, ConcurrentModificationError } from "../../systems/operations/inspection/inspection.repository";
import { RuleEvaluatorService } from "../../systems/operations/inspection/recommendations/rule-evaluator.service";
import { InspectionAggregate, DomainInvariantViolationError } from "../../systems/operations/inspection/domain/inspection.aggregate";
import {
  PatchInspectionTargetDto,
  RecordRecommendationDecisionDto,
  SubmitInspectionAggregateDto,
} from "./technician.dto";
import {
  CARS_INSPECTION_CHECKPOINTS,
} from "../../systems/inventory/master-catalog/cars-catalog.dataset";
import {
  MOTORCYCLES_INSPECTION_CHECKPOINTS,
} from "../../systems/inventory/master-catalog/motorcycles-catalog.dataset";
import {
  HEAVY_EQUIPMENT_INSPECTION_CHECKPOINTS,
} from "../../systems/inventory/master-catalog/heavy-equipment-catalog.dataset";
import { randomUUID } from "crypto";

@Injectable()
export class TechnicianInspectionService {
  private readonly logger = new Logger(TechnicianInspectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspectionRepo: InspectionRepository,
    private readonly ruleEvaluator: RuleEvaluatorService,
  ) {}

  /**
   * Retrieves the current inspection aggregate document for a work order.
   */
  async getInspection(tenantId: string, workOrderId: string) {
    const aggregate = await this.inspectionRepo.findByWorkOrderId(tenantId, workOrderId);
    if (!aggregate) {
      return { inspection: null };
    }
    return {
      inspection: aggregate.toDocument(),
      aggregateVersion: aggregate.aggregateVersion,
      lifecycleState: aggregate.state,
    };
  }

  /**
   * Loads or creates an active Inspection Aggregate with initial target checkpoints.
   */
  async getOrInitializeInspection(
    tenantId: string,
    workOrderId: string,
    staffUserId: string,
    categoryHint?: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT",
  ): Promise<InspectionAggregate> {
    const existing = await this.inspectionRepo.findByWorkOrderId(tenantId, workOrderId);
    if (existing) {
      return existing;
    }

    // Resolve vehicle category from work order asset
    let category: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT" = categoryHint || "CARS";
    if (!categoryHint) {
      const wo = await this.prisma.workOrder.findFirst({
        where: { id: workOrderId, tenantId },
        include: { asset: true },
      });
      if (wo?.asset?.category) {
        const cat = wo.asset.category.toUpperCase();
        if (cat.includes("MOTO")) category = "MOTORCYCLES";
        else if (cat.includes("HEAVY") || cat.includes("EQUIPMENT")) category = "HEAVY_EQUIPMENT";
      }
    }

    const checkpoints =
      category === "MOTORCYCLES"
        ? MOTORCYCLES_INSPECTION_CHECKPOINTS
        : category === "HEAVY_EQUIPMENT"
          ? HEAVY_EQUIPMENT_INSPECTION_CHECKPOINTS
          : CARS_INSPECTION_CHECKPOINTS;

    const initialTargets = checkpoints.flatMap((cp) =>
      cp.targets.map((t) => ({
        targetKey: t.targetKey,
        canonicalPartSlug: t.canonicalPartSlug,
        position: t.defaultPosition as any,
      })),
    );

    const aggregate = InspectionAggregate.create({
      id: `insp-${workOrderId}-${randomUUID().slice(0, 8)}`,
      tenantId,
      workOrderId,
      technicianStaffId: staffUserId,
      catalogVersion: 2,
      templateCode: `${category}_MULTI_POINT_V2`,
      initialTargets,
    });

    await this.inspectionRepo.save(aggregate);
    this.logger.log(`Initialized inspection aggregate for workOrder ${workOrderId} with ${initialTargets.length} targets`);
    return aggregate;
  }

  /**
   * Real-time delta auto-save of an individual target result.
   * Runs OCC validation, evaluates recommendation rules, and updates the aggregate.
   */
  async saveTargetDelta(
    tenantId: string,
    workOrderId: string,
    staffUserId: string,
    targetKey: string,
    dto: PatchInspectionTargetDto,
  ) {
    const aggregate = await this.getOrInitializeInspection(tenantId, workOrderId, staffUserId);

    if (dto.expectedVersion !== undefined && aggregate.aggregateVersion !== dto.expectedVersion) {
      throw new ConflictException(
        `Concurrent modification conflict: expected aggregateVersion ${dto.expectedVersion}, but current is ${aggregate.aggregateVersion}. Please fetch latest state.`,
      );
    }

    const existingTarget = aggregate.targets.find(
      (t) => t.targetKey.toUpperCase() === targetKey.toUpperCase(),
    );
    const canonicalPartSlug = dto.canonicalPartSlug || existingTarget?.canonicalPartSlug || targetKey.toLowerCase();
    const position = (dto.position || existingTarget?.position || "UNIVERSAL") as any;

    try {
      aggregate.recordTargetResult({
        targetKey,
        canonicalPartSlug,
        position,
        status: dto.status,
        condition: dto.condition,
        findings: (dto.findings || []).map((f) => ({
          findingKey: f.findingKey,
          severity: f.severity,
          technicianObservation: f.technicianObservation,
          recordedAt: new Date().toISOString(),
        })),
        nonInspectionReason: dto.nonInspectionReason,
        technicianNote: dto.technicianNote,
        measurementValue: dto.measurementValue !== undefined ? Number(dto.measurementValue) : undefined,
        measurementUnit: dto.measurementUnit,
        inspectedByStaffId: staffUserId,
      });

      const targetId = InspectionAggregate.buildTargetResultId(targetKey, canonicalPartSlug, position);

      // If component was inspected, run declarative rule engine to generate recommendations
      if (dto.status === "INSPECTED") {
        const evalContext = {
          targetKey,
          targetResultId: targetId,
          canonicalPartSlug,
          position,
          condition: dto.condition,
          findingKeys: (dto.findings || []).map((f) => f.findingKey),
          severities: (dto.findings || []).map((f) => f.severity),
        };

        const ruleEvaluation = this.ruleEvaluator.evaluateTarget(evalContext);
        if (ruleEvaluation.recommendations.length > 0) {
          aggregate.attachRecommendations(ruleEvaluation.recommendations);
        }
      }

      await this.inspectionRepo.save(aggregate);

      const updatedTarget = aggregate.targets.find((t) => t.targetKey === targetKey);
      const generatedRecommendations = aggregate.recommendations.filter(
        (r) => r.targetResultId === targetId,
      );

      return {
        success: true,
        targetKey,
        targetResult: updatedTarget,
        recommendations: generatedRecommendations,
        decisions: aggregate.decisions,
        aggregateVersion: aggregate.aggregateVersion,
      };
    } catch (err: any) {
      if (err instanceof DomainInvariantViolationError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof ConcurrentModificationError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * Records technician's decision on a generated recommendation.
   */
  async recordDecision(
    tenantId: string,
    workOrderId: string,
    staffUserId: string,
    dto: RecordRecommendationDecisionDto,
  ) {
    const aggregate = await this.inspectionRepo.findByWorkOrderId(tenantId, workOrderId);
    if (!aggregate) {
      throw new NotFoundException(`No active inspection found for work order ${workOrderId}`);
    }

    if (dto.expectedVersion !== undefined && aggregate.aggregateVersion !== dto.expectedVersion) {
      throw new ConflictException(
        `Concurrent modification conflict: expected aggregateVersion ${dto.expectedVersion}, but current is ${aggregate.aggregateVersion}.`,
      );
    }

    try {
      const decisionRecord = aggregate.recordDecision(
        dto.recommendationId,
        dto.decision,
        dto.dismissalReason,
        dto.scopeModificationNote,
      );

      await this.inspectionRepo.save(aggregate);

      return {
        success: true,
        decision: decisionRecord,
        aggregateVersion: aggregate.aggregateVersion,
      };
    } catch (err: any) {
      if (err instanceof DomainInvariantViolationError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof ConcurrentModificationError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * Finalizes and submits the inspection report.
   * Enforces INV-1 (Completeness) and INV-6 (Deep frozen immutable snapshot).
   * Persists faults into model Fault idempotently following FaultProjectionPolicy.
   */
  async submitInspection(
    tenantId: string,
    workOrderId: string,
    staffUserId: string,
    dto: SubmitInspectionAggregateDto,
  ) {
    const aggregate = await this.inspectionRepo.findByWorkOrderId(tenantId, workOrderId);
    if (!aggregate) {
      throw new NotFoundException(`No active inspection found for work order ${workOrderId}`);
    }

    if (dto.expectedVersion !== undefined && aggregate.aggregateVersion !== dto.expectedVersion) {
      throw new ConflictException(
        `Concurrent modification conflict: expected aggregateVersion ${dto.expectedVersion}, but current is ${aggregate.aggregateVersion}.`,
      );
    }

    try {
      const snapshot = aggregate.submit(staffUserId);

      await this.inspectionRepo.save(aggregate);

      // Work order remains UNDER_INSPECTION awaiting Operator Final Approval

      return {
        success: true,
        workOrderId,
        submittedAt: aggregate.submittedAt,
        snapshot,
        aggregateVersion: aggregate.aggregateVersion,
      };
    } catch (err: any) {
      if (err instanceof DomainInvariantViolationError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof ConcurrentModificationError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}

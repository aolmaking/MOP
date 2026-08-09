import { ConflictException, Injectable } from "@nestjs/common";
import {
  CAPABILITY_REGISTRY,
  ALL_GRAPHS,
  validateCapabilityProfile,
  type CapabilityKey,
  type CapabilityProfile,
  type CapabilityStatus,
  type CapabilityValidationResult,
} from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CapabilityResolutionService } from "./capability-resolution.service";

export interface CapabilityChangeRequest {
  readonly capabilityKey: CapabilityKey;
  readonly status: CapabilityStatus;
}

export interface AffectedRecords {
  readonly entity: string;
  /** States this change makes unenterable, that records are currently sitting in. */
  readonly states: readonly string[];
  readonly count: number;
  /** What the removal policy says happens to them. */
  readonly policy: string;
}

export interface CapabilityImpactPreview {
  readonly validation: CapabilityValidationResult;
  /** Live counts, computed at preview time -- never cached from an earlier look. */
  readonly affectedRecords: readonly AffectedRecords[];
  readonly orphanedRoles: readonly string[];
  readonly orphanedStaffCount: number;
  readonly droppedGates: readonly string[];
  readonly reversible: boolean;
  /** Present when the change cannot be applied; each string is a reason. */
  readonly blockers: readonly string[];
}

export interface ChangeActor {
  readonly accountId: string;
  readonly displayName: string;
  readonly isPlatform: boolean;
}

/**
 * The governed path for changing a workshop's shape:
 *
 *   Draft -> Validate -> Live-data preconditions -> Impact preview
 *         -> Apply -> Audit -> Rollback
 *
 * The reachability half is a pure function in @mop/shared and is already
 * proven. What lives here is everything that needs the database: how many
 * real records a change would strand, whether anyone is left without a
 * role, and applying the whole thing atomically.
 *
 * Counts are computed when the preview is requested and never cached.
 * "This will move 14 work orders" is only useful if it is true right now;
 * a number from five minutes ago is worse than no number, because it
 * invites a decision based on a state that no longer exists.
 */
@Injectable()
export class CapabilityChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolution: CapabilityResolutionService,
  ) {}

  /**
   * What would happen. Safe to call repeatedly; changes nothing.
   */
  async preview(
    tenantId: string,
    changes: readonly CapabilityChangeRequest[],
    actor?: Pick<ChangeActor, "isPlatform">,
  ): Promise<CapabilityImpactPreview> {
    const current = await this.resolution.resolveCurrent(tenantId);
    const proposed = this.merge(current, changes);

    const validation = validateCapabilityProfile(proposed);
    const blockers = validation.issues.map((issue) => issue.message);

    // A platform lock binds the TENANT, not the platform. Platform Super
    // Admin set it and must be able to lift it -- otherwise the first
    // platform-sourced change would permanently freeze that capability for
    // everyone, including the person who locked it.
    //
    // When no actor is supplied the check is applied, so a bare preview
    // shows the more restrictive answer rather than an optimistic one.
    if (!actor?.isPlatform) {
      const locked = new Set(await this.resolution.lockedCapabilities(tenantId));
      for (const change of changes) {
        if (locked.has(change.capabilityKey)) {
          blockers.push(`${change.capabilityKey} is locked by the platform and cannot be changed here.`);
        }
      }
    }

    const affectedRecords = await this.countAffectedRecords(tenantId, current, changes);
    const orphanedStaffCount = await this.countOrphanedStaff(tenantId, validation.orphanedRoles);

    return {
      validation,
      affectedRecords,
      orphanedRoles: validation.orphanedRoles,
      orphanedStaffCount,
      droppedGates: validation.droppedGates,
      reversible: changes.every((change) => CAPABILITY_REGISTRY.get(change.capabilityKey)?.reversible ?? false),
      blockers,
    };
  }

  /**
   * Applies the change, or none of it.
   *
   * Re-validates rather than trusting the preview: the two are separate
   * requests, and the workshop may have changed between them.
   */
  async apply(
    tenantId: string,
    changes: readonly CapabilityChangeRequest[],
    actor: ChangeActor,
    reason: string,
  ): Promise<void> {
    const preview = await this.preview(tenantId, changes, actor);

    if (preview.blockers.length > 0) {
      throw new ConflictException({
        code: "capability_change_rejected",
        message: "This capability change would leave the workshop in an invalid state.",
        details: preview.blockers,
      });
    }

    // Captured before the transaction opens. Reading it inside would
    // happen to work -- an uncommitted transaction is invisible to a
    // separate connection -- but relying on that is the kind of accidental
    // correctness that breaks the day someone switches the read to `tx`.
    const before = await this.resolution.resolveCurrent(tenantId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const change of changes) {
        // Close the open row and open a new one, so the history stays a
        // continuous, non-overlapping timeline. Exactly one open row per
        // (tenant, capability) is the invariant the resolver relies on.
        await tx.tenantCapability.updateMany({
          where: { tenantId, capabilityKey: change.capabilityKey, effectiveTo: null },
          data: { effectiveTo: now },
        });

        await tx.tenantCapability.create({
          data: {
            tenantId,
            capabilityKey: change.capabilityKey,
            status: change.status,
            effectiveFrom: now,
            source: actor.isPlatform ? "PLATFORM" : "OWNER_CONFIGURATION",
            lockedByPlatform: actor.isPlatform,
            configuredBy: actor.accountId,
            reason,
          },
        });
      }

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: actor.isPlatform ? "PLATFORM" : "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "TenantCapability",
          targetId: tenantId,
          action: "capability.changed",
          before: { capabilities: before },
          after: { changes: changes.map((c) => ({ capability: c.capabilityKey, status: c.status })) },
          reason,
          // Reshaping a live workshop can strand in-flight work and orphan
          // staff, so it is never routine.
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }

  private merge(current: CapabilityProfile, changes: readonly CapabilityChangeRequest[]): CapabilityProfile {
    const merged: Record<string, CapabilityStatus> = { ...current };
    for (const change of changes) merged[change.capabilityKey] = change.status;
    return merged as CapabilityProfile;
  }

  /**
   * How many real records sit in states this change would make
   * unenterable. This is the number an operator actually needs: a
   * configuration can be structurally valid and still require moving
   * fourteen live jobs.
   */
  private async countAffectedRecords(
    tenantId: string,
    current: CapabilityProfile,
    changes: readonly CapabilityChangeRequest[],
  ): Promise<AffectedRecords[]> {
    const statesByEntity = new Map<string, Set<string>>();
    const policyByEntity = new Map<string, string>();

    for (const change of changes) {
      // Only a capability going away strands anything.
      const wasActive = isActive(current[change.capabilityKey] ?? "ENABLED");
      if (wasActive === isActive(change.status) || isActive(change.status)) continue;

      const definition = CAPABILITY_REGISTRY.get(change.capabilityKey);
      if (!definition?.removal) continue;

      for (const state of definition.removal.statesToDisable) {
        const graph = ALL_GRAPHS.find((candidate) => candidate.states.includes(state));
        if (!graph) continue;

        const set = statesByEntity.get(graph.entity) ?? new Set<string>();
        set.add(state);
        statesByEntity.set(graph.entity, set);
        policyByEntity.set(graph.entity, definition.removal.existingRecordsPolicy);
      }
    }

    const results: AffectedRecords[] = [];
    for (const [entity, states] of statesByEntity) {
      const stateList = [...states];
      const count = await this.countForEntity(tenantId, entity, stateList);
      if (count === 0) continue;

      results.push({
        entity,
        states: stateList,
        count,
        policy: policyByEntity.get(entity) ?? "PRESERVE_READ_ONLY",
      });
    }

    return results;
  }

  /**
   * Entities are counted through an explicit switch rather than a dynamic
   * model lookup: a typo'd model name would silently report zero affected
   * records, which is the most dangerous possible answer here.
   */
  private async countForEntity(tenantId: string, entity: string, states: string[]): Promise<number> {
    switch (entity) {
      case "WorkOrder":
        return this.prisma.workOrder.count({ where: { tenantId, status: { in: states as never } } });
      case "PartRequest":
        return this.prisma.partRequest.count({ where: { tenantId, status: { in: states as never } } });
      case "CustomerDecisionRequest":
        return this.prisma.customerDecisionRequest.count({ where: { tenantId, status: { in: states as never } } });
      default:
        return 0;
    }
  }

  /** Staff whose role exists only because of a capability being removed. */
  private async countOrphanedStaff(tenantId: string, orphanedRoles: readonly string[]): Promise<number> {
    if (orphanedRoles.length === 0) return 0;

    return this.prisma.staffUser.count({
      where: { tenantId, isActive: true, role: { in: orphanedRoles as never } },
    });
  }
}

function isActive(status: CapabilityStatus): boolean {
  return status === "ENABLED" || status === "READ_ONLY" || status === "LOCKED";
}


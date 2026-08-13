import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PolicySource } from "@mop/database";
import { POLICY_REGISTRY, isPolicyRelevant, policyDefinition } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";

export interface PolicyActor {
  readonly accountId: string;
  readonly displayName: string;
  readonly actorType: "PLATFORM" | "TENANT_STAFF";
}

/**
 * Turns stored `WorkshopPolicy` rows into effective values, and applies
 * changes to them -- the policy-side counterpart to
 * `CapabilityResolutionService`, deliberately built the same shape.
 *
 * **Who may call `set()` is not decided here.** PHASE_21.md S8.C leaves
 * open whether some policies are Owner-configurable; this service takes
 * an explicit `source` from its caller rather than inferring one from
 * the actor (contrast `CapabilityChangeService.apply()`, which infers
 * PLATFORM vs OWNER_CONFIGURATION from `actor.isPlatform` -- that
 * inference is exactly the kind of thing that must not happen here
 * until the authority question is answered). Today only Super-Admin
 * call sites exist, so only `PLATFORM` is ever passed in practice; nothing
 * in this service enforces that, which is deliberate -- the enforcement
 * belongs to whichever controller is built once S8.C resolves, not to
 * this resolution layer.
 *
 * **`IMMUTABLE_AFTER_FIRST_USE` is declared on `PolicyDefinition` but
 * deliberately not enforced here.** What makes a policy "used" is
 * domain-specific (an invoice numbering scheme is used the moment the
 * first invoice is issued -- a fact `FinanceService` knows and this
 * service has no way to check generically). No policy registered today
 * carries that mutability, so building a generic "has real data"
 * mechanism now would be exactly the speculative, no-consumer
 * abstraction Phase 22's conformance review was watching for. When a
 * real `IMMUTABLE_AFTER_FIRST_USE` policy is registered, its owning
 * domain must check its own precondition before calling `set()`.
 */
@Injectable()
export class PolicyResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly capabilities: CapabilityResolutionService,
  ) {}

  /**
   * Whether this policy is relevant for this workshop right now --
   * PHASE_21.md S3.2's full model (capabilities + specializations +
   * prior answers), not capabilities alone. `specializations` is a
   * parameter rather than resolved internally: nothing in this codebase
   * yet exposes "this workshop's declared specialization keys" as one
   * queryable set (Phase 15's definitions are scoped per specialization
   * type, not collected into one list), so a caller that has that
   * information passes it in; one that doesn't gets capability- and
   * prior-answer-based relevance evaluated correctly and specialization
   * predicates evaluated against an empty set, which is the same "no
   * declared specialization" reading `isCapabilityActive` already uses
   * for an absent capability row.
   */
  async isRelevant(tenantId: string, policyKey: string, specializations: ReadonlySet<string> = new Set()): Promise<boolean> {
    const definition = policyDefinition(policyKey);
    if (!definition) {
      throw new NotFoundException({ code: "unknown_policy", message: `"${policyKey}" is not a registered policy.` });
    }

    const [profile, allAnswers] = await Promise.all([
      this.capabilities.resolveCurrent(tenantId),
      this.resolveCurrent(tenantId),
    ]);

    return isPolicyRelevant(definition, profile, specializations, allAnswers);
  }

  /** Every policy this workshop has an explicit row for right now. Registry defaults fill in the rest -- use `resolveValue` for one key's effective value. */
  async resolveCurrent(tenantId: string, tx?: Prisma.TransactionClient): Promise<ReadonlyMap<string, string>> {
    const client = tx ?? this.prisma;
    const rows = await client.workshopPolicy.findMany({
      where: { tenantId, effectiveTo: null },
      select: { policyKey: true, value: true },
    });
    return new Map(rows.map((row) => [row.policyKey, row.value]));
  }

  /**
   * The effective value of one policy: the workshop's own stored row if
   * one is open, otherwise `POLICY_REGISTRY`'s declared default --
   * exactly the "absent means default" convention
   * `CapabilityResolutionService` uses for an absent capability row.
   */
  async resolveValue(tenantId: string, policyKey: string, tx?: Prisma.TransactionClient): Promise<string> {
    const definition = policyDefinition(policyKey);
    if (!definition) {
      throw new NotFoundException({ code: "unknown_policy", message: `"${policyKey}" is not a registered policy.` });
    }

    const client = tx ?? this.prisma;
    const row = await client.workshopPolicy.findFirst({
      where: { tenantId, policyKey, effectiveTo: null },
      select: { value: true },
    });

    return row?.value ?? definition.default;
  }

  /**
   * The effective value of one policy at a point in time -- the policy
   * counterpart to `CapabilityResolutionService.resolveAsOf`. A row
   * applies if it started at or before `when` and had not yet been
   * superseded; absent any row covering that moment, the registry
   * default applies, on the assumption that a workshop with no override
   * has always run under the default (there is no historical default to
   * look up separately, since the default itself is code, not data).
   */
  async resolveValueAsOf(tenantId: string, policyKey: string, when: Date): Promise<string> {
    const definition = policyDefinition(policyKey);
    if (!definition) {
      throw new NotFoundException({ code: "unknown_policy", message: `"${policyKey}" is not a registered policy.` });
    }

    const row = await this.prisma.workshopPolicy.findFirst({
      where: {
        tenantId,
        policyKey,
        effectiveFrom: { lte: when },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: when } }],
      },
      select: { value: true },
    });

    return row?.value ?? definition.default;
  }

  /**
   * Sets a workshop's policy value, closing the previous open row and
   * opening a new one in the same transaction -- identical discipline to
   * `CapabilityChangeService.apply()`, so the history stays a
   * continuous, non-overlapping timeline and interpreting an old record
   * means resolving the policy that was actually in force then.
   */
  async set(
    tenantId: string,
    policyKey: string,
    value: string,
    actor: PolicyActor,
    source: PolicySource,
    reason: string,
  ): Promise<void> {
    const definition = policyDefinition(policyKey);
    if (!definition) {
      throw new NotFoundException({ code: "unknown_policy", message: `"${policyKey}" is not a registered policy.` });
    }
    if (!definition.options.some((option) => option.key === value)) {
      throw new BadRequestException({
        code: "invalid_policy_value",
        message: `"${value}" is not one of ${definition.key}'s declared options.`,
      });
    }
    if (!reason?.trim() || reason.trim().length < 10) {
      throw new BadRequestException({
        code: "reason_required",
        message: "A real reason (at least 10 characters) is required to change a policy.",
      });
    }

    const before = await this.resolveValue(tenantId, policyKey);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.workshopPolicy.updateMany({
        where: { tenantId, policyKey, effectiveTo: null },
        data: { effectiveTo: now },
      });

      await tx.workshopPolicy.create({
        data: {
          tenantId,
          policyKey,
          value,
          effectiveFrom: now,
          source,
          configuredBy: actor.accountId,
          reason,
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: actor.actorType,
          actorName: actor.displayName,
          targetType: "WorkshopPolicy",
          targetId: policyKey,
          action: "policy.changed",
          before: { policyKey, value: before },
          after: { policyKey, value },
          reason,
          // A policy change can alter which jobs a gate blocks, same
          // consequence class as a capability change -- HIGH, not routine.
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }
}

/** Re-exported for callers that only need to know a key is real without resolving a value. */
export const REGISTERED_POLICY_KEYS: ReadonlySet<string> = new Set(POLICY_REGISTRY.keys());

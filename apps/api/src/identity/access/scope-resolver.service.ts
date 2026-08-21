import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";

export type ScopeArrayKind = "branch" | "warehouse" | "category" | "team" | "managedTechnician";

/**
 * Layer 9 (User Scope) of the Effective Permission Resolver: "which records
 * does an allowed action apply to". Produces Prisma `in`-filter fragments
 * from the session's own scope arrays (already resolved fresh per request
 * by AuthService.resolveContextForAccount).
 *
 * A tenant-wide role (Owner, Admin, Data Analyst) has no business calling
 * this at all for a given entity -- that "am I scoped for this entity
 * type" decision is the calling domain service's job, not guessed here.
 * For a genuinely scoped role, an empty scope array (misconfiguration, or
 * a technician not yet assigned to a team) correctly produces `{ in: [] }`,
 * which matches zero rows -- safe by default, no special-casing needed.
 *
 * Layers 10-11 (Workflow Status, Record-Level Rule) are deliberately NOT
 * implemented here. They depend on each entity's own state machine (e.g. a
 * WorkOrder's current status, or "is this Invoice already fully paid"),
 * which belongs next to that entity's lifecycle service -- centralizing
 * them here would mean either duplicating each domain's state machine or
 * guessing at rules that don't exist yet (no feature pages exist before
 * Phase 2). Each domain service composes its own layer 10/11 checks on top
 * of this service's filterBy() output once it's built.
 */
@Injectable()
export class ScopeResolverService {
  filterBy(session: SessionContext, kind: ScopeArrayKind, fieldName: string): Record<string, { in: string[] }> {
    return { [fieldName]: { in: this.scopeArray(session, kind) } };
  }

  private scopeArray(session: SessionContext, kind: ScopeArrayKind): string[] {
    switch (kind) {
      case "branch":
        return session.branchScope;
      case "warehouse":
        return session.warehouseScope;
      case "category":
        return session.categoryScope;
      case "team":
        return session.teamScope;
      case "managedTechnician":
        return session.managedTechnicianIds;
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

/**
 * Legal retention default when a tenant is archived without an
 * explicit override -- long enough to cover the kind of obligation
 * Scenario 2's roll-cage records named (safety-critical service history
 * that must survive well past a cancelled subscription), short enough
 * that a workshop archived by mistake isn't carrying an indefinite
 * commitment. A real per-jurisdiction policy table is future work,
 * named rather than guessed at here.
 */
const DEFAULT_RETENTION_YEARS = 7;

export interface TenantLifecycleStatus {
  readonly status: string;
  readonly archivedAt: string | null;
  readonly retentionUntil: string | null;
}

/**
 * Phase 18.D -- what "archived" means operationally.
 *
 * Two clocks, never conflated: `archivedAt` is when the tenant stopped
 * being a live subscription, `retentionUntil` is when the platform's
 * legal obligation to keep the data ends. Archiving does not delete
 * anything -- `TenantStatusLayer` (Phase 18.D's other half) is what
 * actually makes an archived tenant read-only rather than merely
 * labelled so.
 *
 * Un-archiving a multi-year-dormant tenant against schema migrations
 * that happened while it was archived is explicitly named as owed in
 * docs/phases/PHASE_18.md -- this service does the state transition
 * honestly; it does not claim to reconcile data shape drift.
 */
@Injectable()
export class TenantLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async archive(tenantId: string, retentionYears: number = DEFAULT_RETENTION_YEARS): Promise<TenantLifecycleStatus> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: "tenant_not_found", message: "No such workshop." });

    if (tenant.status === "ARCHIVED") {
      throw new BadRequestException({ code: "already_archived", message: "This workshop is already archived." });
    }

    const now = new Date();
    const retentionUntil = new Date(now);
    retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: "ARCHIVED", archivedAt: now, retentionUntil },
    });

    return this.toStatus(updated);
  }

  /**
   * Un-archives back to READ_ONLY, not ACTIVE -- reactivating a
   * dormant tenant into full read-write access is a deliberate,
   * separate decision an operator makes afterward, not an automatic
   * side effect of "no longer archived". `retentionUntil` is left
   * intact rather than cleared: it recorded a real legal fact about
   * data collected during the archived period, which reactivating the
   * tenant does not retroactively undo.
   */
  async reactivate(tenantId: string): Promise<TenantLifecycleStatus> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: "tenant_not_found", message: "No such workshop." });

    if (tenant.status !== "ARCHIVED") {
      throw new BadRequestException({ code: "not_archived", message: "This workshop is not archived." });
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: "READ_ONLY", archivedAt: null },
    });

    return this.toStatus(updated);
  }

  private toStatus(tenant: { status: string; archivedAt: Date | null; retentionUntil: Date | null }): TenantLifecycleStatus {
    return {
      status: tenant.status,
      archivedAt: tenant.archivedAt?.toISOString() ?? null,
      retentionUntil: tenant.retentionUntil?.toISOString() ?? null,
    };
  }
}

import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { LayerDecision, PermissionLayer } from "../types";

/**
 * Layer 6: this specific workshop's published Role Experience configuration
 * (TenantConfiguration.roleExperience), set by Platform Super Admin's
 * Builder Control on a per-tenant basis (see the 2026-08-07 architecture
 * amendment in docs/PRODUCT_SPEC_CANONICAL.md -- workshop-level design/
 * structure differentiation still exists, it is just no longer Owner-
 * editable). This layer only ever narrows: it can deny a permission that a
 * lower layer (Role Permission Template, User Override) would otherwise
 * grant, but it never grants one itself -- granting is those layers' job.
 * That is why it locks on deny only, unlike layers 1-5, which are true
 * ceilings that lock on any definitive answer.
 *
 * Expected shape (minimal and additive -- nothing publishes to this yet,
 * Phase 2's Builder Control is the first writer):
 *   { "<StaffRole>": { "deniedPermissionKeys": string[] } }
 */
@Injectable()
export class WorkshopConfigurationLayer implements PermissionLayer {
  readonly name = "WorkshopConfiguration";

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(session: SessionContext, permissionKey: string): Promise<LayerDecision> {
    if (!session.tenantId) return null;

    const configuration = await this.prisma.tenantConfiguration.findUnique({
      where: { tenantId: session.tenantId },
      select: { roleExperience: true },
    });
    if (!configuration) return null;

    const deniedKeys = this.deniedKeysForRole(configuration.roleExperience, session.role);
    if (!deniedKeys.includes(permissionKey)) return null;

    return { allowed: false, locked: true, reason: "Disabled for this role in this workshop" };
  }

  private deniedKeysForRole(roleExperience: unknown, role: string): string[] {
    if (typeof roleExperience !== "object" || roleExperience === null) return [];
    const roleEntry = (roleExperience as Record<string, unknown>)[role];
    if (typeof roleEntry !== "object" || roleEntry === null) return [];

    const denied = (roleEntry as Record<string, unknown>).deniedPermissionKeys;
    if (!Array.isArray(denied)) return [];

    return denied.filter((item): item is string => typeof item === "string");
  }
}

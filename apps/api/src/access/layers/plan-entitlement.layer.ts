import { Injectable } from "@nestjs/common";
import { moduleForPermissionKey } from "@mop/shared";
import type { SessionContext } from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { LayerDecision, PermissionLayer } from "../types";

/** Layer 2: does this tenant's plan even include the module this key belongs to. */
@Injectable()
export class PlanEntitlementLayer implements PermissionLayer {
  readonly name = "PlanEntitlement";

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(session: SessionContext, permissionKey: string): Promise<LayerDecision> {
    if (!session.tenantId) return null;

    const requiredModule = moduleForPermissionKey(permissionKey);
    if (!requiredModule) return null; // unregistered key -- never guess, defer

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { plan: { select: { allowedModules: true } } },
    });
    if (!tenant) return null;

    if (tenant.plan.allowedModules.length === 0) return null; // plan imposes no module restriction
    if (tenant.plan.allowedModules.includes(requiredModule)) return null; // within plan, no opinion

    return { allowed: false, locked: true, reason: "Not included in your current plan" };
  }
}

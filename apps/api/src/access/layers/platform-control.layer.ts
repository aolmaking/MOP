import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { LayerDecision, LayerResult, PermissionLayer } from "../types";

/** Layer 1: the platform's own role/permission locks -- the true ceiling. */
@Injectable()
export class PlatformControlLayer implements PermissionLayer {
  readonly name = "PlatformControl";

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(session: SessionContext, permissionKey: string): Promise<LayerDecision> {
    if (!session.tenantId || !session.role) return null;

    const setting = await this.prisma.controlSetting.findFirst({
      where: {
        scope: "PLATFORM",
        tenantId: session.tenantId,
        type: "role_permission_lock",
        key: `${session.role}:${permissionKey}`,
        active: true,
      },
    });

    if (!setting) return null;

    const value = setting.value as { allowed?: boolean };
    if (typeof value.allowed !== "boolean") return null;

    const result: LayerResult = {
      allowed: value.allowed,
      locked: true,
      reason: value.allowed ? "Enabled by Platform Super Admin" : "Locked by Platform Super Admin",
    };
    return result;
  }
}

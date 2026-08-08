import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { LayerDecision, PermissionLayer } from "../types";

/**
 * Layer 8: a specific person's own override (UserPermissionOverride),
 * e.g. a named exception the Owner/Super Admin granted or revoked for one
 * staff member on top of their role's template. This is the last layer in
 * PermissionResolverService's chain, so it locks whenever a row exists --
 * there is nothing after it to defer to.
 */
@Injectable()
export class UserOverrideLayer implements PermissionLayer {
  readonly name = "UserOverride";

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(session: SessionContext, permissionKey: string): Promise<LayerDecision> {
    if (!session.staffUserId) return null;

    const row = await this.prisma.userPermissionOverride.findUnique({
      where: {
        staffUserId_permissionKey: {
          staffUserId: session.staffUserId,
          permissionKey,
        },
      },
      select: { allowed: true, reason: true },
    });
    if (!row) return null;

    return {
      allowed: row.allowed,
      locked: true,
      reason: row.reason ?? (row.allowed ? "Individually granted to you" : "Individually revoked for you"),
    };
  }
}

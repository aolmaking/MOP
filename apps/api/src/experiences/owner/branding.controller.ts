import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";

export interface UpdateBrandingDto {
  name?: string;
  logoUrl?: string | null;
  palette?: string;
  navigationLayout?: string;
}

@Controller("owner/branding")
@UseGuards(SessionGuard)
export class OwnerBrandingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async getBranding(@CurrentSession() session: SessionContext) {
    const tenantId = session.tenantId!;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        customerRegistrationCode: true,
        slug: true,
        city: true,
        configuration: {
          select: { theme: true },
        },
      },
    });

    if (!tenant) return null;
    const themeConfig = (tenant.configuration?.theme as any) ?? {};
    return {
      id: tenant.id,
      name: tenant.name,
      code: tenant.customerRegistrationCode,
      slug: tenant.slug,
      city: tenant.city,
      logoUrl: themeConfig.logoUrl ?? null,
      palette: themeConfig.palette ?? "crimson",
      navigationLayout: themeConfig.navigationLayout ?? "SIDEBAR",
    };
  }

  @Patch()
  async updateBranding(
    @CurrentSession() session: SessionContext,
    @Body() dto: UpdateBrandingDto,
  ) {
    const tenantId = session.tenantId!;
    const existingConfig = await this.prisma.tenantConfiguration.findUnique({
      where: { tenantId },
    });

    const currentTheme = (existingConfig?.theme as any) ?? {};
    const updatedTheme = {
      ...currentTheme,
      ...(dto.palette ? { palette: dto.palette } : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.navigationLayout ? { navigationLayout: dto.navigationLayout } : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      if (dto.name && dto.name.trim()) {
        const trimmed = dto.name.trim();
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            name: trimmed,
            nameNormalized: trimmed.toLowerCase(),
          },
        });
      }

      await tx.tenantConfiguration.upsert({
        where: { tenantId },
        create: {
          tenantId,
          theme: updatedTheme,
          pageLayouts: {},
          roleExperience: {},
          workflowPolicy: {},
          featureFlags: {},
          enabledModules: [],
          enabledFeatures: [],
          forms: {},
          messageTemplates: {},
        },
        update: {
          theme: updatedTheme,
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: session.accountId,
          actorType: "TENANT_STAFF",
          actorName: session.displayName,
          targetType: "TenantConfiguration",
          targetId: tenantId,
          action: "workshop.branding_updated",
          after: updatedTheme,
          riskLevel: "LOW",
        },
        tx,
      );
    });

    return { ok: true, theme: updatedTheme };
  }
}

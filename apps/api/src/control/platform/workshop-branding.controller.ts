import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

@Controller("workshops")
export class WorkshopBrandingPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("branding/:code")
  async getBranding(@Param("code") code: string) {
    const trimmed = (code || "").trim();
    if (!trimmed) {
      throw new NotFoundException({ code: "workshop_not_found", message: "Workshop code is required" });
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: trimmed.toLowerCase() },
          { customerRegistrationCode: { equals: trimmed, mode: "insensitive" } },
          { id: trimmed },
        ],
        status: { notIn: ["FROZEN", "SUSPENDED", "ARCHIVED"] },
      },
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

    if (!tenant) {
      throw new NotFoundException({ code: "workshop_not_found", message: "Workshop not found" });
    }

    const themeConfig = (tenant.configuration?.theme as any) ?? {};
    return {
      id: tenant.id,
      name: tenant.name,
      code: tenant.customerRegistrationCode,
      slug: tenant.slug,
      city: tenant.city,
      logoUrl: themeConfig.logoUrl ?? null,
      palette: themeConfig.palette ?? "crimson",
    };
  }
}

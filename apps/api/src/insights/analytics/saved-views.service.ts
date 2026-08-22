import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AnalystSavedViewSourcePage, Prisma } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface AnalystSavedView {
  readonly id: string;
  readonly name: string;
  readonly sourcePage: AnalystSavedViewSourcePage;
  readonly configuration: Prisma.JsonValue;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAnalystSavedViewInput {
  readonly name: string;
  readonly sourcePage: AnalystSavedViewSourcePage;
  readonly configuration: Record<string, unknown>;
}

/**
 * Data Analyst Saved Views -- persistence only. The export half remains
 * blocked until the plan-level Allowed Exports entitlement exists, per
 * the current implementation audit.
 */
@Injectable()
export class AnalystSavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, accountId: string): Promise<AnalystSavedView[]> {
    const rows = await this.prisma.analystSavedView.findMany({
      where: { tenantId, accountId },
      orderBy: [{ createdAt: "desc" }],
      select: VIEW_SELECT,
    });
    return rows.map(present);
  }

  async get(tenantId: string, accountId: string, id: string): Promise<AnalystSavedView> {
    const row = await this.findOwned(tenantId, accountId, id);
    return present(row);
  }

  async create(tenantId: string, accountId: string, input: CreateAnalystSavedViewInput): Promise<AnalystSavedView> {
    const name = normalizeName(input.name);
    const row = await this.prisma.analystSavedView.create({
      data: {
        tenantId,
        accountId,
        name,
        sourcePage: input.sourcePage,
        configuration: input.configuration as Prisma.InputJsonValue,
      },
      select: VIEW_SELECT,
    });
    return present(row);
  }

  async rename(tenantId: string, accountId: string, id: string, name: string): Promise<AnalystSavedView> {
    const normalizedName = normalizeName(name);
    await this.findOwned(tenantId, accountId, id);
    const row = await this.prisma.analystSavedView.update({
      where: { id },
      data: { name: normalizedName },
      select: VIEW_SELECT,
    });
    return present(row);
  }

  async remove(tenantId: string, accountId: string, id: string): Promise<{ ok: true }> {
    const result = await this.prisma.analystSavedView.deleteMany({ where: { id, tenantId, accountId } });
    if (result.count === 0) throw notFound();
    return { ok: true };
  }

  private async findOwned(tenantId: string, accountId: string, id: string) {
    const row = await this.prisma.analystSavedView.findFirst({
      where: { id, tenantId, accountId },
      select: VIEW_SELECT,
    });
    if (!row) throw notFound();
    return row;
  }
}

const VIEW_SELECT = {
  id: true,
  name: true,
  sourcePage: true,
  configuration: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AnalystSavedViewSelect;

type ViewRow = Prisma.AnalystSavedViewGetPayload<{ select: typeof VIEW_SELECT }>;

function present(row: ViewRow): AnalystSavedView {
  return {
    id: row.id,
    name: row.name,
    sourcePage: row.sourcePage,
    configuration: row.configuration,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException({ code: "saved_view_name_required", message: "Name the saved view." });
  }
  if (trimmed.length > 80) {
    throw new BadRequestException({ code: "saved_view_name_too_long", message: "Use 80 characters or fewer." });
  }
  return trimmed;
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: "saved_view_not_found", message: "Saved view not found." });
}

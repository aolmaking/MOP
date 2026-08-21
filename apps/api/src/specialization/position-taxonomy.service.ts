import { Injectable } from "@nestjs/common";
import { PrismaService } from "../runtime/database/prisma.service";

export interface PositionEntry {
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
}

/**
 * Per-category "where on the asset" vocabulary. `tenantId: null` rows are
 * the platform default for a category (FL/FR/RL/RR for cars); a
 * workshop row with the same category overrides the platform list
 * entirely for that tenant, rather than merging with it -- a workshop
 * that needs a different vocabulary needs its own complete one, not a
 * platform list with extras silently appended.
 */
@Injectable()
export class PositionTaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  async forCategory(tenantId: string, category: string): Promise<readonly PositionEntry[]> {
    const workshopOwn = await this.prisma.positionTaxonomyEntry.findMany({
      where: { tenantId, category: category as never },
      orderBy: { sortOrder: "asc" },
    });
    if (workshopOwn.length > 0) return workshopOwn.map(this.toEntry);

    const platformDefault = await this.prisma.positionTaxonomyEntry.findMany({
      where: { tenantId: null, category: category as never },
      orderBy: { sortOrder: "asc" },
    });
    return platformDefault.map(this.toEntry);
  }

  private toEntry(row: { code: string; label: string; sortOrder: number }): PositionEntry {
    return { code: row.code, label: row.label, sortOrder: row.sortOrder };
  }
}

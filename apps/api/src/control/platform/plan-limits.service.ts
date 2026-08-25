import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

export type PlanLimitedResource = "branches" | "warehouses" | "users";

/**
 * `Plan.maxBranches`/`maxUsers`/`maxWarehouses` were checked exactly once,
 * at workshop creation (`OnboardingService.validate()`, against the
 * draft's own counts) -- never again. Nothing stopped a workshop from
 * adding an unbounded number of branches, warehouses, or staff after that
 * single moment, so the ceiling a Super Admin sets at sign-up was
 * decorative for the rest of the workshop's life. This is the ongoing
 * enforcement: every place that creates a Branch, a Warehouse, or invites
 * a StaffUser calls the matching `assert*Capacity` first.
 *
 * Counts only active rows -- a deactivated branch/warehouse or a
 * deactivated staff account should not permanently occupy a seat the
 * workshop is no longer using.
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertBranchCapacity(tenantId: string): Promise<void> {
    const [plan, count] = await Promise.all([
      this.plan(tenantId),
      this.prisma.branch.count({ where: { tenantId, isActive: true } }),
    ]);
    this.assert("branches", plan.maxBranches, count);
  }

  async assertWarehouseCapacity(tenantId: string): Promise<void> {
    const [plan, count] = await Promise.all([
      this.plan(tenantId),
      this.prisma.warehouse.count({ where: { tenantId, isActive: true } }),
    ]);
    this.assert("warehouses", plan.maxWarehouses, count);
  }

  async assertUserCapacity(tenantId: string): Promise<void> {
    const [plan, count] = await Promise.all([
      this.plan(tenantId),
      this.prisma.staffUser.count({ where: { tenantId, isActive: true } }),
    ]);
    this.assert("users", plan.maxUsers, count);
  }

  private async plan(tenantId: string): Promise<{ maxBranches: number; maxWarehouses: number; maxUsers: number }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: { select: { maxBranches: true, maxWarehouses: true, maxUsers: true } } },
    });
    return tenant.plan;
  }

  private assert(resource: PlanLimitedResource, limit: number, count: number): void {
    if (count >= limit) {
      throw new ForbiddenException({
        code: `plan_${resource}_limit_reached`,
        message: `This workshop's plan allows up to ${limit} ${resource}. Contact Platform Super Admin to raise the limit.`,
      });
    }
  }
}

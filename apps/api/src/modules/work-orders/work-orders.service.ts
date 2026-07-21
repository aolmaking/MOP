import { Injectable } from "@nestjs/common";
import type { CategoryCode, WorkOrderDto } from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  async list(session: RequestSessionContext): Promise<WorkOrderDto[]> {
    const customerSafe = session.accountType === "customer";
    const rows = await this.prisma.workOrder.findMany({
      where: this.access.workOrderWhere(session),
      include: { asset: true, customer: true, branch: true },
      orderBy: { updatedAt: "desc" }
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      category: this.categoryLabel(row.category),
      status: row.status.toLowerCase(),
      statusLabel: row.statusLabel,
      priority: row.priority.toLowerCase(),
      assetName: row.asset.name,
      identifier: row.asset.primaryIdentifier,
      customerName: row.customer.fullName,
      branchName: row.branch?.name || "No branch",
      total: customerSafe ? 0 : Number(row.total),
      paid: customerSafe ? 0 : Number(row.paid),
      balance: customerSafe ? 0 : Number(row.balance),
      customerSummary: row.customerSummary || undefined
    }));
  }

  private categoryLabel(code: string): CategoryCode {
    if (code === "MOTORCYCLES") return "Motorcycles";
    if (code === "HEAVY_EQUIPMENT") return "Heavy Equipment";
    return "Cars";
  }
}

import { Injectable } from "@nestjs/common";
import { PaymentStatus } from "@prisma/client";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  async overview(session: RequestSessionContext) {
    const tenantId = session.tenantId!;
    const workOrderWhere = this.access.workOrderWhere(session);
    const inventoryWhere = this.access.inventoryWhere(session);
    const paymentWhere = {
      tenantId,
      status: PaymentStatus.CONFIRMED,
      ...(session.branchScope.length && !["tenant_owner", "tenant_admin", "data_analyst"].includes(session.roleId)
        ? { branchId: { in: session.branchScope } }
        : {})
    };
    const [workOrders, payments, inventory, customers, branches, audit, builder] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: workOrderWhere,
        include: { branch: true, tasks: { include: { assignments: { include: { staffUser: true } }, blockers: true } } },
        orderBy: { updatedAt: "desc" }
      }),
      this.prisma.payment.findMany({ where: paymentWhere, orderBy: { receivedAt: "desc" } }),
      this.prisma.inventoryItem.findMany({ where: inventoryWhere }),
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.tenantBuilderConfiguration.findUnique({ where: { tenantId } })
    ]);
    const revenue = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const open = workOrders.filter((row) => !["DELIVERED", "CANCELLED"].includes(row.status)).length;
    const waiting = workOrders.filter((row) => ["AWAITING_CUSTOMER_APPROVAL", "WAITING_FOR_PARTS", "PAYMENT_PENDING"].includes(row.status)).length;
    const blocked = workOrders.filter((row) => row.tasks.some((task) => task.blockers.some((blocker) => !blocker.resolved))).length;
    const lowStock = inventory.filter((item) => item.stock <= item.minStock).length;
    const branchRows = branches.map((branch) => {
      const rows = workOrders.filter((workOrder) => workOrder.branchId === branch.id);
      const branchRevenue = payments.filter((payment) => payment.branchId === branch.id).reduce((sum, payment) => sum + Number(payment.amount), 0);
      return { id: branch.id, label: branch.name, workOrders: rows.length, open: rows.filter((row) => !["DELIVERED", "CANCELLED"].includes(row.status)).length, revenue: branchRevenue };
    });
    const technicianMap = new Map<string, { id: string; name: string; tasks: number; readyQc: number; blocked: number }>();
    for (const workOrder of workOrders) {
      for (const task of workOrder.tasks) {
        for (const assignment of task.assignments) {
          if (assignment.staffUser.role !== "technician") continue;
          const row = technicianMap.get(assignment.staffUser.id) || { id: assignment.staffUser.id, name: assignment.staffUser.name, tasks: 0, readyQc: 0, blocked: 0 };
          row.tasks += 1;
          if (task.status === "READY_FOR_QC") row.readyQc += 1;
          if (task.blockers.some((blocker) => !blocker.resolved)) row.blocked += 1;
          technicianMap.set(row.id, row);
        }
      }
    }
    return {
      scope: {
        role: session.roleId,
        tenantId,
        branchIds: session.branchScope,
        warehouseIds: session.warehouseScope,
        readOnly: true
      },
      metrics: [
        { key: "work_orders", label: "Work Orders", value: workOrders.length, tone: "neutral" },
        { key: "open_work", label: "Open Work", value: open, tone: open ? "blue" : "neutral" },
        { key: "waiting", label: "Waiting", value: waiting, tone: waiting ? "amber" : "neutral" },
        { key: "blocked", label: "Blocked", value: blocked, tone: blocked ? "red" : "neutral" },
        { key: "revenue", label: "Collected Revenue", value: revenue, suffix: "EGP", tone: "green" },
        { key: "low_stock", label: "Low Stock Items", value: lowStock, tone: lowStock ? "amber" : "neutral" },
        { key: "customers", label: "Customers", value: customers, tone: "neutral" },
        { key: "builder_version", label: "Builder Version", value: builder?.activeVersionId || "Not configured", tone: "neutral" }
      ],
      statusBreakdown: Object.entries(workOrders.reduce<Record<string, number>>((map, row) => {
        map[row.status] = (map[row.status] || 0) + 1;
        return map;
      }, {})).map(([label, value]) => ({ label: label.toLowerCase().replaceAll("_", " "), value })),
      branches: branchRows,
      technicians: [...technicianMap.values()].sort((a, b) => b.tasks - a.tasks),
      recentActivity: audit.map((row) => ({
        id: row.id,
        actor: row.actorName,
        action: row.action,
        target: row.targetType,
        at: row.createdAt.toISOString()
      }))
    };
  }
}

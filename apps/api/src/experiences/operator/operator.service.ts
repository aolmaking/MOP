import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { IntakeService } from "../../systems/operations/intake.service";
import { CatalogBrowseService } from "../../systems/inventory/catalog-browse.service";
import type { SessionContext } from "@mop/shared";
import { type CategoryCode, Prisma } from "@mop/database";
import type { LifecycleActor } from "../../systems/operations/work-order-lifecycle.service";
import type {
  OperatorDispatchRepairDto,
  OperatorIntakeDto,
  OperatorPosOrderDto,
  OperatorUpdateQuoteDto,
  RegisterCustomerVehicleDto,
} from "./operator.dto";

export interface OperatorVehicleSummary {
  id: string;
  plateNumber: string | null;
  vinOrChassisNumber: string | null;
  category: string;
  ownedSince: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerCustomerId: string | null;
  activeWorkOrder?: {
    id: string;
    status: string;
    createdAt: string;
  } | null;
}

export interface OperatorOverview {
  metrics: {
    totalVehicles: number;
    inServiceCount: number;
    intakeQueueCount: number;
  };
  branches: Array<{ id: string; name: string; code: string }>;
  vehicles: OperatorVehicleSummary[];
}

@Injectable()
export class OperatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intakeService: IntakeService,
    @Optional() private readonly browse?: CatalogBrowseService,
  ) {}

  /**
   * Complete overview of reception floor for the operator.
   */
  async getOverview(tenantId: string, branchScope: string[]): Promise<OperatorOverview> {
    const [branches, assets, activeOrders] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          tenantId,
          isActive: true,
          ...(branchScope.length > 0 ? { id: { in: branchScope } } : {}),
        },
        select: { id: true, name: true, code: true },
        orderBy: { code: "asc" },
      }),
      this.prisma.asset.findMany({
        where: { tenantId },
        select: {
          id: true,
          plateNumber: true,
          vinOrChassisNumber: true,
          category: true,
          createdAt: true,
          ownershipHistory: {
            where: { endedAt: null },
            take: 1,
            select: {
              startedAt: true,
              customer: {
                select: { id: true, fullName: true, phone: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          status: { notIn: ["CLOSED", "CANCELLED"] },
          ...(branchScope.length > 0 ? { branchId: { in: branchScope } } : {}),
        },
        select: {
          id: true,
          assetId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const activeOrderByAsset = new Map<string, (typeof activeOrders)[0]>();
    for (const order of activeOrders) {
      if (!activeOrderByAsset.has(order.assetId)) {
        activeOrderByAsset.set(order.assetId, order);
      }
    }

    const vehicleSummaries: OperatorVehicleSummary[] = assets.map((a) => {
      const owner = a.ownershipHistory[0]?.customer ?? null;
      const activeOrder = activeOrderByAsset.get(a.id) ?? null;
      return {
        id: a.id,
        plateNumber: a.plateNumber,
        vinOrChassisNumber: a.vinOrChassisNumber,
        category: a.category,
        ownedSince: a.ownershipHistory[0]?.startedAt ? a.ownershipHistory[0].startedAt.toISOString() : a.createdAt.toISOString(),
        ownerName: owner?.fullName ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerCustomerId: owner?.id ?? null,
        activeWorkOrder: activeOrder
          ? {
              id: activeOrder.id,
              status: activeOrder.status,
              createdAt: activeOrder.createdAt.toISOString(),
            }
          : null,
      };
    });

    const inServiceCount = activeOrders.filter((o) => o.status !== "REGISTERED" && o.status !== "DRAFT").length;
    const intakeQueueCount = activeOrders.filter((o) => o.status === "REGISTERED" || o.status === "DRAFT").length;

    return {
      metrics: {
        totalVehicles: assets.length,
        inServiceCount,
        intakeQueueCount,
      },
      branches,
      vehicles: vehicleSummaries,
    };
  }

  /**
   * Omnibar search for reception: searches plate, VIN, customer name, and customer phone.
   */
  async searchReception(tenantId: string, rawQuery: string): Promise<OperatorVehicleSummary[]> {
    const q = rawQuery.trim();
    if (!q) {
      const overview = await this.getOverview(tenantId, []);
      return overview.vehicles;
    }

    const assets = await this.prisma.asset.findMany({
      where: {
        tenantId,
        OR: [
          { plateNumber: { contains: q, mode: "insensitive" } },
          { vinOrChassisNumber: { contains: q, mode: "insensitive" } },
          {
            ownershipHistory: {
              some: {
                endedAt: null,
                customer: {
                  OR: [
                    { fullName: { contains: q, mode: "insensitive" } },
                    { phone: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        plateNumber: true,
        vinOrChassisNumber: true,
        category: true,
        createdAt: true,
        ownershipHistory: {
          where: { endedAt: null },
          take: 1,
          select: {
            startedAt: true,
            customer: {
              select: { id: true, fullName: true, phone: true },
            },
          },
        },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    const assetIds = assets.map((a) => a.id);
    const activeOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        assetId: { in: assetIds },
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      select: {
        id: true,
        assetId: true,
        status: true,
        createdAt: true,
      },
    });

    const activeOrderByAsset = new Map<string, (typeof activeOrders)[0]>();
    for (const order of activeOrders) {
      activeOrderByAsset.set(order.assetId, order);
    }

    return assets.map((a) => {
      const owner = a.ownershipHistory[0]?.customer ?? null;
      const activeOrder = activeOrderByAsset.get(a.id) ?? null;
      return {
        id: a.id,
        plateNumber: a.plateNumber,
        vinOrChassisNumber: a.vinOrChassisNumber,
        category: a.category,
        ownedSince: a.ownershipHistory[0]?.startedAt ? a.ownershipHistory[0].startedAt.toISOString() : a.createdAt.toISOString(),
        ownerName: owner?.fullName ?? null,
        ownerPhone: owner?.phone ?? null,
        ownerCustomerId: owner?.id ?? null,
        activeWorkOrder: activeOrder
          ? {
              id: activeOrder.id,
              status: activeOrder.status,
              createdAt: activeOrder.createdAt.toISOString(),
            }
          : null,
      };
    });
  }

  /**
   * Register walk-in customer and vehicle together.
   */
  async registerCustomerAndVehicle(
    tenantId: string,
    dto: RegisterCustomerVehicleDto,
  ): Promise<OperatorVehicleSummary> {
    const cleanPhone = dto.phone.trim();
    const cleanName = dto.fullName.trim();
    const cleanPlate = dto.plateNumber.trim().toUpperCase();

    if (!cleanPhone || !cleanName || !cleanPlate) {
      throw new BadRequestException({
        code: "invalid_input",
        message: "Customer Name, Phone number, and Vehicle Plate are required.",
      });
    }

    // Find or create customer
    let customer = await this.prisma.customer.findFirst({
      where: { tenantId, phone: cleanPhone },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          tenantId,
          fullName: cleanName,
          phone: cleanPhone,
          email: dto.email?.trim() || null,
        },
      });
    }

    // Create vehicle asset
    const asset = await this.prisma.asset.create({
      data: {
        tenantId,
        plateNumber: cleanPlate,
        vinOrChassisNumber: dto.vinOrChassisNumber?.trim() || null,
        category: (dto.category ?? "CARS") as CategoryCode,
      },
    });

    // Create ownership history
    const ownership = await this.prisma.assetOwnershipHistory.create({
      data: {
        tenantId,
        assetId: asset.id,
        customerId: customer.id,
        startedAt: new Date(),
      },
    });

    return {
      id: asset.id,
      plateNumber: asset.plateNumber,
      vinOrChassisNumber: asset.vinOrChassisNumber,
      category: asset.category,
      ownedSince: ownership.startedAt.toISOString(),
      ownerName: customer.fullName,
      ownerPhone: customer.phone,
      ownerCustomerId: customer.id,
      activeWorkOrder: null,
    };
  }

  /**
   * Intake and book service for a pre-selected vehicle.
   */
  async createIntake(
    tenantId: string,
    dto: OperatorIntakeDto,
    session: SessionContext,
  ): Promise<{ workOrderId: string; status: string; assetId: string }> {
    if (!dto.complaint?.trim()) {
      throw new BadRequestException({
        code: "complaint_required",
        message: "Please describe the problem or select at least one inspection subsystem.",
      });
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: dto.assetId },
      include: {
        ownershipHistory: {
          where: { endedAt: null },
          take: 1,
          include: { customer: true },
        },
      },
    });

    if (!asset || asset.tenantId !== tenantId) {
      throw new BadRequestException({
        code: "asset_not_found",
        message: "Selected vehicle not found in this workshop.",
      });
    }

    const customer = asset.ownershipHistory[0]?.customer;
    if (!customer) {
      throw new BadRequestException({
        code: "owner_not_found",
        message: "This vehicle has no active owner assigned. Please register an owner first.",
      });
    }

    // Resolve branch
    let branchId = dto.branchId;
    if (!branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          tenantId,
          isActive: true,
          ...(session.branchScope.length > 0 ? { id: { in: session.branchScope } } : {}),
        },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException({
          code: "no_active_branch",
          message: "No active branches configured for this workshop.",
        });
      }
      branchId = branch.id;
    }

    const actor: LifecycleActor = {
      accountId: session.accountId,
      displayName: session.displayName || "Operator",
      actorType: "TENANT_STAFF",
    };

    const partsFormatted =
      dto.inspectionParts && dto.inspectionParts.length > 0
        ? `[Inspection Parts: ${dto.inspectionParts.join(", ")}] `
        : "";
    const fullComplaint = `${partsFormatted}${dto.complaint.trim()}`;

    const result = await this.intakeService.intake(
      {
        tenantId,
        branchId,
        customer: { existingCustomerId: customer.id },
        asset: { existingAssetId: asset.id },
        complaint: fullComplaint,
        inspectionDeclined: dto.inspectionDeclined ?? false,
      },
      actor,
    );

    if (dto.inspectionParts && dto.inspectionParts.length > 0) {
      await this.prisma.inspection.create({
        data: {
          tenantId,
          workOrderId: result.workOrderId,
          technicianId: session.accountId,
          type: "QUICK",
          fields: {
            requestedParts: dto.inspectionParts,
            completedBoxes: {},
          },
        },
      }).catch(() => null);
    }

    return {
      workOrderId: result.workOrderId,
      status: result.status,
      assetId: asset.id,
    };
  }

  /**
   * Browse parts catalog for over-the-counter POS.
   */
  async browseCatalog(tenantId: string, query: any) {
    if (!this.browse) {
      return { items: [], total: 0, page: 1, pageSize: 24, categories: [], filters: [] };
    }
    return this.browse.browse(tenantId, query);
  }

  /**
   * Over-the-counter POS parts checkout executed by the Operator.
   */
  async createPosOrder(tenantId: string, dto: OperatorPosOrderDto, session: SessionContext) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: "lines_required",
        message: "No parts in cart to order.",
      });
    }

    // Resolve branch
    const branch = await this.prisma.branch.findFirst({
      where: {
        tenantId,
        isActive: true,
        ...(session.branchScope.length > 0 ? { id: { in: session.branchScope } } : {}),
      },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException({
        code: "no_active_branch",
        message: "No active branch found.",
      });
    }

    // Verify stock and fetch item details
    const itemIds = dto.lines.map((l) => l.inventoryItemId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, id: { in: itemIds } },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    let grandTotal = 0;
    const lineDetails = [];

    for (const line of dto.lines) {
      const item = itemMap.get(line.inventoryItemId);
      if (!item) {
        throw new BadRequestException({
          code: "item_not_found",
          message: `Item ${line.inventoryItemId} not found.`,
        });
      }
      const price = item.sellingPrice ? Number(item.sellingPrice) : 0;
      grandTotal += price * line.quantity;
      lineDetails.push({
        item,
        quantity: line.quantity,
        unitPrice: price,
        lineTotal: price * line.quantity,
      });
    }

    // Resolve or create counter customer
    let customerId = dto.customerId;
    if (!customerId) {
      let counterCustomer = await this.prisma.customer.findFirst({
        where: { tenantId, phone: "0000000000" },
      });
      if (!counterCustomer) {
        counterCustomer = await this.prisma.customer.create({
          data: {
            tenantId,
            fullName: "Counter Walk-in Customer",
            phone: "0000000000",
          },
        });
      }
      customerId = counterCustomer.id;
    }

    // Resolve or create counter asset
    let counterAsset = await this.prisma.asset.findFirst({
      where: { tenantId, plateNumber: "COUNTER-SALE" },
    });
    if (!counterAsset) {
      counterAsset = await this.prisma.asset.create({
        data: {
          tenantId,
          plateNumber: "COUNTER-SALE",
          category: "CARS",
        },
      });
    }

    // Create counter work order in PAYMENT_PENDING
    const workOrder = await this.prisma.workOrder.create({
      data: {
        tenantId,
        branchId: branch.id,
        customerId,
        assetId: counterAsset.id,
        status: "PAYMENT_PENDING",
      },
    });

    const invoiceNumber = `INV-POS-${Date.now().toString().slice(-6)}`;
    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        workOrderId: workOrder.id,
        invoiceNumber,
        subtotal: grandTotal.toFixed(2),
        total: grandTotal.toFixed(2),
        balance: grandTotal.toFixed(2),
        paid: "0.00",
        issuedById: session.accountId,
      },
    });

    const totalItems = lineDetails.reduce((s, l) => s + l.quantity, 0);

    return {
      workOrderId: workOrder.id,
      invoiceId: invoice.id,
      invoiceNumber,
      total: grandTotal.toFixed(2),
      itemsCount: totalItems,
    };
  }

  /**
   * Fetch all inspection reports submitted by technicians awaiting operator review & quote dispatch.
   */
  async getInspectionReports(tenantId: string, branchScope?: string[]) {
    const orders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...(branchScope && branchScope.length > 0 ? { branchId: { in: branchScope } } : {}),
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      include: {
        asset: { select: { plateNumber: true, category: true, vinOrChassisNumber: true } },
        customer: { select: { fullName: true, phone: true } },
        inspections: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
        faults: {
          select: { id: true, description: true, severity: true, recommendedService: true, code: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return orders
      .filter((o) => {
        const insp = o.inspections[0];
        const fields = (insp?.fields as Record<string, any>) ?? {};
        return (
          fields.inspectionReportSubmitted === true ||
          o.status === "UNDER_INSPECTION" ||
          o.status === "AWAITING_CUSTOMER_APPROVAL" ||
          (o.faults && o.faults.length > 0)
        );
      })
      .map((o) => {
        const insp = o.inspections[0];
        const fields = (insp?.fields as Record<string, any>) ?? {};
        const pricing = fields.pricing ?? { partsTotal: 0, laborTotal: 0, grandTotal: 0 };
        const findingsList =
          fields.findings && Array.isArray(fields.findings) && fields.findings.length > 0
            ? fields.findings
            : o.faults.map((f) => ({
                id: f.id,
                description: f.description,
                severity: f.severity === "HIGH" ? "CRITICAL" : f.severity,
                recommendedService: f.recommendedService,
                code: f.code,
              }));

        const plate = o.asset.plateNumber ?? "Vehicle";
        const catLabel = o.asset.category ? o.asset.category.replace(/_/g, " ") : "Vehicle";
        const vehicleModel = `${plate} (${catLabel})`;
        const vin = o.asset.vinOrChassisNumber ?? "VIN-UNSPECIFIED";

        return {
          workOrderId: o.id,
          identifier: plate,
          vehicleModel,
          vin,
          customerName: o.customer.fullName,
          customerPhone: o.customer.phone ?? null,
          status: o.status,
          inspectionId: insp?.id ?? null,
          submittedAt: fields.submittedAt ?? o.updatedAt.toISOString(),
          findingsCount: findingsList.length,
          findings: findingsList,
          partsCount: (fields.parts ?? []).length,
          parts: fields.parts ?? [],
          servicesCount: (fields.services ?? []).length,
          services: fields.services ?? [],
          pricing,
          totalEstimate: Number(pricing.grandTotal || 0),
        };
      });
  }

  /**
   * Get single inspection report detail for the quote builder drawer.
   */
  async getInspectionReportDetail(tenantId: string, workOrderId: string) {
    const order = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      include: {
        asset: { select: { plateNumber: true, category: true, vinOrChassisNumber: true } },
        customer: { select: { fullName: true, phone: true } },
        inspections: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
        faults: true,
      },
    });

    if (!order) {
      throw new BadRequestException({ code: "order_not_found", message: "Work order not found" });
    }

    const insp = order.inspections[0];
    const fields = (insp?.fields as Record<string, any>) ?? {};
    const findings =
      fields.findings && fields.findings.length > 0
        ? fields.findings
        : order.faults.map((f) => ({
            id: f.id,
            description: f.description,
            severity: f.severity === "HIGH" ? "CRITICAL" : f.severity,
            recommendedService: f.recommendedService,
            code: f.code,
          }));

    const parts = fields.parts ?? [];
    const services = fields.services ?? [];
    const partsTotal = parts.reduce((sum: number, p: any) => sum + Number(p.unitPrice || 0) * (p.quantity || 1), 0);
    const laborTotal = services.reduce((sum: number, s: any) => sum + Number(s.laborPrice || 0), 0);
    const grandTotal = partsTotal + laborTotal;

    const plate = order.asset.plateNumber ?? "Vehicle";
    const catLabel = order.asset.category ? order.asset.category.replace(/_/g, " ") : "Vehicle";
    const vehicleModel = `${plate} (${catLabel})`;
    const vin = order.asset.vinOrChassisNumber ?? "VIN-UNSPECIFIED";

    return {
      workOrderId: order.id,
      identifier: plate,
      vehicleModel,
      vin,
      customerName: order.customer.fullName,
      customerPhone: order.customer.phone ?? null,
      status: order.status,
      submittedAt: fields.submittedAt ?? order.updatedAt.toISOString(),
      findings,
      parts,
      services,
      notes: fields.note ?? "",
      pricing: {
        partsTotal,
        laborTotal,
        grandTotal,
      },
    };
  }

  /**
   * Update quote items (parts from POS, services, severities) on an inspection report.
   */
  async updateQuote(tenantId: string, workOrderId: string, dto: OperatorUpdateQuoteDto) {
    let inspection = await this.prisma.inspection.findFirst({
      where: { workOrderId, tenantId },
      orderBy: { startedAt: "desc" },
    });

    const currentFields = (inspection?.fields as Record<string, any>) ?? {};
    const parts = dto.parts ?? currentFields.parts ?? [];
    const services = dto.services ?? currentFields.services ?? [];
    const findings = dto.findings ?? currentFields.findings ?? [];

    const partsTotal = parts.reduce((sum: number, p: any) => sum + Number(p.unitPrice || 0) * (p.quantity || 1), 0);
    const laborTotal = services.reduce((sum: number, s: any) => sum + Number(s.laborPrice || 0), 0);
    const grandTotal = partsTotal + laborTotal;

    const updatedFields = {
      ...currentFields,
      findings,
      parts,
      services,
      notes: dto.notes ?? currentFields.notes ?? "",
      pricing: { partsTotal, laborTotal, grandTotal },
    };

    if (inspection) {
      await this.prisma.inspection.update({
        where: { id: inspection.id },
        data: { fields: updatedFields },
      });
    }

    return {
      success: true,
      workOrderId,
      pricing: { partsTotal, laborTotal, grandTotal },
    };
  }

  /**
   * Approve quote & dispatch work order to repair stage.
   */
  async dispatchRepair(tenantId: string, workOrderId: string, dto: OperatorDispatchRepairDto, session: SessionContext) {
    const order = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      include: {
        inspections: { orderBy: { startedAt: "desc" }, take: 1 },
      },
    });

    if (!order) {
      throw new BadRequestException({ code: "order_not_found", message: "Work order not found" });
    }

    const insp = order.inspections[0];
    const fields = (insp?.fields as Record<string, any>) ?? {};

    // 1. Mark inspection completed
    if (insp) {
      await this.prisma.inspection.update({
        where: { id: insp.id },
        data: {
          completedAt: new Date(),
          fields: {
            ...fields,
            operatorApproved: true,
            approvedAt: new Date().toISOString(),
            approvedBy: session.accountId,
          },
        },
      });
    }

    // 2. Transition work order status to APPROVED_FOR_WORK (or READY_TO_START)
    await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: "APPROVED_FOR_WORK" as any,
      },
    });

    // 3. Create repair tasks for technician to execute in fixing stage
    const services = fields.services ?? [];
    if (services.length > 0) {
      for (const s of services) {
        await this.prisma.task.create({
          data: {
            tenantId,
            workOrderId,
            title: s.name || "Perform Vehicle Repair",
            status: "ASSIGNED",
          },
        }).catch(() => null);
      }
    } else {
      await this.prisma.task.create({
        data: {
          tenantId,
          workOrderId,
          title: "Complete Inspected Repairs & Adjustments",
          status: "ASSIGNED",
        },
      }).catch(() => null);
    }

    // 4. Create WorkOrderPartLine rows for physical parts picked from POS
    const parts = fields.parts ?? [];
    for (const p of parts) {
      await this.prisma.workOrderPartLine.create({
        data: {
          tenantId,
          workOrderId,
          name: p.name || "Replacement Part",
          provenance: "INVENTORY",
          quantity: Number(p.quantity) || 1,
          sellingPrice: new Prisma.Decimal(p.unitPrice || 0),
          addedById: session.accountId,
          workshopWarranted: true,
        },
      }).catch(() => null);
    }

    return {
      success: true,
      workOrderId,
      newStatus: "APPROVED_FOR_WORK",
      message: "Inspection quote approved and dispatched to technician for repair!",
    };
  }
}

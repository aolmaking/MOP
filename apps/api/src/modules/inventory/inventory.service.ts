import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditActorType,
  CategoryCode as PrismaCategoryCode,
  InventoryItemStatus,
  InventoryTransferStatus,
  IssuedItemStatus,
  PartRequestStatus,
  ReturnRequestStatus,
  Severity,
  StockMovementType,
  SupplierOrderStatus,
  WorkOrderStatus
} from "@prisma/client";
import type {
  CategoryCode,
  InventoryHomeDto,
  InventoryItemDto,
  InventoryMovementDto,
  InventoryReportsDto,
  InventoryReturnRequestDto,
  InventoryStockStatusDto,
  InventoryTechnicianRequestDto,
  OperationNotificationTarget,
  OperationReportHookDto
} from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import { FinanceService } from "../finance/finance.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

const isOneOf = <T>(value: T, ...allowed: T[]) => allowed.includes(value);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationEvents: OperationEventsService,
    private readonly finance: FinanceService
  ) {}

  async home(session: RequestSessionContext): Promise<InventoryHomeDto> {
    const warehouseIds = this.warehouseScope(session);
    const [requests, items, movements, returns, balances] = await Promise.all([
      this.prisma.partRequest.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } } }),
      this.prisma.inventoryItem.findMany({ where: this.access.inventoryWhere(session) }),
      this.prisma.stockMovement.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } } }),
      this.prisma.partReturnRequest.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } } }),
      this.prisma.warehouseStockBalance.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } } })
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const usage = new Map<string, number>();
    for (const movement of movements.filter((row) => isOneOf(row.type, StockMovementType.USED, StockMovementType.WORK_ORDER_CONSUMPTION))) {
      usage.set(movement.itemId, (usage.get(movement.itemId) || 0) + Math.abs(movement.qty));
    }
    const itemById = new Map(items.map((item) => [item.id, item]));
    const stockByItem = this.availableByItem(items, balances);
    return {
      counts: {
        pendingTechnicianRequests: requests.filter((row) => isOneOf(row.status, PartRequestStatus.REQUESTED, PartRequestStatus.PENDING_WAREHOUSE, PartRequestStatus.WAREHOUSE_REVIEWING)).length,
        itemsToDispatch: requests.filter((row) => row.status === PartRequestStatus.APPROVED).length,
        waitingTechnicianArrival: requests.filter((row) => isOneOf(row.status, PartRequestStatus.ISSUED, PartRequestStatus.IN_TRANSIT, PartRequestStatus.ARRIVED)).length,
        returnRequests: returns.filter((row) => row.status === ReturnRequestStatus.PENDING_INVENTORY_REVIEW).length,
        lowStock: items.filter((item) => stockByItem.get(item.id)! > 0 && stockByItem.get(item.id)! <= item.minStock).length,
        criticalStock: items.filter((item) => stockByItem.get(item.id)! > 0 && stockByItem.get(item.id)! <= item.criticalStock).length,
        outOfStock: items.filter((item) => stockByItem.get(item.id)! <= 0).length,
        todayMovements: movements.filter((row) => row.createdAt.toISOString().startsWith(today)).length
      },
      fastMovingItems: [...usage.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([itemId, qtyUsed]) => ({
          itemName: itemById.get(itemId)?.name || itemId,
          qtyUsed,
          category: itemById.get(itemId)?.catalogCategory || "Unknown"
        }))
    };
  }

  async items(session: RequestSessionContext): Promise<InventoryItemDto[]> {
    const rows = await this.prisma.inventoryItem.findMany({
      where: this.access.inventoryWhere(session),
      include: { warehouse: true },
      orderBy: { name: "asc" }
    });
    return rows.map((row) => this.itemDto(row));
  }

  async partRequests(session: RequestSessionContext) {
    return this.technicianRequests(session);
  }

  async technicianRequests(session: RequestSessionContext): Promise<InventoryTechnicianRequestDto[]> {
    const warehouseIds = this.warehouseScope(session);
    const rows = await this.prisma.partRequest.findMany({
      where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } },
      include: {
        item: true,
        warehouse: true,
        workOrder: { include: { asset: true, branch: true } },
        task: true
      },
      orderBy: { updatedAt: "desc" }
    });
    const technicians = await this.staffNames(rows.map((row) => row.technicianId).filter(Boolean) as string[]);
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId: session.tenantId, itemId: { in: rows.map((row) => row.itemId) } },
      include: { warehouse: true }
    });
    const accessRows = await this.prisma.branchWarehouseAccess.findMany({
      where: {
        tenantId: session.tenantId,
        branchId: { in: rows.map((row) => row.workOrder.branchId).filter(Boolean) as string[] },
        warehouseId: { in: balances.map((balance) => balance.warehouseId) }
      }
    });
    const accessMap = new Map(accessRows.map((row) => [`${row.branchId}:${row.warehouseId}`, row.accessType.toLowerCase()]));
    return rows.map((row) => {
      const availableWarehouses = balances
        .filter((balance) => balance.itemId === row.itemId)
        .map((balance) => ({
          warehouseId: balance.warehouseId,
          warehouseName: balance.warehouse.name,
          availableQty: balance.availableQty,
          accessType: accessMap.get(`${row.workOrder.branchId}:${balance.warehouseId}`)
        }));
      return {
        id: row.id,
        workOrderNumber: row.workOrder.number,
        taskTitle: row.task?.title,
        technicianName: row.technicianId ? technicians.get(row.technicianId) : undefined,
        assetName: row.workOrder.asset.name,
        assetIdentifier: row.workOrder.asset.primaryIdentifier,
        category: this.categoryLabel(row.workOrder.category),
        branchName: row.workOrder.branch?.name,
        itemId: row.itemId,
        itemName: row.item.name,
        sku: row.item.sku,
        qty: row.qty,
        urgency: this.severityLabel(row.urgency),
        reason: row.reason || undefined,
        availability: this.availability(row.item.stock, row.item.minStock, availableWarehouses),
        status: this.requestStatus(row.status),
        requestedAt: row.createdAt.toISOString(),
        availableWarehouses
      };
    });
  }

  async requestAction(session: RequestSessionContext, id: string, body: any) {
    const action = String(body?.action || "");
    const request = await this.prisma.partRequest.findFirst({
      where: { id, tenantId: session.tenantId, warehouseId: { in: this.warehouseScope(session) } },
      include: { item: true, workOrder: true, task: true, warehouse: true }
    });
    if (!request) throw new NotFoundException("Part request not found in inventory scope.");
    this.assertRequestActionPermission(session, action);

    if (action === "approve") {
      await this.prisma.partRequest.update({ where: { id }, data: { status: PartRequestStatus.APPROVED } });
      await this.audit(session, "inventory.request.approved", "part_request", id, "Inventory Manager approved technician part request.");
      await this.emitInventoryRequestOperation(session, request, "approve", "APPROVED", "Inventory Manager approved technician part request.");
      return { status: "approved" };
    }

    if (action === "issue") {
      const qty = Math.max(1, Number(body?.qty || request.qty));
      const fulfillmentWarehouseId = String(body?.warehouseId || body?.fromWarehouseId || request.warehouseId);
      if (!this.warehouseScope(session).includes(fulfillmentWarehouseId)) throw new BadRequestException("Selected warehouse is outside inventory manager scope.");
      await this.prisma.warehouseStockBalance.upsert({
        where: { warehouseId_itemId: { warehouseId: fulfillmentWarehouseId, itemId: request.itemId } },
        create: {
          tenantId: request.tenantId,
          warehouseId: fulfillmentWarehouseId,
          itemId: request.itemId,
          availableQty: fulfillmentWarehouseId === request.item.warehouseId ? request.item.stock : 0,
          issuedQty: 0,
          lowThreshold: request.item.minStock,
          criticalThreshold: request.item.criticalStock
        },
        update: {}
      });
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.warehouseStockBalance.findUnique({
          where: { warehouseId_itemId: { warehouseId: fulfillmentWarehouseId, itemId: request.itemId } }
        });
        const availableQty = balance?.availableQty ?? 0;
        if (availableQty < qty) throw new BadRequestException("Not enough available stock in the selected warehouse to issue this request.");

        const balanceUpdate = await tx.warehouseStockBalance.updateMany({
          where: { tenantId: request.tenantId, warehouseId: fulfillmentWarehouseId, itemId: request.itemId, availableQty: { gte: qty } },
          data: { availableQty: { decrement: qty }, issuedQty: { increment: qty } }
        });
        if (balanceUpdate.count !== 1) throw new BadRequestException("Stock changed while issuing this request. Please retry.");

        if (fulfillmentWarehouseId === request.item.warehouseId) {
          const itemUpdate = await tx.inventoryItem.updateMany({
            where: { id: request.itemId, stock: { gte: qty } },
            data: { stock: { decrement: qty } }
          });
          if (itemUpdate.count !== 1) throw new BadRequestException("Inventory item stock changed while issuing this request. Please retry.");
        }
        await tx.partRequest.update({
          where: { id },
          data: {
            status: PartRequestStatus.ISSUED,
            issuedAt: new Date(),
            fulfillmentWarehouseId
          }
        });
        await tx.issuedItem.create({
          data: {
            tenantId: request.tenantId,
            requestId: id,
            warehouseId: fulfillmentWarehouseId,
            itemId: request.itemId,
            workOrderId: request.workOrderId,
            taskId: request.taskId,
            technicianId: request.technicianId,
            qty,
            status: IssuedItemStatus.IN_TRANSIT,
            issuedBy: session.userId
          }
        });
        await tx.stockMovement.create({
          data: {
            tenantId: request.tenantId,
            warehouseId: fulfillmentWarehouseId,
            itemId: request.itemId,
            type: StockMovementType.ISSUED_TO_TASK,
            qty: -qty,
            beforeQty: availableQty,
            afterQty: availableQty - qty,
            source: request.workOrderId,
            reason: "Technician request issued by Inventory Manager.",
            createdBy: session.userId
          }
        });
      });
      await this.audit(session, "part.issued", "part_request", id, "Part issued to technician/work order.");
      await this.emitInventoryRequestOperation(session, request, "issue", "ISSUED", "Part issued to technician/work order.", { fulfillmentWarehouseId, qty });
      return { status: "issued" };
    }

    if (action === "reject") {
      const reason = String(body?.reason || "Inventory rejected this request.").slice(0, 200);
      await this.prisma.partRequest.update({ where: { id }, data: { status: PartRequestStatus.REJECTED, rejectionReason: reason } });
      await this.audit(session, "inventory.request.rejected", "part_request", id, reason);
      await this.emitInventoryRequestOperation(session, request, "reject", "REJECTED", reason);
      return { status: "rejected" };
    }

    if (action === "unavailable") {
      await this.prisma.partRequest.update({ where: { id }, data: { status: PartRequestStatus.UNAVAILABLE } });
      await this.prisma.workOrder.update({
        where: { id: request.workOrderId },
        data: {
          status: WorkOrderStatus.WAITING_FOR_PARTS,
          statusLabel: "Waiting for Parts",
          customerVisible: true,
          customerSummary: "We are waiting for a required part. The branch will update you when it is available."
        }
      });
      await this.emitInventoryRequestOperation(session, request, "unavailable", "UNAVAILABLE", "Inventory marked the requested part unavailable.");
      return { status: "unavailable" };
    }

    if (action === "transfer") {
      const toWarehouseId = String(body?.toWarehouseId || request.warehouseId);
      await this.prisma.inventoryTransfer.create({
        data: {
          tenantId: request.tenantId,
          itemId: request.itemId,
          qty: request.qty,
          fromWarehouseId: String(body?.fromWarehouseId || request.warehouseId),
          toWarehouseId,
          reason: String(body?.reason || "Created from technician request."),
          linkedRequestId: request.id,
          workOrderId: request.workOrderId,
          createdBy: session.userId
        }
      });
      await this.prisma.partRequest.update({ where: { id }, data: { status: PartRequestStatus.WAITING_TRANSFER } });
      await this.emitInventoryRequestOperation(session, request, "transfer", "WAITING_TRANSFER", "Inventory created a warehouse transfer for this request.", { toWarehouseId });
      return { status: "waiting_transfer" };
    }

    if (action === "supplier") {
      await this.prisma.supplierOrder.create({
        data: {
          tenantId: request.tenantId,
          warehouseId: request.warehouseId,
          itemId: request.itemId,
          qty: request.qty,
          reason: String(body?.reason || "Created from unavailable technician request."),
          linkedRequestId: request.id,
          status: SupplierOrderStatus.PENDING_APPROVAL,
          createdBy: session.userId
        }
      });
      await this.prisma.partRequest.update({ where: { id }, data: { status: PartRequestStatus.WAITING_SUPPLIER } });
      await this.emitInventoryRequestOperation(session, request, "supplier", "WAITING_SUPPLIER", "Inventory created a supplier order for this request.");
      return { status: "waiting_supplier" };
    }

    throw new BadRequestException("Unsupported inventory request action.");
  }

  async createItem(session: RequestSessionContext, body: any): Promise<InventoryItemDto> {
    const required = ["name", "sku", "type", "catalogCategory", "subCategory", "warehouseId"];
    const missing = required.filter((field) => !String(body?.[field] || "").trim());
    if (missing.length) throw new BadRequestException(`Missing required fields: ${missing.join(", ")}`);
    if (!this.warehouseScope(session).includes(body.warehouseId)) throw new BadRequestException("Warehouse is outside inventory manager scope.");
    const stock = Math.max(0, Number(body.initialStock || body.stock || 0));
    const minStock = Math.max(0, Number(body.minStock || 0));
    const criticalStock = Math.max(0, Number(body.criticalStock || 0));
    const item = await this.prisma.inventoryItem.create({
      data: {
        tenantId: session.tenantId!,
        warehouseId: body.warehouseId,
        name: String(body.name).trim(),
        sku: String(body.sku).trim(),
        barcode: body.barcode || null,
        type: String(body.type).trim(),
        catalogCategory: String(body.catalogCategory).trim(),
        subCategory: String(body.subCategory).trim(),
        compatibleCategories: this.prismaCategories(body.compatibleCategories || ["Cars"]),
        imageUrl: body.imageUrl || null,
        stock,
        minStock,
        criticalStock,
        price: Number(body.price || 0),
        cost: Number(body.cost || 0),
        posVisible: Boolean(body.posVisible ?? true),
        workOrderUsable: Boolean(body.workOrderUsable ?? true),
        stockTracked: Boolean(body.stockTracked ?? true),
        supplierName: body.supplierName || null,
        notes: body.notes || null,
        status: stock <= 0 || stock <= criticalStock ? InventoryItemStatus.LOW_STOCK : InventoryItemStatus.ACTIVE
      },
      include: { warehouse: true }
    });
    await this.prisma.warehouseStockBalance.create({
      data: {
        tenantId: session.tenantId!,
        warehouseId: body.warehouseId,
        itemId: item.id,
        availableQty: stock,
        lowThreshold: minStock,
        criticalThreshold: criticalStock
      }
    });
    await this.prisma.stockMovement.create({
      data: {
        tenantId: session.tenantId!,
        warehouseId: body.warehouseId,
        itemId: item.id,
        type: StockMovementType.OPENING_BALANCE,
        qty: stock,
        beforeQty: 0,
        afterQty: stock,
        reason: "New inventory item created.",
        createdBy: session.userId
      }
    });
    return this.itemDto(item);
  }

  async itemAction(session: RequestSessionContext, id: string, body: any): Promise<InventoryItemDto> {
    const action = String(body?.action || "");
    const item = await this.prisma.inventoryItem.findFirst({
      where: { AND: [this.access.inventoryWhere(session), { id }] },
      include: { warehouse: true }
    });
    if (!item) throw new NotFoundException("Inventory item not found in inventory scope.");
    this.assertItemActionPermission(session, action);

    if (action === "update") {
      const data: any = {};
      const textFields = ["name", "sku", "barcode", "type", "catalogCategory", "subCategory", "imageUrl", "supplierName", "notes"];
      for (const field of textFields) {
        if (field in body) data[field] = body[field] ? String(body[field]).trim() : null;
      }
      if ("compatibleCategories" in body) data.compatibleCategories = this.prismaCategories(body.compatibleCategories || ["Cars"]);
      if ("minStock" in body) data.minStock = Math.max(0, Number(body.minStock || 0));
      if ("criticalStock" in body) data.criticalStock = Math.max(0, Number(body.criticalStock || 0));
      if ("price" in body) data.price = Number(body.price || 0);
      if ("cost" in body) data.cost = Number(body.cost || 0);
      if ("posVisible" in body) data.posVisible = Boolean(body.posVisible);
      if ("workOrderUsable" in body) data.workOrderUsable = Boolean(body.workOrderUsable);
      if ("stockTracked" in body) data.stockTracked = Boolean(body.stockTracked);
      if ("warehouseId" in body && body.warehouseId) {
        if (!this.warehouseScope(session).includes(body.warehouseId)) throw new BadRequestException("Warehouse is outside inventory manager scope.");
        data.warehouseId = String(body.warehouseId);
      }

      const updated = await this.prisma.inventoryItem.update({ where: { id }, data, include: { warehouse: true } });
      await this.prisma.warehouseStockBalance.upsert({
        where: { warehouseId_itemId: { warehouseId: updated.warehouseId, itemId: id } },
        create: {
          tenantId: item.tenantId,
          warehouseId: updated.warehouseId,
          itemId: id,
          availableQty: item.stock,
          lowThreshold: updated.minStock,
          criticalThreshold: updated.criticalStock
        },
        update: { lowThreshold: updated.minStock, criticalThreshold: updated.criticalStock }
      });
      await this.audit(session, "inventory.item.updated", "inventory_item", id, "Inventory catalog item updated.");
      return this.itemDto(updated);
    }

    if (action === "archive") {
      const updated = await this.prisma.inventoryItem.update({
        where: { id },
        data: { status: InventoryItemStatus.DISABLED, posVisible: false, workOrderUsable: false },
        include: { warehouse: true }
      });
      await this.audit(session, "inventory.item.archived", "inventory_item", id, "Inventory catalog item archived/disabled.");
      return this.itemDto(updated);
    }

    if (action === "toggle_pos") {
      const updated = await this.prisma.inventoryItem.update({
        where: { id },
        data: { posVisible: Boolean(body?.value) },
        include: { warehouse: true }
      });
      await this.audit(session, "inventory.item.pos_visibility_toggled", "inventory_item", id, `POS visibility set to ${updated.posVisible}.`);
      return this.itemDto(updated);
    }

    if (action === "toggle_work_order") {
      const updated = await this.prisma.inventoryItem.update({
        where: { id },
        data: { workOrderUsable: Boolean(body?.value) },
        include: { warehouse: true }
      });
      await this.audit(session, "inventory.item.work_order_usability_toggled", "inventory_item", id, `Work order usability set to ${updated.workOrderUsable}.`);
      return this.itemDto(updated);
    }

    if (action === "stock_adjust") {
      const requestedQty = Number(body?.qty || 0);
      if (!Number.isFinite(requestedQty) || requestedQty === 0) throw new BadRequestException("Stock adjustment quantity is required.");
      const nextStock = Math.max(0, item.stock + requestedQty);
      const appliedQty = nextStock - item.stock;
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.inventoryItem.update({
          where: { id },
          data: {
            stock: nextStock,
            status: this.statusForStock(nextStock, item.minStock, item.criticalStock)
          },
          include: { warehouse: true }
        });
        await tx.warehouseStockBalance.upsert({
          where: { warehouseId_itemId: { warehouseId: item.warehouseId, itemId: id } },
          create: {
            tenantId: item.tenantId,
            warehouseId: item.warehouseId,
            itemId: id,
            availableQty: nextStock,
            lowThreshold: item.minStock,
            criticalThreshold: item.criticalStock
          },
          update: { availableQty: nextStock, lowThreshold: item.minStock, criticalThreshold: item.criticalStock }
        });
        await tx.stockMovement.create({
          data: {
            tenantId: item.tenantId,
            warehouseId: item.warehouseId,
            itemId: id,
            type: StockMovementType.STOCK_ADJUSTMENT,
            qty: appliedQty,
            beforeQty: item.stock,
            afterQty: nextStock,
            reason: String(body?.reason || "Inventory Manager manual quantity adjustment.").slice(0, 200),
            createdBy: session.userId
          }
        });
        return row;
      });
      await this.audit(session, "inventory.stock.adjusted", "inventory_item", id, `Stock adjusted by ${appliedQty}.`);
      return this.itemDto(updated);
    }

    throw new BadRequestException("Unsupported inventory item action.");
  }

  async stockStatus(session: RequestSessionContext): Promise<InventoryStockStatusDto[]> {
    const rows = await this.prisma.inventoryItem.findMany({
      where: this.access.inventoryWhere(session),
      include: { warehouse: true, stockBalances: { include: { warehouse: true } } },
      orderBy: { name: "asc" }
    });
    return rows.map((item) => {
      const balances = item.stockBalances.length
        ? item.stockBalances
        : [{ warehouseId: item.warehouseId, warehouse: item.warehouse, availableQty: item.stock, issuedQty: 0, returnPendingQty: 0, damagedQty: 0 } as any];
      const totalAvailable = balances.reduce((sum, balance) => sum + balance.availableQty, 0);
      const issuedToTechnicians = balances.reduce((sum, balance) => sum + balance.issuedQty, 0);
      const waitingReturn = balances.reduce((sum, balance) => sum + balance.returnPendingQty, 0);
      const damaged = balances.reduce((sum, balance) => sum + balance.damagedQty, 0);
      return {
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        category: item.catalogCategory,
        subCategory: item.subCategory,
        compatibleCategories: item.compatibleCategories.map((code) => this.categoryLabel(code)),
        totalAvailable,
        issuedToTechnicians,
        waitingReturn,
        damaged,
        lowThreshold: item.minStock,
        criticalThreshold: item.criticalStock,
        status: totalAvailable <= 0 ? "out_of_stock" : totalAvailable <= item.criticalStock ? "critical" : totalAvailable <= item.minStock ? "low" : "healthy",
        warehouseBalances: balances.map((balance) => ({
          warehouseId: balance.warehouseId,
          warehouseName: balance.warehouse.name,
          available: balance.availableQty,
          issued: balance.issuedQty,
          returnPending: balance.returnPendingQty,
          damaged: balance.damagedQty
        }))
      };
    });
  }

  async movements(session: RequestSessionContext): Promise<InventoryMovementDto[]> {
    const rows = await this.prisma.stockMovement.findMany({
      where: { tenantId: session.tenantId, warehouseId: { in: this.warehouseScope(session) } },
      include: { item: true, warehouse: true },
      orderBy: { createdAt: "desc" },
      take: 80
    });
    return rows.map((row) => ({
      id: row.id,
      itemName: row.item.name,
      movementType: row.type.toLowerCase(),
      qty: row.qty,
      beforeQty: row.beforeQty ?? undefined,
      afterQty: row.afterQty ?? undefined,
      warehouseName: row.warehouse.name,
      workOrderNumber: row.source || undefined,
      reason: row.reason || undefined,
      createdAt: row.createdAt.toISOString()
    }));
  }

  async returns(session: RequestSessionContext): Promise<InventoryReturnRequestDto[]> {
    const rows = await this.prisma.partReturnRequest.findMany({
      where: { tenantId: session.tenantId, warehouseId: { in: this.warehouseScope(session) } },
      include: { item: true },
      orderBy: { updatedAt: "desc" }
    });
    const technicians = await this.staffNames(rows.map((row) => row.technicianId).filter(Boolean) as string[]);
    return rows.map((row) => ({
      id: row.id,
      technicianName: row.technicianId ? technicians.get(row.technicianId) : undefined,
      workOrderId: row.workOrderId,
      taskId: row.taskId || undefined,
      itemName: row.item.name,
      qty: row.qty,
      reason: row.reason,
      condition: row.condition,
      status: row.status.toLowerCase(),
      createdAt: row.createdAt.toISOString()
    }));
  }

  async returnAction(session: RequestSessionContext, id: string, body: any) {
    const action = String(body?.action || "");
    this.assertReturnActionPermission(session, action);
    const row = await this.prisma.partReturnRequest.findFirst({
      where: { id, tenantId: session.tenantId, warehouseId: { in: this.warehouseScope(session) } },
      include: { item: true, issuedItem: true }
    });
    if (!row) throw new NotFoundException("Return request not found in inventory scope.");
    const balance = await this.prisma.warehouseStockBalance.findUnique({
      where: { warehouseId_itemId: { warehouseId: row.warehouseId, itemId: row.itemId } }
    });
    const beforeAvailableQty = balance?.availableQty ?? row.item.stock;
    const beforeReturnPendingQty = balance?.returnPendingQty ?? 0;
    if (action === "accept_stock") {
      await this.prisma.$transaction(async (tx) => {
        await tx.partReturnRequest.update({ where: { id }, data: { status: ReturnRequestStatus.ACCEPTED_TO_STOCK, reviewedBy: session.userId, reviewedAt: new Date() } });
        await tx.issuedItem.update({ where: { id: row.issuedItemId }, data: { status: IssuedItemStatus.RETURNED } });
        await tx.partRequest.update({ where: { id: row.issuedItem.requestId }, data: { status: PartRequestStatus.RETURNED_TO_STOCK } });
        await tx.inventoryItem.update({ where: { id: row.itemId }, data: { stock: { increment: row.qty } } });
        await tx.warehouseStockBalance.upsert({
          where: { warehouseId_itemId: { warehouseId: row.warehouseId, itemId: row.itemId } },
          create: { tenantId: row.tenantId, warehouseId: row.warehouseId, itemId: row.itemId, availableQty: row.qty, lowThreshold: row.item.minStock, criticalThreshold: row.item.criticalStock },
          update: { availableQty: { increment: row.qty }, returnPendingQty: Math.max(0, beforeReturnPendingQty - row.qty) }
        });
        await tx.stockMovement.create({
          data: { tenantId: row.tenantId, warehouseId: row.warehouseId, itemId: row.itemId, type: StockMovementType.RETURNED_TO_STOCK, qty: row.qty, beforeQty: beforeAvailableQty, afterQty: beforeAvailableQty + row.qty, source: row.workOrderId, reason: row.reason, createdBy: session.userId }
        });
      });
      await this.audit(session, "part.return_accepted", "part_return_request", id, "Returned part accepted back to stock.");
      await this.emitInventoryReturnOperation(session, row, "accept_stock", "ACCEPTED_TO_STOCK", "Returned part accepted back to stock.");
      await this.finance.syncInventoryLine(session, {
        workOrderId: row.workOrderId,
        itemId: row.itemId,
        title: row.item.name,
        quantity: row.qty,
        unitPrice: Number(row.item.price),
        sourceId: row.issuedItemId,
        action: "returned"
      });
      return { status: "returned_to_stock" };
    }
    if (action === "accept_damaged") {
      await this.prisma.$transaction(async (tx) => {
        await tx.partReturnRequest.update({ where: { id }, data: { status: ReturnRequestStatus.ACCEPTED_DAMAGED, reviewedBy: session.userId, reviewedAt: new Date() } });
        await tx.issuedItem.update({ where: { id: row.issuedItemId }, data: { status: IssuedItemStatus.RETURNED } });
        await tx.partRequest.update({ where: { id: row.issuedItem.requestId }, data: { status: PartRequestStatus.RETURN_ACCEPTED } });
        await tx.warehouseStockBalance.upsert({
          where: { warehouseId_itemId: { warehouseId: row.warehouseId, itemId: row.itemId } },
          create: { tenantId: row.tenantId, warehouseId: row.warehouseId, itemId: row.itemId, damagedQty: row.qty, lowThreshold: row.item.minStock, criticalThreshold: row.item.criticalStock },
          update: { damagedQty: { increment: row.qty }, returnPendingQty: Math.max(0, beforeReturnPendingQty - row.qty) }
        });
        await tx.stockMovement.create({
          data: { tenantId: row.tenantId, warehouseId: row.warehouseId, itemId: row.itemId, type: StockMovementType.DAMAGED_RETURN, qty: row.qty, beforeQty: beforeAvailableQty, afterQty: beforeAvailableQty, source: row.workOrderId, reason: row.reason, createdBy: session.userId }
        });
      });
      await this.audit(session, "part.return_damaged", "part_return_request", id, "Returned part accepted as damaged.");
      await this.emitInventoryReturnOperation(session, row, "accept_damaged", "ACCEPTED_DAMAGED", "Returned part accepted as damaged.");
      return { status: "damaged" };
    }
    if (action === "reject") {
      await this.prisma.partReturnRequest.update({ where: { id }, data: { status: ReturnRequestStatus.REJECTED, reviewedBy: session.userId, reviewedAt: new Date() } });
      await this.prisma.partRequest.update({ where: { id: row.issuedItem.requestId }, data: { status: PartRequestStatus.RETURN_REJECTED } });
      await this.audit(session, "part.return_rejected", "part_return_request", id, "Returned part rejected by inventory.");
      await this.emitInventoryReturnOperation(session, row, "reject", "REJECTED", "Returned part rejected by inventory.");
      return { status: "rejected" };
    }
    throw new BadRequestException("Unsupported return action.");
  }

  async procurement(session: RequestSessionContext) {
    const warehouseIds = this.warehouseScope(session);
    const [transfers, supplierOrders] = await Promise.all([
      this.prisma.inventoryTransfer.findMany({ where: { tenantId: session.tenantId, OR: [{ fromWarehouseId: { in: warehouseIds } }, { toWarehouseId: { in: warehouseIds } }] }, include: { item: true, fromWarehouse: true, toWarehouse: true }, orderBy: { updatedAt: "desc" } }),
      this.prisma.supplierOrder.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } }, include: { item: true, warehouse: true }, orderBy: { updatedAt: "desc" } })
    ]);
    return { transfers, supplierOrders };
  }

  async reports(session: RequestSessionContext): Promise<InventoryReportsDto> {
    const warehouseIds = this.warehouseScope(session);
    const [items, movements, returns, requests, balances] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: this.access.inventoryWhere(session) }),
      this.prisma.stockMovement.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } } }),
      this.prisma.partReturnRequest.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } }, include: { item: true } }),
      this.prisma.partRequest.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } } }),
      this.prisma.warehouseStockBalance.findMany({ where: { tenantId: session.tenantId, warehouseId: { in: warehouseIds } } })
    ]);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const stockByItem = this.availableByItem(items, balances);
    const used = movements.filter((movement) => isOneOf(movement.type, StockMovementType.USED, StockMovementType.WORK_ORDER_CONSUMPTION));
    return {
      usageByItem: items.map((item) => ({
        itemName: item.name,
        category: item.catalogCategory,
        subCategory: item.subCategory,
        qtyUsed: used.filter((movement) => movement.itemId === item.id).reduce((sum, movement) => sum + Math.abs(movement.qty), 0),
        linkedWorkOrders: new Set(used.filter((movement) => movement.itemId === item.id).map((movement) => movement.source).filter(Boolean)).size
      })),
      stockRisk: items.filter((item) => stockByItem.get(item.id)! <= item.minStock).map((item) => ({
        itemName: item.name,
        currentStock: stockByItem.get(item.id)!,
        pendingRequests: requests.filter((request) => request.itemId === item.id && !isOneOf(request.status, PartRequestStatus.USED, PartRequestStatus.CANCELLED, PartRequestStatus.REJECTED)).length,
        risk: stockByItem.get(item.id)! <= 0 ? "out_of_stock" : stockByItem.get(item.id)! <= item.criticalStock ? "critical" : "low"
      })),
      returns: returns.map((row) => ({ itemName: row.item.name, returnedQty: row.qty, reason: row.reason, condition: row.condition })),
      technicianRequests: this.requestSummaryByTechnician(requests),
      categoryUsage: ["Cars", "Motorcycles", "Heavy Equipment"].map((category) => ({
        category: category as CategoryCode,
        qtyUsed: used.filter((movement) => itemMap.get(movement.itemId)?.compatibleCategories.includes(this.toPrismaCategory(category as CategoryCode))).reduce((sum, movement) => sum + Math.abs(movement.qty), 0),
        lowStockItems: items.filter((item) => item.compatibleCategories.includes(this.toPrismaCategory(category as CategoryCode)) && stockByItem.get(item.id)! <= item.minStock).length,
        returns: returns.filter((row) => row.item.compatibleCategories.includes(this.toPrismaCategory(category as CategoryCode))).length
      }))
    };
  }

  private itemDto(row: any): InventoryItemDto {
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode || undefined,
      type: row.type,
      category: row.catalogCategory,
      subCategory: row.subCategory,
      compatibleCategories: row.compatibleCategories.map((code: string) => this.categoryLabel(code)),
      imageUrl: row.imageUrl || undefined,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouse.name,
      stock: row.stock,
      minStock: row.minStock,
      criticalStock: row.criticalStock,
      status: row.status.toLowerCase(),
      price: Number(row.price),
      cost: Number(row.cost),
      posVisible: row.posVisible,
      workOrderUsable: row.workOrderUsable,
      stockTracked: row.stockTracked
    };
  }

  private async emitInventoryRequestOperation(session: RequestSessionContext, request: any, action: string, toStatus: string, reason: string, extra: Record<string, unknown> = {}) {
    const targets = this.inventoryTargets(action);
    await this.operationEvents.emitFromSession(session, {
      eventKey: this.inventoryRequestEventKey(action),
      tenantId: request.tenantId,
      branchId: request.workOrder?.branchId,
      warehouseId: String(extra.fulfillmentWarehouseId || request.warehouseId),
      workOrderId: request.workOrderId,
      taskId: request.taskId,
      customerId: request.workOrder?.customerId,
      assetId: request.workOrder?.assetId,
      statusChanges: [
        { entityType: "part_request", entityId: request.id, fromStatus: request.status, toStatus, label: `Inventory ${action}` },
        ...(action === "unavailable" ? [{ entityType: "work_order" as const, entityId: request.workOrderId, toStatus: "WAITING_FOR_PARTS", label: "Waiting for parts" }] : [])
      ],
      notificationTargets: targets,
      pageUpdates: this.inventoryPageUpdates(targets),
      reportHooks: this.inventoryReportHooks(action),
      auditAction: action === "issue" ? "part.issued" : `inventory.request.${action}`,
      canUndo: ["approve", "issue", "transfer", "supplier"].includes(action),
      customerSafeOutput: this.inventoryCustomerSafeOutput(request, action),
      payload: {
        request_id: request.id,
        item_id: request.itemId,
        item_name: request.item?.name,
        qty: extra.qty || request.qty,
        inventory_action: action,
        next_status: toStatus,
        who_needs_to_know: targets,
        reports_to_update: this.inventoryReportHooks(action).map((hook) => hook.reportKey),
        ...extra
      },
      reason,
      targetType: "part_request",
      targetId: request.id
    });
  }

  private async emitInventoryReturnOperation(session: RequestSessionContext, row: any, action: string, toStatus: string, reason: string) {
    const targets: OperationNotificationTarget[] = ["technician", "team_leader", "branch_manager", "reports_engine"];
    await this.operationEvents.emitFromSession(session, {
      eventKey: action === "accept_stock" || action === "accept_damaged" ? "part.return_accepted" : `inventory.return.${action}`,
      tenantId: row.tenantId,
      warehouseId: row.warehouseId,
      workOrderId: row.workOrderId,
      taskId: row.taskId,
      statusChanges: [
        { entityType: "return_request", entityId: row.id, fromStatus: row.status, toStatus, label: reason },
        { entityType: "part_request", entityId: row.issuedItem.requestId, toStatus: action === "reject" ? "RETURN_REJECTED" : action === "accept_stock" ? "RETURNED_TO_STOCK" : "RETURN_ACCEPTED", label: reason }
      ],
      notificationTargets: targets,
      pageUpdates: this.inventoryPageUpdates(targets),
      reportHooks: [{ reportKey: "reports.inventory.returns.view", metric: `return_${action}`, delta: 1, scope: ["warehouse", "branch"] }],
      auditAction: `inventory.return.${action}`,
      canUndo: action !== "reject",
      payload: {
        return_request_id: row.id,
        issued_item_id: row.issuedItemId,
        item_id: row.itemId,
        qty: row.qty,
        return_action: action,
        reports_to_update: ["reports.inventory.returns.view"]
      },
      reason,
      targetType: "part_return_request",
      targetId: row.id
    });
  }

  private inventoryTargets(action: string): OperationNotificationTarget[] {
    const targets: OperationNotificationTarget[] = ["technician", "branch_manager", "team_leader", "reports_engine"];
    if (["unavailable", "transfer", "supplier"].includes(action)) targets.push("customer");
    return targets;
  }

  private inventoryRequestEventKey(action: string) {
    const keys: Record<string, string> = {
      approve: "inventory.request.approve",
      issue: "part.issued",
      reject: "inventory.request.reject",
      unavailable: "inventory.request.unavailable",
      transfer: "inventory.request.transfer",
      supplier: "inventory.request.supplier"
    };
    return keys[action] || "inventory.request.updated";
  }

  private inventoryPageUpdates(targets: OperationNotificationTarget[]) {
    const pages = new Set<string>(["inventory-requests", "work-card"]);
    if (targets.includes("branch_manager")) pages.add("branch-workspace");
    if (targets.includes("team_leader")) pages.add("team-review");
    if (targets.includes("customer")) pages.add("customer");
    if (targets.includes("reports_engine")) {
      pages.add("inventory-reports");
      pages.add("analytics-inventory-customer");
      pages.add("analytics-operations");
    }
    return [...pages];
  }

  private inventoryReportHooks(action: string): OperationReportHookDto[] {
    const hooks: OperationReportHookDto[] = [{ reportKey: "reports.inventory.movements.view", metric: `request_${action}`, delta: 1, scope: ["warehouse", "branch"] }];
    if (action === "issue") hooks.push({ reportKey: "reports.inventory.consumption.view", metric: "issued_to_task", delta: 1, scope: ["warehouse", "category", "branch"] });
    if (["unavailable", "transfer", "supplier"].includes(action)) hooks.push({ reportKey: "reports.branch.delays.view", metric: `waiting_parts_${action}`, delta: 1, scope: ["branch"] });
    return hooks;
  }

  private inventoryCustomerSafeOutput(request: any, action: string) {
    if (!request.workOrder?.customerId || !["unavailable", "transfer", "supplier"].includes(action)) return undefined;
    const messages: Record<string, string> = {
      unavailable: "We are waiting for a required part. The branch will update you when it is available.",
      transfer: "A required part is being arranged from another stock location.",
      supplier: "A required part is being ordered from the supplier."
    };
    return {
      title: "Parts update",
      message: messages[action],
      source: `inventory.request.${action}`,
      customerId: request.workOrder.customerId,
      assetId: request.workOrder.assetId,
      workOrderId: request.workOrderId
    };
  }

  private warehouseScope(session: RequestSessionContext) {
    return session.warehouseScope.length ? session.warehouseScope : ["__deny_all__"];
  }

  private assertRequestActionPermission(session: RequestSessionContext, action: string) {
    const permissionByAction: Record<string, string> = {
      approve: "inventory.request.approve",
      issue: "inventory.request.issue",
      reject: "inventory.request.reject",
      unavailable: "inventory.request.reject",
      transfer: "inventory.transfer.create",
      supplier: "inventory.supplier_order.create"
    };
    this.access.assert(permissionByAction[action] || "inventory.requests.view", session);
  }

  private assertItemActionPermission(session: RequestSessionContext, action: string) {
    const permissionByAction: Record<string, string> = {
      update: "inventory.item.edit",
      archive: "inventory.item.archive",
      toggle_pos: "inventory.item.set_pos_visible",
      toggle_work_order: "inventory.item.set_work_order_usable",
      stock_adjust: "inventory.stock.adjust"
    };
    this.access.assert(permissionByAction[action] || "inventory.item.edit", session);
  }

  private assertReturnActionPermission(session: RequestSessionContext, action: string) {
    const permissionByAction: Record<string, string> = {
      accept_stock: "inventory.stock.return.accept",
      accept_damaged: "inventory.stock.return.damaged",
      reject: "inventory.stock.return.reject"
    };
    this.access.assert(permissionByAction[action] || "inventory.stock.return", session);
  }

  private async staffNames(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const rows = await this.prisma.staffUser.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private availability(stock: number, minStock: number, warehouses: Array<{ availableQty: number }>): InventoryTechnicianRequestDto["availability"] {
    if (stock > minStock) return "available";
    if (stock > 0) return "low";
    if (warehouses.some((warehouse) => warehouse.availableQty > 0)) return "available_other_warehouse";
    return "out_of_stock";
  }

  private requestStatus(status: PartRequestStatus) {
    return status.toLowerCase();
  }

  private availableByItem(items: Array<{ id: string; stock: number }>, balances: Array<{ itemId: string; availableQty: number }>) {
    const map = new Map<string, number>();
    for (const balance of balances) {
      map.set(balance.itemId, (map.get(balance.itemId) || 0) + balance.availableQty);
    }
    for (const item of items) {
      if (!map.has(item.id)) map.set(item.id, item.stock);
    }
    return map;
  }

  private requestSummaryByTechnician(requests: Array<{ technicianId: string | null; status: PartRequestStatus }>) {
    const map = new Map<string, { technicianName: string; requests: number; approved: number; rejected: number; unavailable: number; returned: number }>();
    for (const request of requests) {
      const key = request.technicianId || "unknown";
      const row = map.get(key) || { technicianName: key, requests: 0, approved: 0, rejected: 0, unavailable: 0, returned: 0 };
      row.requests += 1;
      if (isOneOf(request.status, PartRequestStatus.APPROVED, PartRequestStatus.ISSUED, PartRequestStatus.USED)) row.approved += 1;
      if (request.status === PartRequestStatus.REJECTED) row.rejected += 1;
      if (request.status === PartRequestStatus.UNAVAILABLE) row.unavailable += 1;
      if (isOneOf(request.status, PartRequestStatus.RETURN_REQUESTED, PartRequestStatus.RETURN_ACCEPTED, PartRequestStatus.RETURNED_TO_STOCK)) row.returned += 1;
      map.set(key, row);
    }
    return [...map.values()];
  }

  private async audit(session: RequestSessionContext, action: string, targetType: string, targetId: string, reason: string) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: session.userId,
        actorName: session.displayName,
        action,
        targetType,
        targetId,
        reason
      }
    });
  }

  private categoryLabel(code: string): CategoryCode {
    if (code === "MOTORCYCLES") return "Motorcycles";
    if (code === "HEAVY_EQUIPMENT") return "Heavy Equipment";
    return "Cars";
  }

  private toPrismaCategory(label: CategoryCode): PrismaCategoryCode {
    if (label === "Motorcycles") return PrismaCategoryCode.MOTORCYCLES;
    if (label === "Heavy Equipment") return PrismaCategoryCode.HEAVY_EQUIPMENT;
    return PrismaCategoryCode.CARS;
  }

  private prismaCategories(labels: string[]): PrismaCategoryCode[] {
    return labels.map((label) => this.toPrismaCategory(label as CategoryCode));
  }

  private statusForStock(stock: number, minStock: number, criticalStock: number): InventoryItemStatus {
    if (stock <= 0 || stock <= criticalStock || stock <= minStock) return InventoryItemStatus.LOW_STOCK;
    return InventoryItemStatus.ACTIVE;
  }

  private severityLabel(value: Severity): "normal" | "high" | "critical" {
    if (value === Severity.CRITICAL) return "critical";
    if (value === Severity.HIGH) return "high";
    return "normal";
  }
}

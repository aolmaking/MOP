import { ForbiddenException } from "@nestjs/common";
import { createSession } from "../../identity/access/test-support/session-fixture";
import { InventoryController } from "./inventory.controller";

function actor() {
  return { accountId: "inventory-1", displayName: "Inventory Manager", actorType: "TENANT_STAFF" as const };
}

function harness(allowed = true) {
  const view = {
    waiting: jest.fn(),
    stockTable: jest.fn(),
    item: jest.fn(),
    movements: jest.fn(),
  };
  const parts = {
    approve: jest.fn().mockResolvedValue({ id: "request-1", status: "APPROVED" }),
    reject: jest.fn().mockResolvedValue({ id: "request-1", status: "REJECTED" }),
    markUnavailable: jest.fn().mockResolvedValue({ id: "request-1", status: "UNAVAILABLE" }),
    issue: jest.fn().mockResolvedValue({ requested: 2, issued: 2, outstanding: 0 }),
    openReturns: jest.fn().mockResolvedValue([]),
    acceptReturn: jest.fn().mockResolvedValue({ id: "request-1", status: "RETURN_ACCEPTED" }),
    completeReturn: jest.fn().mockResolvedValue(undefined),
    rejectReturn: jest.fn().mockResolvedValue({ id: "request-1", status: "RETURN_REJECTED" }),
    requestClarification: jest.fn().mockResolvedValue({ id: "request-1", status: "RETURN_CLARIFICATION_REQUESTED" }),
  };
  const access = { can: jest.fn().mockResolvedValue(allowed) };
  const home = { build: jest.fn() };
  const catalog = { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn() };
  const reports = { build: jest.fn() };
  const warehouses = { deactivate: jest.fn(), reactivate: jest.fn() };
  const controller = new InventoryController(
    view as never,
    parts as never,
    access as never,
    home as never,
    catalog as never,
    reports as never,
    warehouses as never,
  );
  const session = createSession({
    tenantId: "tenant-1",
    accountId: "inventory-1",
    displayName: "Inventory Manager",
    role: "INVENTORY_MANAGER",
    warehouseScope: ["warehouse-1"],
  });

  return { controller, parts, access, warehouses, session };
}

describe("InventoryController tenant and warehouse boundaries", () => {
  it("passes the current tenant into part-request approvals", async () => {
    const { controller, parts, access, session } = harness();

    await controller.approve(session, "request-1");

    expect(access.can).toHaveBeenCalledWith(session, "inventory.request.approve");
    expect(parts.approve).toHaveBeenCalledWith("request-1", actor(), "tenant-1");
  });

  it("passes the current tenant into part issuing when the warehouse is in scope", async () => {
    const { controller, parts, session } = harness();

    await controller.issue(session, "request-1", { warehouseId: "warehouse-1", quantity: 2 });

    expect(parts.issue).toHaveBeenCalledWith(
      { partRequestId: "request-1", warehouseId: "warehouse-1", quantity: 2 },
      actor(),
      "tenant-1",
    );
  });

  it("refuses part issuing outside the inventory manager's warehouse scope", async () => {
    const { controller, parts, session } = harness();

    await expect(controller.issue(session, "request-1", { warehouseId: "warehouse-2", quantity: 1 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(parts.issue).not.toHaveBeenCalled();
  });

  it("passes the current tenant through both return-acceptance service calls", async () => {
    const { controller, parts, session } = harness();

    await controller.acceptReturn(session, "request-1", { warehouseId: "warehouse-1", quantity: 1, damaged: true });

    expect(parts.acceptReturn).toHaveBeenCalledWith("request-1", actor(), "tenant-1");
    expect(parts.completeReturn).toHaveBeenCalledWith(
      "request-1",
      "warehouse-1",
      1,
      actor(),
      { damaged: true },
      "tenant-1",
    );
  });

  it("refuses warehouse management outside the current warehouse scope", async () => {
    const { controller, warehouses, session } = harness();

    await expect(controller.deactivateWarehouse(session, "warehouse-2", { reason: "Temporarily closing this room" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(warehouses.deactivate).not.toHaveBeenCalled();
  });
});

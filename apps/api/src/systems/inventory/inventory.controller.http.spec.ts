import "reflect-metadata";
import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { SessionContext } from "@mop/shared";
import { ApiExceptionFilter } from "../../runtime/http/filters/api-exception.filter";
import { validationExceptionFactory } from "../../runtime/http/validation/validation-exception-factory";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { createSession } from "../../identity/access/test-support/session-fixture";
import { RequestWithSession, SessionGuard } from "../../identity/auth/session.guard";
import { CatalogService } from "./catalog.service";
import { InventoryController } from "./inventory.controller";
import { InventoryHomeService } from "./inventory-home.service";
import { InventoryReportsService } from "./inventory-reports.service";
import { InventoryViewService } from "./inventory-view.service";
import { PartRequestService } from "./part-request.service";
import { WarehouseService } from "./warehouse.service";

describe("InventoryController (HTTP route wiring)", () => {
  let app: INestApplication;
  let sessionForRequest: SessionContext | null;

  const view = {
    waiting: jest.fn().mockResolvedValue([]),
    stockTable: jest.fn().mockResolvedValue({ items: [] }),
    item: jest.fn().mockResolvedValue({ id: "item-1" }),
    movements: jest.fn().mockResolvedValue({ movements: [] }),
  };
  const parts = {
    approve: jest.fn().mockResolvedValue({ id: "request-1", status: "APPROVED" }),
    reject: jest.fn().mockResolvedValue({ id: "request-1", status: "REJECTED" }),
    markUnavailable: jest.fn().mockResolvedValue({ id: "request-1", status: "UNAVAILABLE" }),
    issue: jest.fn().mockResolvedValue({ requested: 2, issued: 2, outstanding: 0 }),
    openReturns: jest.fn().mockResolvedValue([]),
    acceptReturn: jest.fn().mockResolvedValue({ id: "return-1", status: "RETURN_ACCEPTED" }),
    completeReturn: jest.fn().mockResolvedValue(undefined),
    rejectReturn: jest.fn().mockResolvedValue({ id: "return-1", status: "RETURN_REJECTED" }),
    requestClarification: jest.fn().mockResolvedValue({ id: "return-1", status: "RETURN_CLARIFICATION_REQUESTED" }),
  };
  const access = { can: jest.fn().mockResolvedValue(true) };
  const home = { build: jest.fn().mockResolvedValue({ cards: [] }) };
  const catalog = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: "catalog-1" }),
    create: jest.fn().mockResolvedValue({ id: "catalog-1" }),
    update: jest.fn().mockResolvedValue({ id: "catalog-1" }),
  };
  const reports = { build: jest.fn().mockResolvedValue({ sections: [] }) };
  const warehouses = {
    deactivate: jest.fn().mockResolvedValue(undefined),
    reactivate: jest.fn().mockResolvedValue(undefined),
  };

  const sessionGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      if (!sessionForRequest) {
        throw new UnauthorizedException("Not authenticated");
      }
      context.switchToHttp().getRequest<RequestWithSession>().session = sessionForRequest;
      return true;
    },
  };

  const inventorySession = () =>
    createSession({
      tenantId: "tenant-1",
      accountId: "inventory-1",
      displayName: "Inventory Manager",
      role: "INVENTORY_MANAGER",
      warehouseScope: ["warehouse-1"],
    });

  const actor = { accountId: "inventory-1", displayName: "Inventory Manager", actorType: "TENANT_STAFF" as const };
  const warehouseActor = { accountId: "inventory-1", displayName: "Inventory Manager" };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryViewService, useValue: view },
        { provide: PartRequestService, useValue: parts },
        { provide: EffectiveAccessService, useValue: access },
        { provide: InventoryHomeService, useValue: home },
        { provide: CatalogService, useValue: catalog },
        { provide: InventoryReportsService, useValue: reports },
        { provide: WarehouseService, useValue: warehouses },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(sessionGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    sessionForRequest = inventorySession();
    access.can.mockReset().mockResolvedValue(true);
    for (const mock of [
      ...Object.values(view),
      ...Object.values(parts),
      ...Object.values(home),
      ...Object.values(catalog),
      ...Object.values(reports),
      ...Object.values(warehouses),
    ]) {
      mock.mockClear();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated stock issue requests before access or service calls", async () => {
    sessionForRequest = null;

    const res = await request(app.getHttpServer()).post("/api/v1/inventory/requests/request-1/issue").send({
      warehouseId: "warehouse-1",
      quantity: 2,
    });

    expect(res.status).toBe(401);
    expect(access.can).not.toHaveBeenCalled();
    expect(parts.issue).not.toHaveBeenCalled();
  });

  it("issues stock with the current tenant and warehouse-scoped actor over HTTP", async () => {
    const session = inventorySession();
    sessionForRequest = session;

    const res = await request(app.getHttpServer()).post("/api/v1/inventory/requests/request-1/issue").send({
      warehouseId: "warehouse-1",
      quantity: 2,
    });

    expect(res.status).toBe(201);
    expect(access.can).toHaveBeenCalledWith(session, "inventory.request.issue");
    expect(parts.issue).toHaveBeenCalledWith(
      { partRequestId: "request-1", warehouseId: "warehouse-1", quantity: 2 },
      actor,
      "tenant-1",
    );
    expect(res.body).toEqual({ requested: 2, issued: 2, outstanding: 0 });
  });

  it("refuses malformed stock issue quantities before PartRequestService is reached", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/inventory/requests/request-1/issue").send({
      warehouseId: "warehouse-1",
      quantity: 0,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_error");
    expect(parts.issue).not.toHaveBeenCalled();
  });

  it("refuses explicit stock movement outside the current warehouse scope", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/inventory/requests/request-1/issue").send({
      warehouseId: "warehouse-2",
      quantity: 1,
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("outside_warehouse_scope");
    expect(parts.issue).not.toHaveBeenCalled();
  });

  it("wires warehouse deactivation as a guarded 200-status command", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/inventory/warehouses/warehouse-1/deactivate").send({
      reason: "Closing this room for maintenance",
    });

    expect(res.status).toBe(200);
    expect(access.can).toHaveBeenCalledWith(sessionForRequest, "inventory.warehouse.manage");
    expect(warehouses.deactivate).toHaveBeenCalledWith(
      "tenant-1",
      "warehouse-1",
      warehouseActor,
      "Closing this room for maintenance",
    );
    expect(res.body).toEqual({ ok: true });
  });

  it("refuses warehouse commands without the documented operational reason", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/inventory/warehouses/warehouse-1/deactivate").send({
      reason: "short",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_error");
    expect(warehouses.deactivate).not.toHaveBeenCalled();
  });
});


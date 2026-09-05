import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import type { SessionContext } from "@mop/shared";
import type { ReportsOverviewService } from "./reports-overview.service";
import type { ReportsOperationsService } from "./reports-operations.service";
import type { ReportsFinancialService } from "./reports-financial.service";
import type { ReportsInventoryService } from "./reports-inventory.service";
import type { ReportsCustomersService } from "./reports-customers.service";
import type { EffectiveAccessService } from "../../identity/access/effective-access.service";

describe("ReportsController -- Security & Branch Isolation", () => {
  let controller: ReportsController;
  let mockOverview: jest.Mocked<Partial<ReportsOverviewService>>;
  let mockOperations: jest.Mocked<Partial<ReportsOperationsService>>;
  let mockFinancial: jest.Mocked<Partial<ReportsFinancialService>>;
  let mockInventory: jest.Mocked<Partial<ReportsInventoryService>>;
  let mockCustomers: jest.Mocked<Partial<ReportsCustomersService>>;
  let mockAccess: jest.Mocked<Partial<EffectiveAccessService>>;

  beforeEach(() => {
    mockOverview = { build: jest.fn().mockResolvedValue({} as any) };
    mockOperations = { build: jest.fn().mockResolvedValue({} as any) };
    mockFinancial = { build: jest.fn().mockResolvedValue({} as any) };
    mockInventory = { build: jest.fn().mockResolvedValue({} as any) };
    mockCustomers = { build: jest.fn().mockResolvedValue({} as any) };
    mockAccess = { can: jest.fn().mockResolvedValue(true) };

    controller = new ReportsController(
      mockOverview as ReportsOverviewService,
      mockOperations as ReportsOperationsService,
      mockFinancial as ReportsFinancialService,
      mockInventory as ReportsInventoryService,
      mockCustomers as ReportsCustomersService,
      mockAccess as EffectiveAccessService,
    );
  });

  it("throws ForbiddenException when session lacks reports.owner.view", async () => {
    mockAccess.can = jest.fn().mockResolvedValue(false);
    const session = { tenantId: "t-1", branchScope: [] } as unknown as SessionContext;

    await expect(controller.getFinancial(session)).rejects.toThrow(ForbiddenException);
  });

  it("throws ForbiddenException when session lacks tenantId", async () => {
    const session = { tenantId: null, branchScope: [] } as unknown as SessionContext;

    await expect(controller.getFinancial(session)).rejects.toThrow(ForbiddenException);
  });

  it("allows full access when branchScope is empty", async () => {
    const session = { tenantId: "t-1", branchScope: [] } as unknown as SessionContext;

    await controller.getFinancial(session, "2026-01-01", "2026-01-31", "branch-a");

    expect(mockFinancial.build).toHaveBeenCalledWith("t-1", {
      from: "2026-01-01",
      to: "2026-01-31",
      branchId: "branch-a",
      groupBy: undefined,
    });
  });

  it("allows access when requested branch is inside session branchScope", async () => {
    const session = { tenantId: "t-1", branchScope: ["branch-a", "branch-b"] } as unknown as SessionContext;

    await controller.getFinancial(session, "2026-01-01", "2026-01-31", "branch-a");

    expect(mockFinancial.build).toHaveBeenCalledWith("t-1", {
      from: "2026-01-01",
      to: "2026-01-31",
      branchId: "branch-a",
      groupBy: undefined,
    });
  });

  it("forbids access when requested branch is outside session branchScope", async () => {
    const session = { tenantId: "t-1", branchScope: ["branch-a"] } as unknown as SessionContext;

    await expect(controller.getFinancial(session, "2026-01-01", "2026-01-31", "branch-c")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("automatically pins to the single branch in scope when none is requested", async () => {
    const session = { tenantId: "t-1", branchScope: ["branch-only"] } as unknown as SessionContext;

    await controller.getFinancial(session, "2026-01-01", "2026-01-31");

    expect(mockFinancial.build).toHaveBeenCalledWith("t-1", {
      from: "2026-01-01",
      to: "2026-01-31",
      branchId: "branch-only",
      groupBy: undefined,
    });
  });

  it("requires explicit branch selection when user has multiple branches in scope but passes none", async () => {
    const session = { tenantId: "t-1", branchScope: ["branch-1", "branch-2"] } as unknown as SessionContext;

    await expect(controller.getFinancial(session, "2026-01-01", "2026-01-31")).rejects.toThrow(ForbiddenException);
  });

  it("wraps date range errors in BadRequestException", async () => {
    const session = { tenantId: "t-1", branchScope: [] } as unknown as SessionContext;
    mockFinancial.build = jest.fn().mockRejectedValue(new Error("date_range_reversed"));

    await expect(controller.getFinancial(session, "2026-02-01", "2026-01-01")).rejects.toThrow(BadRequestException);
  });
});

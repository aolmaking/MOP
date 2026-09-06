import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { ReportsController } from "./reports.controller";
import type { ReportsOverviewService } from "./reports-overview.service";
import type { ReportsOperationsService } from "./reports-operations.service";
import type { ReportsFinancialService } from "./reports-financial.service";
import type { ReportsInventoryService } from "./reports-inventory.service";
import type { ReportsCustomersService } from "./reports-customers.service";
import type { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { AnalyticsController } from "../analytics/analytics.controller";
import type { AnalyticsHomeService } from "../analytics/analytics-home.service";
import type { OperationsAnalyticsService } from "../analytics/operations-analytics.service";
import type { PeopleAnalyticsService } from "../analytics/people-analytics.service";
import type { InventoryAnalyticsService } from "../analytics/inventory-analytics.service";
import type { DecisionsAnalyticsService } from "../analytics/decisions-analytics.service";
import type { FeatureAdoptionAnalyticsService } from "../analytics/feature-adoption-analytics.service";
import type { AnalystSavedViewsService } from "../analytics/saved-views.service";
import type { AnalyticsExportService } from "../analytics/analytics-export.service";
import { reportToCsv } from "../analytics/csv.util";
import { resolveScope, workOrderScopeFilter } from "../analytics/analytics-scope.util";

describe("Prompt 5: Reporting & Analytics Delivery Integrity", () => {
  describe("ReportsController Delivery Contract", () => {
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

    it("preserves date range and branch scope across all 5 owner reporting surfaces", async () => {
      const session = { tenantId: "tenant-abc", branchScope: [] } as unknown as SessionContext;

      await controller.getOverview(session, "2026-01-01", "2026-01-31", "branch-1");
      expect(mockOverview.build).toHaveBeenCalledWith("tenant-abc", {
        from: "2026-01-01",
        to: "2026-01-31",
        branchId: "branch-1",
      });

      await controller.getOperations(session, "2026-01-01", "2026-01-31", "branch-1", "week");
      expect(mockOperations.build).toHaveBeenCalledWith("tenant-abc", {
        from: "2026-01-01",
        to: "2026-01-31",
        branchId: "branch-1",
        groupBy: "week",
      });

      await controller.getFinancial(session, "2026-01-01", "2026-01-31", "branch-1", "month");
      expect(mockFinancial.build).toHaveBeenCalledWith("tenant-abc", {
        from: "2026-01-01",
        to: "2026-01-31",
        branchId: "branch-1",
        groupBy: "month",
      });

      await controller.getInventory(session, "2026-01-01", "2026-01-31", "branch-1");
      expect(mockInventory.build).toHaveBeenCalledWith("tenant-abc", {
        from: "2026-01-01",
        to: "2026-01-31",
        branchId: "branch-1",
      });

      await controller.getCustomers(session, "2026-01-01", "2026-01-31", "branch-1");
      expect(mockCustomers.build).toHaveBeenCalledWith("tenant-abc", {
        from: "2026-01-01",
        to: "2026-01-31",
        branchId: "branch-1",
      });
    });

    it("allows multi-branch scoped session to access inventory & customers with explicit branch selection", async () => {
      const session = { tenantId: "tenant-abc", branchScope: ["branch-1", "branch-2"] } as unknown as SessionContext;

      await controller.getInventory(session, "2026-01-01", "2026-01-31", "branch-2");
      expect(mockInventory.build).toHaveBeenCalledWith("tenant-abc", {
        from: "2026-01-01",
        to: "2026-01-31",
        branchId: "branch-2",
      });

      await controller.getCustomers(session, "2026-01-01", "2026-01-31", "branch-1");
      expect(mockCustomers.build).toHaveBeenCalledWith("tenant-abc", {
        from: "2026-01-01",
        to: "2026-01-31",
        branchId: "branch-1",
      });
    });

    it("rejects multi-branch scoped session accessing inventory without explicit branch", async () => {
      const session = { tenantId: "tenant-abc", branchScope: ["branch-1", "branch-2"] } as unknown as SessionContext;

      await expect(controller.getInventory(session, "2026-01-01", "2026-01-31")).rejects.toThrow(ForbiddenException);
    });

    it("rejects multi-branch scoped session passing an unauthorized branch", async () => {
      const session = { tenantId: "tenant-abc", branchScope: ["branch-1", "branch-2"] } as unknown as SessionContext;

      await expect(controller.getOperations(session, "2026-01-01", "2026-01-31", "branch-rogue")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("translates invalid or reversed date range exceptions into BadRequestException", async () => {
      const session = { tenantId: "tenant-abc", branchScope: [] } as unknown as SessionContext;
      mockFinancial.build = jest.fn().mockRejectedValue(new Error("date_range_reversed"));

      await expect(controller.getFinancial(session, "2026-02-01", "2026-01-01")).rejects.toThrow(BadRequestException);
    });
  });

  describe("Analytics Scope & Export Integrity", () => {
    it("resolveScope correctly maps branch vs company-wide sessions and produces correct Prisma scope filters", () => {
      const companySession = { tenantId: "t-1", branchScope: [], categoryScope: [] } as unknown as SessionContext;
      const companyScope = resolveScope(companySession as any);
      expect(companyScope).toEqual({ branchIds: [], categoryIds: [] });
      expect(workOrderScopeFilter(companyScope)).toEqual({});

      const scopedSession = { tenantId: "t-1", branchScope: ["branch-alpha"], categoryScope: [] } as unknown as SessionContext;
      const scoped = resolveScope(scopedSession as any);
      expect(scoped).toEqual({ branchIds: ["branch-alpha"], categoryIds: [] });
      expect(workOrderScopeFilter(scoped)).toEqual({ branchId: { in: ["branch-alpha"] } });
    });

    it("reportToCsv preserves null vs zero vs empty semantics faithfully", () => {
      const testReport = {
        summaryFieldString: "Normal text",
        measuredZero: 0,
        uncomputableDuration: null,
        emptyList: [],
        tableSection: [
          {
            technicianName: "Alex Smith",
            tasksCompleted: 15,
            measuredReworkCount: 0,
            averageDurationHours: null,
          },
          {
            technicianName: "Jordan Lee",
            tasksCompleted: 0,
            measuredReworkCount: 2,
            averageDurationHours: 3.5,
          },
        ],
      };

      const csv = reportToCsv(testReport);

      // Null values must serialize as empty strings, never converted to 0
      expect(csv).toContain("uncomputableDuration,");
      expect(csv).not.toContain("uncomputableDuration,0");

      // Measured zeros must serialize as 0
      expect(csv).toContain("measuredZero,0");

      // Table section must preserve row fields
      expect(csv).toContain("Alex Smith,15,0,");
      expect(csv).toContain("Jordan Lee,0,2,3.5");
    });

    it("AnalyticsController.exportCsv passes all query filters to export service", async () => {
      const mockHome = {} as any;
      const mockOperations = {} as any;
      const mockPeople = {} as any;
      const mockInventory = {} as any;
      const mockDecisions = {} as any;
      const mockQuality = {} as any;
      const mockRootCause = {} as any;
      const mockDrillDown = {} as any;
      const mockFeatureAdoption = {} as any;
      const mockSavedViews = {} as any;
      const mockExportService: jest.Mocked<Partial<AnalyticsExportService>> = {
        export: jest.fn().mockResolvedValue({
          filename: "operations-2026-01-31.csv",
          csv: "Summary\nfield,value",
        }),
      };
      const mockAccess: jest.Mocked<Partial<EffectiveAccessService>> = {
        can: jest.fn().mockResolvedValue(true),
      };

      const controller = new AnalyticsController(
        mockHome,
        mockOperations,
        mockPeople,
        mockInventory,
        mockDecisions,
        mockQuality,
        mockRootCause,
        mockDrillDown,
        mockFeatureAdoption,
        mockSavedViews,
        mockExportService as AnalyticsExportService,
        mockAccess as EffectiveAccessService,
      );

      const session = { tenantId: "tenant-xyz", accountId: "acc-1", displayName: "Analyst" } as unknown as SessionContext;
      const mockRes: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportCsv(session, "OPERATIONS", mockRes, "2026-01-01", "2026-01-31", "month");

      expect(mockExportService.export).toHaveBeenCalledWith(
        "tenant-xyz",
        session,
        "OPERATIONS",
        true,
        {
          from: "2026-01-01",
          to: "2026-01-31",
          groupBy: "month",
        },
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
      expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="operations-2026-01-31.csv"');
      expect(mockRes.send).toHaveBeenCalledWith("Summary\nfield,value");
    });
  });
});

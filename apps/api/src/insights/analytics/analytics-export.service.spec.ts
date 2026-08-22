import { ForbiddenException } from "@nestjs/common";
import { AnalyticsExportService } from "./analytics-export.service";

function serviceWith(overrides: {
  allowedExports?: readonly string[];
  operationsReport?: unknown;
}) {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ plan: { allowedExports: overrides.allowedExports ?? ["OPERATIONS"] } }),
    },
  };
  const operations = {
    build: jest.fn().mockResolvedValue(
      overrides.operationsReport ?? {
        volume: [{ bucket: "2026-08-22T00:00:00.000Z", created: 2, completed: 1 }],
        statusDistribution: [{ status: "IN_PROGRESS", count: 2 }],
        timeInStatus: [{ status: "WAITING_PARTS", averageHours: 4.5 }],
        branchComparison: [{ branchName: "Main", created: 2, completed: 1 }],
        blockers: [{ reason: "Parts, supplier", count: 1 }],
        deliveryFunnel: { reachedReadyForDelivery: 3, reachedClosed: 2, averageGapHours: 1.25 },
      },
    ),
  };
  const service = new AnalyticsExportService(
    prisma as never,
    operations as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, operations };
}

describe("AnalyticsExportService", () => {
  it("builds CSV from the requested analytics service and preserves the request filters", async () => {
    const { service, operations } = serviceWith({});
    const scope = { branchIds: ["branch1"], categoryIds: ["CARS"] };
    const params = { from: "2026-08-01", to: "2026-08-22", groupBy: "day" };

    const result = await service.buildCsv("tenant1", scope, "OPERATIONS", params, false);

    expect(result.filename).toBe("mop-operations-analytics.csv");
    expect(result.content).toContain("section,item,metric,value");
    expect(result.content).toContain("volume,2026-08-22T00:00:00.000Z,created,2");
    expect(result.content).toContain('blockers,"Parts, supplier",count,1');
    expect(operations.build).toHaveBeenCalledWith("tenant1", scope, params);
  });

  it("refuses a report category not included in the plan's Allowed Exports list", async () => {
    const { service, operations } = serviceWith({ allowedExports: ["PEOPLE"] });

    await expect(service.buildCsv("tenant1", { branchIds: [], categoryIds: [] }, "OPERATIONS", {}, false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(operations.build).not.toHaveBeenCalled();
  });
});

import { AnalyticsHomeService } from "./analytics-home.service";

describe("AnalyticsHomeService", () => {
  it("composes one tile per analytical page, including Feature Adoption", async () => {
    const operations = {
      build: jest.fn().mockResolvedValue({
        volume: [
          { bucket: "2026-08-21T00:00:00.000Z", created: 3, completed: 1 },
          { bucket: "2026-08-22T00:00:00.000Z", created: 2, completed: 4 },
        ],
      }),
    };
    const people = {
      build: jest.fn().mockResolvedValue({
        technicians: [
          { tasksCompleted: 2 },
          { tasksCompleted: 5 },
        ],
      }),
    };
    const inventory = {
      build: jest.fn().mockResolvedValue({
        operational: {
          usage: [{ itemId: "oil" }, { itemId: "filter" }],
          stockRisk: [{ itemId: "brake-pad" }],
        },
      }),
    };
    const decisions = {
      build: jest.fn().mockResolvedValue({
        approvalRate: 75,
        criticalRejections: 2,
      }),
    };
    const featureAdoption = {
      build: jest.fn().mockResolvedValue({
        features: [
          { feature: "Quick Inspection", usageCount: 12, zeroUsage: false },
          { feature: "Customer Decision Request", usageCount: 0, zeroUsage: true },
        ],
      }),
    };
    const service = new AnalyticsHomeService(
      operations as never,
      people as never,
      inventory as never,
      decisions as never,
      featureAdoption as never,
    );
    const scope = { branchIds: ["branch1"], categoryIds: ["CARS"] };
    const params = { from: "2026-08-01", to: "2026-08-22" };

    await expect(service.build("tenant1", scope, params)).resolves.toEqual({
      tiles: [
        {
          page: "operations",
          label: "Operations",
          metrics: [
            { label: "Created", value: "5" },
            { label: "Completed", value: "5" },
          ],
        },
        {
          page: "people",
          label: "Technician & Team",
          metrics: [
            { label: "Technicians tracked", value: "2" },
            { label: "Total tasks completed", value: "7" },
          ],
        },
        {
          page: "inventory",
          label: "Inventory",
          metrics: [
            { label: "Items tracked", value: "2" },
            { label: "At risk", value: "1" },
          ],
        },
        {
          page: "decisions",
          label: "Customer Decisions",
          metrics: [
            { label: "Approval rate", value: "75%" },
            { label: "Critical rejections", value: "2" },
          ],
        },
        {
          page: "feature-adoption",
          label: "Feature Adoption",
          metrics: [
            { label: "Trackable features", value: "2" },
            { label: "Enabled with zero usage", value: "1" },
          ],
        },
      ],
    });
    expect(featureAdoption.build).toHaveBeenCalledWith("tenant1", params);
    expect(inventory.build).toHaveBeenCalledWith("tenant1", scope, false);
  });
});

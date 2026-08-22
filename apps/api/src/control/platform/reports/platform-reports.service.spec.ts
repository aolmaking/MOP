import { PlatformReportsService } from "./platform-reports.service";
import { WorkshopHealthService } from "../workshops/workshop-health.service";
import type { PrismaService } from "../../../runtime/database/prisma.service";
import type { WorkshopsService } from "../workshops/workshops.service";

const now = new Date();
const recent = new Date(now.getTime() - 60_000);

function prismaMock(): PrismaService {
  const tenant = {
    id: "tenant-1",
    name: "Apex Motors",
    status: "ACTIVE",
    currency: "EGP",
    plan: { name: "Growth" },
  };

  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenant),
      count: jest.fn().mockResolvedValue(1),
    },
    session: {
      findMany: jest.fn((args: { where?: { account?: { accountType?: string } }; select?: object }) => {
        if (args.where?.account?.accountType === "CUSTOMER") return Promise.resolve([{ accountId: "customer-account" }]);
        if (args.where?.account?.accountType === "TENANT_STAFF") return Promise.resolve([{ accountId: "owner-account" }]);
        if (args.select && "createdAt" in args.select) return Promise.resolve([{ createdAt: recent }]);
        return Promise.resolve([]);
      }),
      findFirst: jest.fn().mockResolvedValue({ createdAt: recent }),
    },
    staffUser: {
      findFirst: jest.fn().mockResolvedValue({
        id: "owner-staff",
        accountId: "owner-account",
        role: "TENANT_OWNER",
        account: { failedLoginCount: 0 },
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: "owner-staff", fullName: "Owner Person", role: "TENANT_OWNER", accountId: "owner-account" },
        { id: "manager-staff", fullName: "Manager Person", role: "BRANCH_MANAGER", accountId: "manager-account" },
      ]),
      count: jest.fn().mockResolvedValue(2),
    },
    customerDecisionRequest: {
      findMany: jest.fn().mockResolvedValue([{ status: "RESOLVED" }, { status: "PENDING" }]),
      count: jest.fn().mockResolvedValue(2),
    },
    tenantCapability: {
      findMany: jest.fn().mockResolvedValue([{ capabilityKey: "INVENTORY", status: "DISABLED" }]),
    },
    task: {
      count: jest.fn((args: { where?: { status?: unknown } }) => {
        if (args.where?.status === "DONE") return Promise.resolve(4);
        return Promise.resolve(3);
      }),
    },
    partRequest: { count: jest.fn().mockResolvedValue(5) },
    issuedItem: { count: jest.fn().mockResolvedValue(2) },
    partReturnRequest: { count: jest.fn().mockResolvedValue(1) },
    inspection: { count: jest.fn().mockResolvedValue(6) },
    workOrder: {
      count: jest.fn((args: { where?: { inspectionDeclined?: boolean; status?: string } }) => {
        if (args.where?.inspectionDeclined) return Promise.resolve(2);
        if (args.where?.status === "CLOSED") return Promise.resolve(7);
        if (args.where?.status === "WAITING_CUSTOMER") return Promise.resolve(1);
        if (args.where?.status === "WAITING_PARTS") return Promise.resolve(2);
        return Promise.resolve(10);
      }),
    },
    auditLog: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn((args: { distinct?: string[]; where?: { riskLevel?: unknown; action?: { in?: string[] } } }) => {
        if (args.distinct?.includes("actorId")) return Promise.resolve([{ actorId: "owner-account" }]);
        if (args.where?.riskLevel) {
          return Promise.resolve([{ id: "audit-1", action: "capability.changed", createdAt: recent, riskLevel: "HIGH" }]);
        }
        if (args.where?.action?.in?.includes("platform.workshop.frozen")) return Promise.resolve([]);
        return Promise.resolve([{ actorId: "owner-account", action: "workorder.status.changed", createdAt: recent }]);
      }),
    },
    analystSavedView: { count: jest.fn().mockResolvedValue(1) },
    supervisionNote: { count: jest.fn().mockResolvedValue(1) },
    payment: {
      count: jest.fn().mockResolvedValue(2),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: { toString: () => "123.45" } } }),
    },
    invoice: { count: jest.fn().mockResolvedValue(3) },
    tenantConfiguration: {
      findUnique: jest.fn().mockResolvedValue({ theme: { brand: "red" }, pageLayouts: { dashboard: {} } }),
    },
    customFieldDefinition: { count: jest.fn().mockResolvedValue(2) },
    messageTemplate: { findMany: jest.fn().mockResolvedValue([{ templateKey: "REMINDER" }]) },
    tenantConfigurationVersion: {
      findFirst: jest.fn().mockResolvedValue({ publishedAt: recent, publishedById: "platform-admin", version: 2 }),
    },
    taskBlocker: { count: jest.fn().mockResolvedValue(1) },
    stockMovement: { groupBy: jest.fn().mockResolvedValue([{ type: "ISSUE", _count: 4 }]) },
    customer: {
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

describe("PlatformReportsService.detail", () => {
  it("builds all six sections from backed rows and keeps platform billing placeholders explicit", async () => {
    const service = new PlatformReportsService(prismaMock(), {} as WorkshopsService, new WorkshopHealthService());

    const result = await service.detail("tenant-1", 30);

    expect(result.workshop.name).toBe("Apex Motors");
    expect(result.usageOverview.customerPortal.decisionResponseRate).toBe(50);
    expect(result.featureUsage.rows.find((row) => row.key === "inventory_requests")).toEqual(
      expect.objectContaining({ enabled: false, adoptionSignal: "DISABLED" }),
    );
    expect(result.builderAdoption.adoptionPercent).toBeGreaterThan(0);
    expect(result.operationalActivity.paymentsRecorded).toEqual({ count: 2, totalAmount: 123.45, currency: "EGP" });
    expect(result.commercialSnapshot.overdueAmount).toBeNull();
    expect(result.healthRisk.lowStaffUsageCount).toBe(1);
  });
});

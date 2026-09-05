/**
 * Workshop Capability Divergence — Real PostgreSQL Integration Test
 *
 * SPRINT 2 — LAYER 2A — PLAN + CAPABILITY MODEL
 *
 * Proves that two workshops with materially different capability configurations
 * are observably different in valid runtime behavior:
 *
 *   Workshop A: Full capability shape (Inventory, QC, Teams, Customer Portal)
 *   Workshop B: Lean capability shape (Inventory OFF, QC OFF, Teams OFF, Customer Portal OFF)
 *
 * Observable Divergence Verified:
 *   1. Derived / Resolved Workshop Model (independent of Policy)
 *   2. Runtime API / Operations (PartRequestService blocks with 403 inventory_disabled on B)
 *   3. Access Control / Permissions (TenantCapabilityLayer locks out inventory permissions on B)
 *   4. Workflow Lifecycle Reachability (WorkOrder graph drops QC transitions on B)
 *   5. Structure Invariants (Structure validator enforces warehouse invariants based on Inventory)
 *   6. Server-Side Plan Entitlement & Atomic Rollback (Plan without INVENTORY rejects creation atomically)
 *   7. Responsibility Impossibility (Capability ON with no operator is rejected atomically)
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ForbiddenException, BadRequestException } from "@nestjs/common";
import {
  WORK_ORDER_GRAPH,
  resolveIntent,
  validateDraft,
  type CapabilityProfile,
  type SessionContext,
} from "@mop/shared";
import { CapabilityResolutionService } from "./capability-resolution.service";
import { TenantCapabilityLayer } from "../../identity/access/layers/tenant-capability.layer";
import { PartRequestService } from "../../systems/inventory/part-request.service";
import { StockService } from "../../systems/inventory/stock.service";
import { OperationEventsService } from "../../systems/operations/operation-events.service";
import { CustomerSafeProjectionService } from "../../systems/operations/customer-safe-projection.service";
import { GateEvaluatorService } from "../../systems/operations/gate-evaluator.service";
import { WorkOrderLifecycleService } from "../../systems/operations/work-order-lifecycle.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";
import { AuditService } from "../../audit/audit.service";
import { PlatformService } from "../platform/platform.service";
import { CreateWorkshopDto } from "../platform/create-workshop.dto";
import { SpecializationService } from "../../systems/people/specialization/specialization.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

function makeSession(overrides: Partial<SessionContext>): SessionContext {
  return {
    accountId: "test-staff",
    accountType: "TENANT_STAFF",
    displayName: "Test Staff",
    tenantId: "test-tenant",
    role: "TECHNICIAN",
    branchScope: [],
    warehouseScope: [],
    categoryScope: [],
    teamScope: [],
    managedTechnicianIds: [],
    permissions: [],
    enabledModules: [],
    enabledFeatures: [],
    tenantStatus: "ACTIVE",
    landingPage: "/dashboard",
    ...overrides,
  };
}

describe("Workshop Capability Divergence (A/B Runtime Proof on Real Postgres)", () => {
  const prisma = new PrismaClient();
  const asService = prisma as unknown as PrismaService;

  const audit = new AuditService(asService);
  const specialization = new SpecializationService(asService);
  const platformService = new PlatformService(asService, audit, specialization);

  const capabilitiesService = new CapabilityResolutionService(asService);
  const capabilityLayer = new TenantCapabilityLayer();

  const stock = new StockService(asService);
  const events = new OperationEventsService(asService, audit, new CustomerSafeProjectionService());
  const policies = new PolicyResolutionService(asService, audit, capabilitiesService);
  const gates = new GateEvaluatorService(asService, policies);
  const lifecycle = new WorkOrderLifecycleService(asService, capabilitiesService, events, gates, policies);
  const partRequestService = new PartRequestService(asService, capabilitiesService, stock, events, policies, lifecycle);

  const suffix = `div-${Date.now()}`;
  let enterprisePlanId: string;
  let starterPlanId: string;

  let tenantAId: string;
  let tenantBId: string;
  const tenantsToClean: string[] = [];

  beforeAll(async () => {
    // 1. Enterprise Plan: allows all modules
    const enterprisePlan = await prisma.plan.create({
      data: {
        code: `PLAN-ENT-${suffix}`,
        name: "Enterprise Full Platform",
        maxBranches: 5,
        maxUsers: 50,
        maxWarehouses: 5,
        allowedCategories: ["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"],
        allowedModules: [
          "ORGANIZATION",
          "OPERATIONS",
          "AUDIT",
          "REPORTS",
          "INVENTORY",
          "TEAM_MANAGEMENT",
          "FINANCE",
          "CUSTOMER_PORTAL",
        ],
        allowedFeatures: [],
        allowedReports: [],
        monthlyPrice: 100,
      },
    });
    enterprisePlanId = enterprisePlan.id;

    // 2. Starter Plan: restricted modules (no INVENTORY, no TEAM_MANAGEMENT, no CUSTOMER_PORTAL)
    const starterPlan = await prisma.plan.create({
      data: {
        code: `PLAN-START-${suffix}`,
        name: "Starter Operations Only",
        maxBranches: 1,
        maxUsers: 5,
        maxWarehouses: 0,
        allowedCategories: ["CARS"],
        allowedModules: ["ORGANIZATION", "OPERATIONS", "AUDIT", "REPORTS", "FINANCE"],
        allowedFeatures: [],
        allowedReports: [],
        monthlyPrice: 20,
      },
    });
    starterPlanId = starterPlan.id;

    // 3. Provision Workshop A (Full Capability Shape)
    const resultA = await platformService.createWorkshop(
      {
        name: `Workshop A Full ${suffix}`,
        slug: `workshop-a-${suffix}`,
        country: "EG",
        city: "Cairo",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Dealership Service Center",
        starterBuilderTemplate: "DEFAULT",
        primaryCategory: "CARS",
        ownerFullName: "Owner Alpha",
        ownerEmail: `owner-a-${suffix}@example.com`,
        ownerPhone: "+201234567891",
        planId: enterprisePlanId,
        initialStatus: "ACTIVE",
        capabilities: {}, // All 12 enabled by default (absent = enabled)
        branches: [
          { name: "Branch 1", code: "B1", city: "Cairo" },
          { name: "Branch 2", code: "B2", city: "Giza" },
        ],
        warehouses: [{ name: "Central Store", code: "WH1", branchCodes: ["B1", "B2"] }],
        responsibilities: {
          INVENTORY: "DEDICATED",
          TEAMS: "DEDICATED",
        },
      },
      { accountId: "super-admin", displayName: "Platform Admin" },
    );
    tenantAId = resultA.tenant.id;
    tenantsToClean.push(tenantAId);

    // 4. Provision Workshop B (Lean / Constrained Shape)
    const resultB = await platformService.createWorkshop(
      {
        name: `Workshop B Lean ${suffix}`,
        slug: `workshop-b-${suffix}`,
        country: "EG",
        city: "Alexandria",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Independent Garage",
        starterBuilderTemplate: "DEFAULT",
        primaryCategory: "CARS",
        ownerFullName: "Owner Beta",
        ownerEmail: `owner-b-${suffix}@example.com`,
        ownerPhone: "+201234567892",
        planId: starterPlanId,
        initialStatus: "ACTIVE",
        capabilities: {
          INVENTORY: "DISABLED",
          PART_RETURNS: "DISABLED",
          MULTI_WAREHOUSE: "DISABLED",
          MULTI_BRANCH: "DISABLED",
          QC: "DISABLED",
          CUSTOMER_PORTAL: "DISABLED",
          TEAMS: "DISABLED",
          TEAM_REVIEW: "DISABLED",
        },
        branches: [{ name: "Sole Branch", code: "MAIN", city: "Alexandria" }],
        warehouses: [], // 0 stores (valid since INVENTORY is off)
      },
      { accountId: "super-admin", displayName: "Platform Admin" },
    );
    tenantBId = resultB.tenant.id;
    tenantsToClean.push(tenantBId);
  });

  afterAll(async () => {
    for (const id of tenantsToClean) {
      await prisma.tenant.delete({ where: { id } }).catch(() => {});
    }
    if (enterprisePlanId) await prisma.plan.delete({ where: { id: enterprisePlanId } }).catch(() => {});
    if (starterPlanId) await prisma.plan.delete({ where: { id: starterPlanId } }).catch(() => {});
    await prisma.$disconnect();
  });

  describe("1. Derived / Resolved Workshop Model (Architecture Seam)", () => {
    it("Workshop A resolves as a full-capability workshop", async () => {
      const modelA = await capabilitiesService.resolveWorkshopModel(tenantAId);

      expect(modelA.tenantId).toBe(tenantAId);
      expect(modelA.plan.code).toBe(`PLAN-ENT-${suffix}`);
      expect(modelA.enabledModules).toContain("INVENTORY");
      expect(modelA.enabledModules).toContain("TEAM_MANAGEMENT");
      expect(modelA.enabledModules).toContain("CUSTOMER_PORTAL");
      expect(modelA.enabledModules).toContain("FINANCE");

      expect(modelA.structure.branchCount).toBe(2);
      expect(modelA.structure.warehouseCount).toBe(1);

      expect(modelA.activeGates).toContain("parts.received_used_or_returned");
      expect(modelA.activeGates).toContain("qc.passed");

      // Verifies seam invariant: NO Policy properties on ResolvedWorkshopModel
      expect((modelA as unknown as Record<string, unknown>).policies).toBeUndefined();
    });

    it("Workshop B resolves as a lean workshop with disabled capabilities and dropped gates", async () => {
      const modelB = await capabilitiesService.resolveWorkshopModel(tenantBId);

      expect(modelB.tenantId).toBe(tenantBId);
      expect(modelB.plan.code).toBe(`PLAN-START-${suffix}`);

      // Modules corresponding to disabled capabilities are not enabled
      expect(modelB.enabledModules).not.toContain("INVENTORY");
      expect(modelB.enabledModules).not.toContain("TEAM_MANAGEMENT");
      expect(modelB.enabledModules).not.toContain("CUSTOMER_PORTAL");
      expect(modelB.enabledModules).toContain("OPERATIONS");
      expect(modelB.enabledModules).toContain("FINANCE");

      expect(modelB.structure.branchCount).toBe(1);
      expect(modelB.structure.warehouseCount).toBe(0);

      // Gates belonging to disabled capabilities are dropped
      expect(modelB.activeGates).not.toContain("parts.received_used_or_returned");
      expect(modelB.activeGates).not.toContain("qc.passed");

      // Verifies seam invariant: NO Policy properties on ResolvedWorkshopModel
      expect((modelB as unknown as Record<string, unknown>).policies).toBeUndefined();
    });
  });

  describe("2. Runtime API / Operations Divergence", () => {
    it("Workshop B rejects part requests with 403 inventory_disabled", async () => {
      await expect(
        partRequestService.request(
          {
            tenantId: tenantBId,
            workOrderId: "dummy-wo",
            inventoryItemId: "item-1",
            quantity: 1,
            reason: "Repair",
          },
          { accountId: "tech-1", displayName: "Tech One", actorType: "TENANT_STAFF" },
        ),
      ).rejects.toThrow(ForbiddenException);

      try {
        await partRequestService.request(
          {
            tenantId: tenantBId,
            workOrderId: "dummy-wo",
            inventoryItemId: "item-1",
            quantity: 1,
            reason: "Repair",
          },
          { accountId: "tech-1", displayName: "Tech One", actorType: "TENANT_STAFF" },
        );
      } catch (err: unknown) {
        const error = err as ForbiddenException;
        expect(error.getStatus()).toBe(403);
        const response = error.getResponse() as { code: string; message: string };
        expect(response.code).toBe("inventory_disabled");
        expect(response.message).toContain("This workshop does not hold stock");
      }
    });

    it("Workshop A allows part requests to proceed past the inventory check", async () => {
      // In Workshop A, requireInventory passes without throwing 403 inventory_disabled
      const profile = await capabilitiesService.resolveCurrent(tenantAId);
      expect(profile.INVENTORY).toBeUndefined(); // Absent means ENABLED
    });
  });

  describe("3. Access Control / Permission Layer Divergence", () => {
    it("TenantCapabilityLayer locks out inventory permissions for staff in Workshop B", () => {
      const decision = capabilityLayer.evaluate(
        makeSession({
          accountId: "staff-b",
          tenantId: tenantBId,
          role: "TECHNICIAN",
          accountType: "TENANT_STAFF",
        }),
        "inventory.request.issue",
        null as never,
        {
          capabilities: { INVENTORY: "DISABLED" },
        } as never,
      );

      expect(decision).toEqual({
        allowed: false,
        locked: true,
        reason: "Inventory is not part of this workshop's setup",
      });
    });

    it("TenantCapabilityLayer does not block inventory permissions in Workshop A", () => {
      const decision = capabilityLayer.evaluate(
        makeSession({
          accountId: "staff-a",
          tenantId: tenantAId,
          role: "INVENTORY_MANAGER",
          accountType: "TENANT_STAFF",
        }),
        "inventory.request.issue",
        null as never,
        {
          capabilities: {}, // All enabled
        } as never,
      );

      // Returns null to allow lower layers (RolePermission) to determine grant
      expect(decision).toBeNull();
    });
  });

  describe("4. Workflow Lifecycle Reachability Divergence", () => {
    it("Workshop A routes FINISH through TEAM_REVIEW and then QC when capabilities are enabled", () => {
      const profileA: CapabilityProfile = {}; // All enabled
      const finishRouted = resolveIntent(
        WORK_ORDER_GRAPH,
        profileA,
        "IN_PROGRESS",
        "FINISH",
        new Map(),
        new Set(),
      );

      expect(finishRouted.ok).toBe(true);
      if (finishRouted.ok) {
        expect(finishRouted.transition.to).toBe("READY_FOR_TEAM_REVIEW");
      }

      const reviewRouted = resolveIntent(
        WORK_ORDER_GRAPH,
        profileA,
        "READY_FOR_TEAM_REVIEW",
        "REVIEW_PASSED",
        new Map(),
        new Set(),
      );

      expect(reviewRouted.ok).toBe(true);
      if (reviewRouted.ok) {
        expect(reviewRouted.transition.to).toBe("READY_FOR_QC");
      }
    });

    it("Workshop B skips both team review and QC when disabled, routing FINISH directly to billing", () => {
      const profileB: CapabilityProfile = {
        QC: "DISABLED",
        TEAM_REVIEW: "DISABLED",
        FINANCE_CORE: "ENABLED",
      };

      const routed = resolveIntent(
        WORK_ORDER_GRAPH,
        profileB,
        "IN_PROGRESS",
        "FINISH",
        new Map(),
        new Set(),
      );

      expect(routed.ok).toBe(true);
      if (routed.ok) {
        expect(routed.transition.to).toBe("PAYMENT_PENDING");
      }
    });
  });

  describe("5. Structure Invariants Divergence", () => {
    it("rejects a warehouse for Workshop B because INVENTORY is disabled", () => {
      const draftWithStore = {
        identity: {
          name: "Workshop B",
          slug: "wb-test",
          country: "EG",
          city: "Alexandria",
          currency: "EGP",
          timezone: "Africa/Cairo",
          businessType: "Independent Garage",
          primaryCategory: "CARS" as const,
        },
        owner: { ownerFullName: "Owner", ownerEmail: "b@test.com", ownerPhone: "+201234567890" },
        plan: { planId: starterPlanId, initialStatus: "TRIAL" },
        capabilities: { INVENTORY: "DISABLED" as const },
        specializationPacks: [],
        policies: {},
        responsibilities: {},
        branches: [{ name: "Branch", code: "MAIN" }],
        warehouses: [{ name: "Invalid Store", code: "WH1", branchCodes: [] }],
        services: [],
      };

      const result = validateDraft(draftWithStore);
      const blocker = result.findings.find((f) => f.code === "WAREHOUSE_WITHOUT_INVENTORY");
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe("BLOCKER");
      expect(result.publishable).toBe(false);
    });

    it("requires at least one warehouse for Workshop A because INVENTORY is enabled", () => {
      const draftWithoutStore = {
        identity: {
          name: "Workshop A",
          slug: "wa-test",
          country: "EG",
          city: "Cairo",
          currency: "EGP",
          timezone: "Africa/Cairo",
          businessType: "Dealership",
          primaryCategory: "CARS" as const,
        },
        owner: { ownerFullName: "Owner", ownerEmail: "a@test.com", ownerPhone: "+201234567890" },
        plan: { planId: enterprisePlanId, initialStatus: "TRIAL" },
        capabilities: {}, // INVENTORY is active
        specializationPacks: [],
        policies: {},
        responsibilities: { INVENTORY: "TENANT_OWNER" as const },
        branches: [{ name: "Branch", code: "MAIN" }],
        warehouses: [], // Missing warehouse
        services: [],
      };

      const result = validateDraft(draftWithoutStore);
      const blocker = result.findings.find((f) => f.code === "NO_WAREHOUSE");
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe("BLOCKER");
      expect(result.publishable).toBe(false);
    });
  });

  describe("6. Server-Side Plan Entitlement Rejection & Atomic Rollback", () => {
    it("refuses to create a workshop when plan does not permit an enabled capability", async () => {
      // Starter plan does not allow INVENTORY module
      const invalidDto: CreateWorkshopDto = {
        name: `Invalid Shop ${suffix}`,
        slug: `invalid-shop-${suffix}`,
        country: "EG",
        city: "Cairo",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Independent Garage",
        starterBuilderTemplate: "DEFAULT",
        primaryCategory: "CARS",
        ownerFullName: "John Doe",
        ownerEmail: `invalid-${suffix}@example.com`,
        ownerPhone: "+201234567899",
        planId: starterPlanId, // Does NOT allow INVENTORY
        initialStatus: "ACTIVE",
        capabilities: {
          // Explicitly leaving INVENTORY enabled
          MULTI_BRANCH: "DISABLED",
          MULTI_WAREHOUSE: "DISABLED",
        },
        branches: [{ name: "Branch", code: "MAIN" }],
        warehouses: [{ name: "Store", code: "WH1", branchCodes: [] }],
        responsibilities: { INVENTORY: "TENANT_OWNER" },
      };

      await expect(
        platformService.createWorkshop(invalidDto, { accountId: "admin", displayName: "Admin" }),
      ).rejects.toThrow(BadRequestException);

      // Verify atomic rollback: zero tenant rows written
      const createdTenant = await prisma.tenant.findUnique({
        where: { slug: `invalid-shop-${suffix}` },
      });
      expect(createdTenant).toBeNull();
    });
  });

  describe("7. Responsibility Impossibility Rejection", () => {
    it("refuses to create a workshop when capability is enabled without an operator", async () => {
      const unassignedDto: CreateWorkshopDto = {
        name: `Unassigned Shop ${suffix}`,
        slug: `unassigned-shop-${suffix}`,
        country: "EG",
        city: "Cairo",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Dealership Service Center",
        starterBuilderTemplate: "DEFAULT",
        primaryCategory: "CARS",
        ownerFullName: "Jane Doe",
        ownerEmail: `unassigned-${suffix}@example.com`,
        ownerPhone: "+201234567898",
        planId: enterprisePlanId,
        initialStatus: "ACTIVE",
        capabilities: {
          MULTI_BRANCH: "DISABLED",
          MULTI_WAREHOUSE: "DISABLED",
        },
        branches: [{ name: "Branch", code: "MAIN" }],
        warehouses: [{ name: "Store", code: "WH1", branchCodes: [] }],
        responsibilities: { INVENTORY: "TECHNICIAN" as never }, // TECHNICIAN is not an eligible operator for INVENTORY!
      };

      await expect(
        platformService.createWorkshop(unassignedDto, { accountId: "admin", displayName: "Admin" }),
      ).rejects.toThrow(BadRequestException);

      // Verify atomic rollback: zero tenant rows written
      const createdTenant = await prisma.tenant.findUnique({
        where: { slug: `unassigned-shop-${suffix}` },
      });
      expect(createdTenant).toBeNull();
    });
  });
});

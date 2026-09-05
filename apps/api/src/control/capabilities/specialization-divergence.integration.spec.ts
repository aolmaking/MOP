/**
 * Workshop Specialization Divergence — Real PostgreSQL Integration Test
 *
 * SPRINT 3 — LAYER 2B — SPECIALIZATION SYSTEM
 *
 * Proves that specialization is a real, persisted, tenant-scoped operational
 * domain context resolved at runtime and consumed by existing systems:
 *
 *   Workshop A: Configured with "TYRES" alias -> resolved to "TYRES_AND_WHEELS"
 *   Workshop B: Configured with "DIAGNOSTICS"
 *
 * Observable Divergence Verified Across 7 Dimensions:
 *   1. Persistent Specialization Assignment (workshop_specializations table)
 *   2. Authoritative Seeded Definitions (SpecializationDefinition rows, cards, fields)
 *   3. Authoritative Runtime Context (ResolvedWorkshopModel & SpecializationContext)
 *   4. Mandatory Real Vertical Slice (Technician Work Card -> Typed Measurements -> PostgreSQL Persistence -> Reload)
 *   5. Schema Validation & Type Safety (DECIMAL type check, required fields)
 *   6. Server-Side Capability Compatibility & Atomic Rollback (SPECIALIZATION_CAPABILITY_INCOMPATIBLE)
 *   7. Cross-Tenant IDOR & Boundary Isolation (Tenant A vs Tenant B isolation)
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SpecializationService } from "../../systems/people/specialization/specialization.service";
import { PlatformService } from "../platform/platform.service";
import { CapabilityResolutionService } from "./capability-resolution.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";
import { WorkOrderLifecycleService } from "../../systems/operations/work-order-lifecycle.service";
import { AssetHistoryService } from "../../systems/operations/vehicle-history/asset-history.service";
import { WorkshopHistoryService } from "../../systems/operations/history/workshop-history.service";
import { GateEvaluatorService } from "../../systems/operations/gate-evaluator.service";
import { OperationEventsService } from "../../systems/operations/operation-events.service";
import { CustomerSafeProjectionService } from "../../systems/operations/customer-safe-projection.service";
import { TechnicianWorkViewService } from "../../experiences/technician/technician-work-view.service";
import type { CreateWorkshopDto } from "../platform/create-workshop.dto";

describe("Workshop Specialization Divergence (Real PostgreSQL Integration)", () => {
  const prisma = new PrismaClient();
  const asService = prisma as unknown as PrismaService;

  const audit = new AuditService(asService);
  const specialization = new SpecializationService(asService);
  const platformService = new PlatformService(asService, audit, specialization);

  const capabilitiesService = new CapabilityResolutionService(asService);
  const policies = new PolicyResolutionService(asService, audit, capabilitiesService);
  const gates = new GateEvaluatorService(asService, policies);
  const events = new OperationEventsService(asService, audit, new CustomerSafeProjectionService());
  const lifecycle = new WorkOrderLifecycleService(asService, capabilitiesService, events, gates, policies);
  const assetHistory = new AssetHistoryService(asService);
  const workshopHistory = new WorkshopHistoryService(asService, assetHistory);

  const techView = new TechnicianWorkViewService(
    asService,
    lifecycle,
    assetHistory,
    workshopHistory,
    policies,
    capabilitiesService,
    specialization,
  );

  const suffix = `spec-div-${Date.now()}`;
  let planId: string;
  let tenantAId: string;
  let tenantBId: string;
  let branchAId: string;
  let branchBId: string;
  let techAStaffId: string;
  let techBStaffId: string;
  const tenantsToClean: string[] = [];

  beforeAll(async () => {
    // 1. Create a platform commercial plan supporting CARS and all needed modules
    const plan = await prisma.plan.create({
      data: {
        code: `PLAN-SPEC-${suffix}`,
        name: "Specialization Test Plan",
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
        monthlyPrice: 50,
      },
    });
    planId = plan.id;

    // 2. Provision Workshop A: Category CARS with specialization pack "TYRES" (alias for TYRES_AND_WHEELS)
    const resultA = await platformService.createWorkshop(
      {
        name: `Workshop A Tyres ${suffix}`,
        slug: `workshop-a-tyres-${suffix}`,
        country: "EG",
        city: "Cairo",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Independent Garage",
        starterBuilderTemplate: "DEFAULT",
        primaryCategory: "CARS",
        ownerFullName: "Ahmed Tyres",
        ownerEmail: `owner-a-${suffix}@example.com`,
        ownerPhone: "+201234567801",
        planId,
        initialStatus: "ACTIVE",
        capabilities: {}, // All 12 enabled by default
        specializationPacks: ["TYRES"], // Testing the alias contract
        branches: [{ name: "Tyre Branch Main", code: "TBM", city: "Cairo" }],
        warehouses: [{ name: "Tyre Store", code: "TWH", branchCodes: ["TBM"] }],
        responsibilities: {
          INVENTORY: "DEDICATED",
          TEAMS: "DEDICATED",
        },
      },
      { accountId: "super-admin", displayName: "Platform Admin" },
    );
    tenantAId = resultA.tenant.id;
    tenantsToClean.push(tenantAId);

    const branchA = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenantAId } });
    branchAId = branchA.id;

    // Create staff technician for Workshop A
    const techAAccount = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId: tenantAId, email: `tech-a-${suffix}@x.local`, status: "ACTIVE" },
    });
    const techAStaff = await prisma.staffUser.create({
      data: {
        accountId: techAAccount.id,
        tenantId: tenantAId,
        fullName: "Tariq TyreTech",
        role: "TECHNICIAN",
        branchScope: [branchAId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    techAStaffId = techAStaff.id;

    // 3. Provision Workshop B: Category CARS with specialization pack "DIAGNOSTICS"
    const resultB = await platformService.createWorkshop(
      {
        name: `Workshop B Diag ${suffix}`,
        slug: `workshop-b-diag-${suffix}`,
        country: "EG",
        city: "Cairo",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Independent Garage",
        starterBuilderTemplate: "DEFAULT",
        primaryCategory: "CARS",
        ownerFullName: "Bassem Diag",
        ownerEmail: `owner-b-${suffix}@example.com`,
        ownerPhone: "+201234567802",
        planId,
        initialStatus: "ACTIVE",
        capabilities: {},
        specializationPacks: ["DIAGNOSTICS"],
        branches: [{ name: "Diag Branch Main", code: "DBM", city: "Cairo" }],
        warehouses: [{ name: "Diag Store", code: "DWH", branchCodes: ["DBM"] }],
        responsibilities: {
          INVENTORY: "DEDICATED",
          TEAMS: "DEDICATED",
        },
      },
      { accountId: "super-admin", displayName: "Platform Admin" },
    );
    tenantBId = resultB.tenant.id;
    tenantsToClean.push(tenantBId);

    const branchB = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenantBId } });
    branchBId = branchB.id;

    // Create staff technician for Workshop B
    const techBAccount = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId: tenantBId, email: `tech-b-${suffix}@x.local`, status: "ACTIVE" },
    });
    const techBStaff = await prisma.staffUser.create({
      data: {
        accountId: techBAccount.id,
        tenantId: tenantBId,
        fullName: "Bilal DiagTech",
        role: "TECHNICIAN",
        branchScope: [branchBId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    techBStaffId = techBStaff.id;
  });

  afterAll(async () => {
    for (const tid of tenantsToClean) {
      await prisma.tenant.delete({ where: { id: tid } }).catch(() => {});
    }
    if (planId) {
      await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe("1. Persistent Specialization Assignment", () => {
    it("persists canonical specialization pack keys in workshop_specializations table", async () => {
      // Workshop A had "TYRES" alias -> canonical key is "TYRES_AND_WHEELS"
      const specRowsA = await prisma.workshopSpecialization.findMany({
        where: { tenantId: tenantAId },
      });
      expect(specRowsA).toHaveLength(1);
      expect(specRowsA[0].specializationKey).toBe("TYRES_AND_WHEELS");

      // Workshop B had "DIAGNOSTICS"
      const specRowsB = await prisma.workshopSpecialization.findMany({
        where: { tenantId: tenantBId },
      });
      expect(specRowsB).toHaveLength(1);
      expect(specRowsB[0].specializationKey).toBe("DIAGNOSTICS");

      // Service query returns exact assigned keys
      const assignedA = await specialization.assignedSpecializations(tenantAId);
      expect(assignedA).toEqual(["TYRES_AND_WHEELS"]);

      const assignedB = await specialization.assignedSpecializations(tenantBId);
      expect(assignedB).toEqual(["DIAGNOSTICS"]);
    });
  });

  describe("2. Authoritative Seeded Definitions", () => {
    it("seeds exact definition cards and typed field specifications for each pack", async () => {
      // Workshop A: Tread & Pressure Check
      const defsA = await specialization.listDefinitions(tenantAId);
      expect(defsA).toHaveLength(1);
      expect(defsA[0].name).toBe("Tread & Pressure Check");
      expect(defsA[0].kind).toBe("MEASUREMENT_FORM");
      expect(defsA[0].version).toBe(1);

      const fieldKeysA = defsA[0].fields.map((f) => f.key);
      expect(fieldKeysA).toEqual(["tread_fl", "tread_fr", "tread_rl", "tread_rr", "pressureSetTo"]);

      const treadFlField = defsA[0].fields.find((f) => f.key === "tread_fl");
      expect(treadFlField).toMatchObject({
        label: "Tread — front left",
        type: "DECIMAL",
        unit: "mm",
        required: true,
      });

      // Workshop B: Diagnostic Scan
      const defsB = await specialization.listDefinitions(tenantBId);
      expect(defsB).toHaveLength(1);
      expect(defsB[0].name).toBe("Diagnostic Scan");
      expect(defsB[0].kind).toBe("MEASUREMENT_FORM");
      expect(defsB[0].version).toBe(1);

      const fieldKeysB = defsB[0].fields.map((f) => f.key);
      expect(fieldKeysB).toEqual(["tool", "codes", "livePassed", "batteryVoltage", "conclusion"]);
    });
  });

  describe("3. Authoritative Runtime Context Resolution", () => {
    it("resolves specializations into ResolvedWorkshopModel and SpecializationContext", async () => {
      const modelA = await capabilitiesService.resolveWorkshopModel(tenantAId);
      expect(modelA.specializations).toEqual(["TYRES_AND_WHEELS"]);

      const modelB = await capabilitiesService.resolveWorkshopModel(tenantBId);
      expect(modelB.specializations).toEqual(["DIAGNOSTICS"]);

      const ctxA = await specialization.resolveSpecializationContext(tenantAId);
      expect(ctxA.specializations).toEqual(["TYRES_AND_WHEELS"]);
      expect(ctxA.definitions.some((d) => d.name === "Tread & Pressure Check")).toBe(true);

      const ctxB = await specialization.resolveSpecializationContext(tenantBId);
      expect(ctxB.specializations).toEqual(["DIAGNOSTICS"]);
      expect(ctxB.definitions.some((d) => d.name === "Diagnostic Scan")).toBe(true);
    });

    it("integrates with policy relevance determination", async () => {
      // Automatic lookup from workshop_specializations table
      const relevantA = await policies.isRelevant(tenantAId, "DELIVERY_BLOCKED_UNTIL_PAID");
      expect(typeof relevantA).toBe("boolean");
      expect(relevantA).toBe(true);
    });
  });

  describe("4. Mandatory Real Vertical Slice (Tyres & Wheels)", () => {
    let workOrderId: string;
    let treadCheckDefId: string;

    beforeAll(async () => {
      // 1. Create a work order in Workshop A assigned to Tariq TyreTech
      const customer = await prisma.customer.create({
        data: {
          tenantId: tenantAId,
          fullName: "Tariq Customer",
          phone: "+201011112222",
        },
      });

      const asset = await prisma.asset.create({
        data: {
          tenantId: tenantAId,
          category: "CARS" as never,
          plateNumber: `TYRE-CAR-${Date.now()}`,
        },
      });

      const workOrder = await prisma.workOrder.create({
        data: {
          tenantId: tenantAId,
          branchId: branchAId,
          customerId: customer.id,
          assetId: asset.id,
          status: "REGISTERED",
          assignments: {
            create: {
              tenantId: tenantAId,
              staffUserId: techAStaffId,
            },
          },
        },
      });
      workOrderId = workOrder.id;

      const defs = await specialization.listDefinitions(tenantAId);
      treadCheckDefId = defs.find((d) => d.name === "Tread & Pressure Check")!.id;
    });

    it("surfaces 'Tread & Pressure Check' form on Technician Work Card", async () => {
      const card = await techView.workCard(techAStaffId, tenantAId, workOrderId);

      expect(card.specializationForms).toBeDefined();
      expect(card.specializationForms).toHaveLength(1);
      expect(card.specializationForms[0].name).toBe("Tread & Pressure Check");
      expect(card.specializationForms[0].id).toBe(treadCheckDefId);

      // Initially no entries
      expect(card.specializationEntries).toHaveLength(0);
    });

    it("persists real typed measurements in PostgreSQL specialization_entries", async () => {
      const measurementValues = {
        tread_fl: 5.2,
        tread_fr: 5.0,
        tread_rl: 4.8,
        tread_rr: 4.7,
        pressureSetTo: 2.3,
      };

      const entry = await specialization.fillEntry(
        tenantAId,
        treadCheckDefId,
        techAStaffId,
        measurementValues,
        { workOrderId },
      );

      expect(entry.id).toBeDefined();
      expect(entry.definitionId).toBe(treadCheckDefId);
      expect(entry.definitionVersion).toBe(1);
      expect(entry.filledById).toBe(techAStaffId);
      expect(entry.values).toEqual(measurementValues);

      // Verify row in PostgreSQL
      const dbRow = await prisma.specializationEntry.findUnique({
        where: { id: entry.id },
      });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.tenantId).toBe(tenantAId);
      expect(dbRow?.workOrderId).toBe(workOrderId);
      expect(dbRow?.values).toEqual(measurementValues);
    });

    it("reloads identical measurements on subsequent Work Card view", async () => {
      const reloadedCard = await techView.workCard(techAStaffId, tenantAId, workOrderId);

      expect(reloadedCard.specializationEntries).toHaveLength(1);
      const entry = reloadedCard.specializationEntries[0];
      expect(entry.definitionId).toBe(treadCheckDefId);
      expect(entry.values).toEqual({
        tread_fl: 5.2,
        tread_fr: 5.0,
        tread_rl: 4.8,
        tread_rr: 4.7,
        pressureSetTo: 2.3,
      });
    });
  });

  describe("5. Schema Validation & Type Safety Enforcement", () => {
    let treadCheckDefId: string;

    beforeAll(async () => {
      const defs = await specialization.listDefinitions(tenantAId);
      treadCheckDefId = defs.find((d) => d.name === "Tread & Pressure Check")!.id;
    });

    it("refuses submission when required field is missing", async () => {
      await expect(
        specialization.fillEntry(
          tenantAId,
          treadCheckDefId,
          techAStaffId,
          {
            tread_fr: 5.0, // tread_fl is required but missing
            pressureSetTo: 2.2,
          },
        ),
      ).rejects.toMatchObject({
        response: {
          code: "field_required",
          message: '"Tread — front left" is required.',
        },
      });
    });

    it("refuses submission when field type mismatches declared schema", async () => {
      await expect(
        specialization.fillEntry(
          tenantAId,
          treadCheckDefId,
          techAStaffId,
          {
            tread_fl: "not-a-number", // DECIMAL requires finite number
            tread_fr: 5.0,
          },
        ),
      ).rejects.toMatchObject({
        response: {
          code: "field_type_mismatch",
          message: '"Tread — front left" must be a number.',
        },
      });
    });
  });

  describe("6. Capability Compatibility Validation & Atomic Rollback", () => {
    it("refuses workshop creation when specialization required capabilities are disabled", async () => {
      // QUICK_SERVICE requires QUICK_INSPECTION capability
      const incompatibleDto: CreateWorkshopDto = {
        name: `Incompatible Workshop ${suffix}`,
        slug: `incompatible-${suffix}`,
        country: "EG",
        city: "Cairo",
        currency: "EGP",
        timezone: "Africa/Cairo",
        businessType: "Independent Garage",
        starterBuilderTemplate: "DEFAULT",
        primaryCategory: "CARS",
        ownerFullName: "Incompatible Owner",
        ownerEmail: `incompatible-${suffix}@example.com`,
        ownerPhone: "+201234567809",
        planId,
        initialStatus: "ACTIVE",
        capabilities: {
          QUICK_INSPECTION: "DISABLED", // Conflict!
        },
        specializationPacks: ["QUICK_SERVICE"],
        branches: [{ name: "Branch 1", code: "INC1", city: "Cairo" }],
        warehouses: [{ name: "Store 1", code: "INCWH", branchCodes: ["INC1"] }],
      };

      await expect(
        platformService.createWorkshop(incompatibleDto, { accountId: "admin", displayName: "Admin" }),
      ).rejects.toMatchObject({
        response: {
          code: "configuration_invalid",
          details: {
            findings: expect.arrayContaining([
              expect.objectContaining({
                code: "SPECIALIZATION_CAPABILITY_INCOMPATIBLE",
                subject: "QUICK_SERVICE",
              }),
            ]),
          },
        },
      });

      // Assert atomic rollback: zero tenant rows, zero definition rows created
      const tenantRow = await prisma.tenant.findUnique({
        where: { slug: `incompatible-${suffix}` },
      });
      expect(tenantRow).toBeNull();

      const accountRow = await prisma.account.findFirst({
        where: { email: `incompatible-${suffix}@example.com` },
      });
      expect(accountRow).toBeNull();
    });
  });

  describe("7. Cross-Tenant IDOR and Isolation Defense", () => {
    it("prevents technician in Tenant B from accessing or filling definitions of Tenant A", async () => {
      const defsA = await specialization.listDefinitions(tenantAId);
      const treadDefA = defsA[0];

      // Tenant B technician attempts to fill entry using Tenant A's definition ID under Tenant B
      await expect(
        specialization.fillEntry(
          tenantBId,
          treadDefA.id,
          techBStaffId,
          {
            tread_fl: 5.0,
            tread_fr: 5.0,
          },
        ),
      ).rejects.toThrow(NotFoundException);

      // Workshop B's definitions are strictly isolated from Workshop A
      const defsB = await specialization.listDefinitions(tenantBId);
      expect(defsB.some((d) => d.id === treadDefA.id)).toBe(false);
      expect(defsB.some((d) => d.name === "Tread & Pressure Check")).toBe(false);
    });
  });
});

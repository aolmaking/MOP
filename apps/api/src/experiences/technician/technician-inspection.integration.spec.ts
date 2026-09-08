import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";
import { TechnicianInspectionService } from "./technician-inspection.service";
import { InspectionRepository } from "../../systems/operations/inspection/inspection.repository";
import { RuleEvaluatorService } from "../../systems/operations/inspection/recommendations/rule-evaluator.service";
import { PrismaService } from "../../runtime/database/prisma.service";

describe("TechnicianInspectionService (Phase C Workshop Real-Time Integration)", () => {
  let service: TechnicianInspectionService;
  let repo: InspectionRepository;
  let ruleEvaluator: RuleEvaluatorService;
  let prismaMock: any;
  let storedInspectionRow: any = null;
  const storedFaults: any[] = [];

  beforeEach(() => {
    storedInspectionRow = null;
    storedFaults.length = 0;

    prismaMock = {
      inspection: {
        findFirst: jest.fn().mockImplementation(async (args: any) => {
          if (!storedInspectionRow) return null;
          if (args.where.workOrderId && storedInspectionRow.workOrderId !== args.where.workOrderId) return null;
          if (args.where.id && storedInspectionRow.id !== args.where.id) return null;
          return storedInspectionRow;
        }),
        upsert: jest.fn().mockImplementation(async (args: any) => {
          storedInspectionRow = {
            id: args.where.id,
            tenantId: args.create?.tenantId || storedInspectionRow?.tenantId,
            workOrderId: args.create?.workOrderId || storedInspectionRow?.workOrderId,
            technicianId: args.create?.technicianId || storedInspectionRow?.technicianId,
            type: args.create?.type || "FULL",
            fields: args.update?.fields || args.create?.fields,
            completedAt: args.update?.completedAt || null,
            note: args.update?.note || null,
          };
          return storedInspectionRow;
        }),
      },
      fault: {
        findFirst: jest.fn().mockImplementation(async (args: any) => {
          return storedFaults.find(
            (f) =>
              f.workOrderId === args.where.workOrderId &&
              f.tenantId === args.where.tenantId &&
              f.code === args.where.code,
          ) || null;
        }),
        create: jest.fn().mockImplementation(async (args: any) => {
          const fault = { id: `fault-${storedFaults.length + 1}`, ...args.data };
          storedFaults.push(fault);
          return fault;
        }),
        update: jest.fn().mockImplementation(async (args: any) => {
          const idx = storedFaults.findIndex((f) => f.id === args.where.id);
          if (idx >= 0) {
            storedFaults[idx] = { ...storedFaults[idx], ...args.data };
            return storedFaults[idx];
          }
          return args.data;
        }),
      },
      workOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: "wo-test-1",
          tenantId: "tenant-demo",
          asset: { category: "CARS" },
          status: "UNDER_INSPECTION",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    repo = new InspectionRepository(prismaMock as unknown as PrismaService);
    ruleEvaluator = new RuleEvaluatorService();
    service = new TechnicianInspectionService(prismaMock as unknown as PrismaService, repo, ruleEvaluator);
  });

  describe("Target Delta Auto-Save & Rule Evaluation", () => {
    it("auto-saves target delta, runs recommendation rules, and increments aggregateVersion", async () => {
      const result = await service.saveTargetDelta(
        "tenant-demo",
        "wo-test-1",
        "tech-42",
        "front_axle_brakes",
        {
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "CRITICAL",
          findings: [
            {
              findingKey: "CAR_PAD_THICKNESS_CRITICAL",
              severity: "CRITICAL",
              technicianObservation: "Friction material below 1.5mm, grooved backing plate",
            },
          ],
        },
      );

      expect(result.success).toBe(true);
      expect(result.targetKey).toBe("front_axle_brakes");
      expect(result.targetResult?.condition).toBe("CRITICAL");
      expect(result.aggregateVersion).toBe(3);

      // Recommendations should have been generated automatically by RuleEvaluatorService
      expect(result.recommendations.length).toBeGreaterThan(0);
      const brakePadRec = result.recommendations.find(
        (r) => r.serviceKey === "CAR_BRAKE_PAD_ROTOR_REPLACE_FRONT",
      );
      expect(brakePadRec).toBeDefined();
      expect(brakePadRec?.recommendationLevel).toBe("RECOMMENDED");
      expect(brakePadRec?.score).toBeGreaterThanOrEqual(95);
      expect(brakePadRec?.evaluationContext.findingKeys).toContain("CAR_PAD_THICKNESS_CRITICAL");
    });

    it("evaluates motorcycle and heavy equipment targets appropriately", async () => {
      prismaMock.workOrder.findFirst.mockResolvedValueOnce({
        id: "wo-moto-1",
        tenantId: "tenant-demo",
        asset: { category: "MOTORCYCLES" },
      });

      const motoResult = await service.saveTargetDelta(
        "tenant-demo",
        "wo-moto-1",
        "tech-42",
        "final_drive_system",
        {
          canonicalPartSlug: "moto-drive-chain",
          position: "REAR",
          status: "INSPECTED",
          condition: "ATTENTION",
          findings: [
            {
              findingKey: "MOTO_CHAIN_EXCESSIVE_SLACK",
              severity: "ATTENTION",
              technicianObservation: "Slack exceeds 45mm, adjustment required",
            },
          ],
        },
      );

      expect(motoResult.success).toBe(true);
      const chainRec = motoResult.recommendations.find(
        (r) => r.serviceKey === "MOTO_CHAIN_TENSION_LUBE",
      );
      expect(chainRec).toBeDefined();
      expect(chainRec?.recommendationLevel).toBe("RECOMMENDED");
    });
  });

  describe("Optimistic Concurrency Control (OCC)", () => {
    it("rejects delta update when expectedVersion does not match current version (409 Conflict)", async () => {
      // First save
      const initialSave = await service.saveTargetDelta(
        "tenant-demo",
        "wo-test-1",
        "tech-42",
        "front_axle_brakes",
        {
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "GOOD",
        },
      );
      expect(initialSave.aggregateVersion).toBe(3);

      // Device 2 attempts update with stale version 2
      await expect(
        service.saveTargetDelta("tenant-demo", "wo-test-1", "tech-99", "battery_system", {
          canonicalPartSlug: "12v-starting-battery",
          position: "ENGINE_BAY",
          status: "INSPECTED",
          condition: "GOOD",
          expectedVersion: 2, // Stale! Current is 3
        }),
      ).rejects.toThrow(ConflictException);

      // Device 1 updates with matching version 3 -> succeeds and bumps to 4
      const validUpdate = await service.saveTargetDelta(
        "tenant-demo",
        "wo-test-1",
        "tech-42",
        "battery_system",
        {
          canonicalPartSlug: "12v-starting-battery",
          position: "ENGINE_BAY",
          status: "INSPECTED",
          condition: "GOOD",
          expectedVersion: 3,
        },
      );
      expect(validUpdate.aggregateVersion).toBe(4);
    });
  });

  describe("Decision Ledger Audit Tracking", () => {
    it("allows technician to accept a recommendation and updates decision ledger", async () => {
      const delta = await service.saveTargetDelta(
        "tenant-demo",
        "wo-test-1",
        "tech-42",
        "front_axle_brakes",
        {
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "CRITICAL",
          findings: [
            {
              findingKey: "CAR_PAD_THICKNESS_CRITICAL",
              severity: "CRITICAL",
            },
          ],
        },
      );

      const rec = delta.recommendations[0];
      expect(rec).toBeDefined();

      const decisionRes = await service.recordDecision("tenant-demo", "wo-test-1", "tech-42", {
        recommendationId: rec.id,
        decision: "ACCEPTED",
        expectedVersion: delta.aggregateVersion,
      });

      expect(decisionRes.success).toBe(true);
      expect(decisionRes.decision.decision).toBe("ACCEPTED");
      expect(decisionRes.aggregateVersion).toBe(delta.aggregateVersion + 1);
    });

    it("rejects dismissal of a recommendation without a dismissalReason (enforcing INV-5)", async () => {
      const delta = await service.saveTargetDelta(
        "tenant-demo",
        "wo-test-1",
        "tech-42",
        "front_axle_brakes",
        {
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "CRITICAL",
          findings: [{ findingKey: "CAR_PAD_THICKNESS_CRITICAL", severity: "CRITICAL" }],
        },
      );

      const rec = delta.recommendations[0];

      await expect(
        service.recordDecision("tenant-demo", "wo-test-1", "tech-42", {
          recommendationId: rec.id,
          decision: "DISMISSED",
          // Missing dismissalReason!
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("accepts dismissal with valid reason and supports scope modification note", async () => {
      const delta = await service.saveTargetDelta(
        "tenant-demo",
        "wo-test-1",
        "tech-42",
        "front_axle_brakes",
        {
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "CRITICAL",
          findings: [{ findingKey: "CAR_PAD_THICKNESS_CRITICAL", severity: "CRITICAL" }],
        },
      );

      const rec = delta.recommendations[0];

      const dismissed = await service.recordDecision("tenant-demo", "wo-test-1", "tech-42", {
        recommendationId: rec.id,
        decision: "DISMISSED",
        dismissalReason: "Customer declined, parts ordered privately",
      });

      expect(dismissed.success).toBe(true);
      expect(dismissed.decision.decision).toBe("DISMISSED");
      expect(dismissed.decision.dismissalReason).toBe("Customer declined, parts ordered privately");

      // Modify scope
      const modified = await service.recordDecision("tenant-demo", "wo-test-1", "tech-42", {
        recommendationId: rec.id,
        decision: "MODIFIED_SCOPE",
        scopeModificationNote: "Inspect rotors and bleed lines only, no pad replacement",
      });

      expect(modified.decision.decision).toBe("MODIFIED_SCOPE");
      expect(modified.decision.scopeModificationNote).toBe(
        "Inspect rotors and bleed lines only, no pad replacement",
      );
    });
  });

  describe("Completeness & Submission Lifecycle (INV-1 & INV-6)", () => {
    it("fails submit if any required targets remain NOT_INSPECTED (enforcing INV-1)", async () => {
      await service.saveTargetDelta(
        "tenant-demo",
        "wo-test-1",
        "tech-42",
        "front_axle_brakes",
        {
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "GOOD",
        },
      );

      // Other targets (e.g. rear axle brakes, battery, etc.) are still NOT_INSPECTED
      await expect(
        service.submitInspection("tenant-demo", "wo-test-1", "tech-42", {}),
      ).rejects.toThrow(BadRequestException);
    });

    it("succeeds submit when all targets are addressed, creates historical snapshot, and projects faults idempotently", async () => {
      // Initialize aggregate with 2 targets for test simplicity
      const aggRes = await service.getOrInitializeInspection("tenant-demo", "wo-test-1", "tech-42");
      const targetKeys = aggRes.targets.map((t) => t.targetKey);

      // Inspect target 0 with CRITICAL finding
      await service.saveTargetDelta("tenant-demo", "wo-test-1", "tech-42", targetKeys[0], {
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        status: "INSPECTED",
        condition: "CRITICAL",
        findings: [
          {
            findingKey: "CAR_PAD_THICKNESS_CRITICAL",
            severity: "CRITICAL",
            technicianObservation: "Friction material below 1mm",
          },
        ],
      });

      // Mark all other targets as NOT_ACCESSIBLE with valid reason
      for (let i = 1; i < targetKeys.length; i++) {
        await service.saveTargetDelta("tenant-demo", "wo-test-1", "tech-42", targetKeys[i], {
          canonicalPartSlug: "unknown-part",
          position: "UNIVERSAL",
          status: "NOT_ACCESSIBLE",
          nonInspectionReason: "Component inaccessible due to aftermarket skid plate",
        });
      }

      // Now submit should succeed!
      const submitRes = await service.submitInspection("tenant-demo", "wo-test-1", "tech-42", {
        submissionNote: "Inspection complete. Skid plate blocked secondary targets.",
      });

      expect(submitRes.success).toBe(true);
      expect(submitRes.submittedAt).toBeDefined();

      // Verify Deep Immutable Snapshot (INV-6)
      expect(submitRes.snapshot).toBeDefined();
      expect(submitRes.snapshot.findingsSummary.criticalCount).toBe(1);
      expect(submitRes.snapshot.findingsSummary.inaccessibleCount).toBe(targetKeys.length - 1);
      expect(submitRes.snapshot.targets.length).toBe(targetKeys.length);

      // Verify Fault was projected into Prisma model Fault
      expect(storedFaults.length).toBe(1);
      expect(storedFaults[0].code).toBe("CAR_PAD_THICKNESS_CRITICAL");
      expect(storedFaults[0].severity).toBe("HIGH"); // Prisma SeverityLevel.HIGH represents CRITICAL
      expect(storedFaults[0].workOrderId).toBe("wo-test-1");

      // Calling submit again or mutating after submit should be rejected (INV-6)
      await expect(
        service.saveTargetDelta("tenant-demo", "wo-test-1", "tech-42", targetKeys[0], {
          canonicalPartSlug: "brake-pads-front",
          position: "FRONT",
          status: "INSPECTED",
          condition: "GOOD",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

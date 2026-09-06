import { TechnicianWorkViewService } from "./technician-work-view.service";

/**
 * A work order shaped the way `workCard`'s own query selects it. Pulled
 * out so each test states only the field it is actually about.
 */
function workOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "wo1",
    status: "IN_PROGRESS",
    inspectionDeclined: false,
    assetId: "asset1",
    asset: { plateNumber: "DEMO-4471", serialNumber: null },
    customer: { fullName: "Mona Adel" },
    tasks: [],
    ...overrides,
  };
}

function build(options: {
  order?: Record<string, unknown>;
  parts?: unknown[];
  intents?: string[];
  profile?: Record<string, string>;
  /** The latest inspection on the job, or null for a job with none. */
  inspection?: { completedAt: Date | null; actualMinutes: number | null } | null;
  /** The refusal the authority would give, or null when work is allowed. */
  workNotAuthorized?: string | null;
  faults?: unknown[];
}) {
  const prisma = {
    workOrder: { findFirst: jest.fn().mockResolvedValue(workOrder(options.order)) },
    partRequest: { findMany: jest.fn().mockResolvedValue(options.parts ?? []) },
    // Mission 1 reads both: the inspection for its state, the faults for
    // what it found.
    inspection: {
      findFirst: jest.fn().mockResolvedValue(
        options.inspection === undefined
          ? { completedAt: new Date("2026-09-04T08:00:00.000Z"), actualMinutes: 20 }
          : options.inspection,
      ),
    },
    fault: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue(options.faults ?? []),
    },
  };
  const lifecycle = {
    availableIntents: jest.fn().mockResolvedValue(options.intents ?? []),
    previewGates: jest.fn(),
    // The card asks the real authority and reports its refusal verbatim,
    // so the stub refuses the same shape the service throws.
    assertOperationalWorkAuthorized: jest.fn().mockImplementation(async () => {
      if (!options.workNotAuthorized) return;
      throw { response: { code: "work_not_authorized", message: options.workNotAuthorized } };
    }),
  };
  const assetHistory = { complaintText: jest.fn().mockResolvedValue(new Map([["wo1", "Brake noise"]])) };
  const policies = { resolveValue: jest.fn().mockResolvedValue("REQUIRED") };
  const capabilities = { resolveCurrent: jest.fn().mockResolvedValue(options.profile ?? {}) };

  const service = new TechnicianWorkViewService(
    prisma as never,
    lifecycle as never,
    assetHistory as never,
    // Unit-scope: the work card never reaches history, so this is a
    // placeholder rather than a stub with behaviour to keep in sync.
    {} as never,
    policies as never,
    capabilities as never,
  );
  return { service, prisma, lifecycle, policies, capabilities };
}

/** One issued part, as `workCard`'s query returns it. */
function issuedPart(status: string, clarificationQuestion: string | null = null) {
  return {
    id: "pr1",
    quantity: 1,
    status,
    inventoryItem: { name: "Brake pad set", sku: "BP-100" },
    issuedItems: [{ quantity: 1 }],
    returnRequest: clarificationQuestion === null ? null : { clarificationQuestion },
  };
}

describe("TechnicianWorkViewService", () => {
  it("includes the live TIME_TRACKING policy on the work card", async () => {
    const { service, policies } = build({});

    const card = await service.workCard("tech1", "tenant1", "wo1");

    expect(card.timeTracking).toBe("REQUIRED");
    expect(policies.resolveValue).toHaveBeenCalledWith("tenant1", "TIME_TRACKING");
  });

  describe("primary action", () => {
    it("offers Start inspection when the graph has that door open", async () => {
      const { service } = build({ order: { status: "REGISTERED" }, intents: ["START_INSPECTION"] });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.primaryAction).toEqual({ intent: "START_INSPECTION", label: "Start inspection" });
    });

    it("offers Start work when the job is approved", async () => {
      const { service } = build({ order: { status: "APPROVED_FOR_WORK" }, intents: ["START_WORK"] });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.primaryAction).toEqual({ intent: "START_WORK", label: "Start work" });
    });

    /**
     * The reason this is derived from `availableIntents` rather than from
     * the status: a manager's review decision is a live intent that this
     * technician has no door for, and rendering it would be a button the
     * controller then refuses.
     */
    it("offers nothing when the only live intents belong to someone else", async () => {
      const { service } = build({ order: { status: "READY_FOR_QC" }, intents: ["QC_PASSED", "QC_FAILED"] });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.primaryAction).toBeNull();
    });
  });

  describe("part return affordances", () => {
    it("marks a received part returnable when the workshop accepts returns", async () => {
      const { service } = build({
        parts: [issuedPart("RECEIVED_BY_TECHNICIAN")],
        profile: { PART_RETURNS: "ENABLED" },
      });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.parts[0].returnable).toBe(true);
      expect(card.parts[0].clarificationPending).toBe(false);
    });

    /**
     * The whole reason `returnable` is asked of the graph: with
     * PART_RETURNS removed the RETURN_REQUESTED edge does not exist, so
     * the button must not exist either -- otherwise the service layer
     * refuses a press the card invited.
     */
    it("refuses to offer a return when the capability is removed", async () => {
      const { service } = build({
        parts: [issuedPart("RECEIVED_BY_TECHNICIAN")],
        profile: { PART_RETURNS: "DISABLED" },
      });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.parts[0].returnable).toBe(false);
    });

    it("carries the store's question so the prompt can be answered", async () => {
      const { service } = build({
        parts: [issuedPart("RETURN_CLARIFICATION_REQUESTED", "Which of the two did you fit?")],
        profile: { PART_RETURNS: "ENABLED" },
      });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.parts[0].clarificationPending).toBe(true);
      expect(card.parts[0].clarificationQuestion).toBe("Which of the two did you fit?");
    });
  });

  describe("findings projection", () => {
    it("projects findings with customer decision status and complaint", async () => {
      const { service } = build({
        faults: [
          {
            id: "f1",
            description: "Cracked rotor",
            severity: "CRITICAL",
            code: "BRK-01",
            recommendedService: "Replace front rotors",
            inspectionId: "insp1",
            decisionItems: [{ id: "cd1", decision: "PENDING" }],
          },
          {
            id: "f2",
            description: "Worn wipers",
            severity: "LOW",
            code: null,
            recommendedService: null,
            inspectionId: "insp1",
            decisionItems: [],
          },
          {
            id: "f3",
            description: "Leaking strut",
            severity: "HIGH",
            code: null,
            recommendedService: "Replace strut",
            inspectionId: null,
            decisionItems: [{ id: "cd2", decision: "APPROVED" }],
          },
          {
            id: "f4",
            description: "Cabin filter dirty",
            severity: "LOW",
            code: null,
            recommendedService: null,
            inspectionId: null,
            decisionItems: [{ id: "cd3", decision: "REJECTED" }],
          },
        ],
      });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.complaint).toBe("Brake noise");
      expect(card.findings).toHaveLength(4);
      expect(card.findings[0]).toEqual({
        id: "f1",
        description: "Cracked rotor",
        severity: "CRITICAL",
        code: "BRK-01",
        recommendedService: "Replace front rotors",
        inspectionId: "insp1",
        decisionStatus: "PENDING",
      });
      expect(card.findings[1].decisionStatus).toBe("NOT_REQUESTED");
      expect(card.findings[2].decisionStatus).toBe("APPROVED");
      expect(card.findings[3].decisionStatus).toBe("REJECTED");
    });

    it("scopes findings query by tenantId and workOrderId", async () => {
      const { service, prisma } = build({ faults: [] });

      await service.workCard("tech1", "tenant1", "wo1");

      expect(prisma.fault.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workOrderId: "wo1", tenantId: "tenant1" },
        }),
      );
    });

    it("uses the latest decision item when multiple decision items exist", async () => {
      const { service } = build({
        faults: [
          {
            id: "f1",
            description: "Oil leak",
            severity: "HIGH",
            code: null,
            recommendedService: null,
            inspectionId: "insp1",
            decisionItems: [{ id: "cd2", decision: "APPROVED" }], // newest (take: 1)
          },
        ],
      });

      const card = await service.workCard("tech1", "tenant1", "wo1");

      expect(card.findings[0].decisionStatus).toBe("APPROVED");
    });
  });
});

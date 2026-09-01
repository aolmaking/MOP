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
}) {
  const prisma = {
    workOrder: { findFirst: jest.fn().mockResolvedValue(workOrder(options.order)) },
    partRequest: { findMany: jest.fn().mockResolvedValue(options.parts ?? []) },
  };
  const lifecycle = {
    availableIntents: jest.fn().mockResolvedValue(options.intents ?? []),
    previewGates: jest.fn(),
  };
  const assetHistory = { complaintText: jest.fn().mockResolvedValue(new Map([["wo1", "Brake noise"]])) };
  const policies = { resolveValue: jest.fn().mockResolvedValue("REQUIRED") };
  const capabilities = { resolveCurrent: jest.fn().mockResolvedValue(options.profile ?? {}) };

  const service = new TechnicianWorkViewService(
    prisma as never,
    lifecycle as never,
    assetHistory as never,
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
});

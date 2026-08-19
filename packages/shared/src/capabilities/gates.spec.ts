import { CAPABILITY_REGISTRY } from "./registry";
import { GATE_DEFINITIONS, GATE_KEYS, coreGates, gateDefinition, gatesOwnedBy } from "./gates";
import { validateCapabilityProfile } from "./validator";
import { SHIPPED_PROFILES } from "./profiles";
import type { CapabilityKey } from "./types";

describe("gate registry", () => {
  it("declares every gate exactly once", () => {
    expect(new Set(GATE_KEYS).size).toBe(GATE_KEYS.length);
    expect(GATE_DEFINITIONS.length).toBe(GATE_KEYS.length);
  });

  it("gives every gate a message that tells the reader what to do", () => {
    for (const definition of GATE_DEFINITIONS) {
      expect(definition.blockedMessage.length).toBeGreaterThan(10);
      // A gate message is read by someone who is blocked; "failed" or a
      // bare key tells them nothing actionable.
      expect(definition.blockedMessage).not.toMatch(/^(failed|error|invalid)/i);
    }
  });

  it("assigns every non-core gate to a capability that actually exists", () => {
    for (const definition of GATE_DEFINITIONS) {
      if (definition.owner === null) continue;
      expect(CAPABILITY_REGISTRY.has(definition.owner)).toBe(true);
    }
  });

  it("keeps the approval and acknowledgement gates core, not owned by the portal", () => {
    // Rule 2 of the capability model: the customer portal is a channel,
    // the approval is the business step. If these were owned by
    // CUSTOMER_PORTAL, removing the portal would silently delete consent.
    expect(gateDefinition("customer_decisions_resolved")?.owner).toBeNull();
    expect(gateDefinition("critical_warning_acknowledged")?.owner).toBeNull();
  });
});

describe("capability / gate registry consistency", () => {
  it("keeps each capability's affectedGates identical to what the registry says it owns", () => {
    // The two used to be maintained by hand and could silently disagree.
    for (const [key, definition] of CAPABILITY_REGISTRY) {
      expect(new Set(definition.affectedGates)).toEqual(new Set(gatesOwnedBy(key)));
    }
  });

  it("never lets a capability claim to drop a gate it does not own", () => {
    for (const [key, definition] of CAPABILITY_REGISTRY) {
      const owned = new Set<string>(gatesOwnedBy(key));
      for (const gate of definition.removal?.gatesToDrop ?? []) {
        expect(owned.has(gate)).toBe(true);
      }
    }
  });
});

describe("core gates survive every capability profile", () => {
  it.each(Object.keys(SHIPPED_PROFILES))("%s keeps all core gates", (name) => {
    const dropped = new Set(validateCapabilityProfile(SHIPPED_PROFILES[name]).droppedGates);
    for (const gate of coreGates()) {
      expect(dropped.has(gate)).toBe(false);
    }
  });

  it("keeps core gates even with every removable capability disabled at once", () => {
    // The worst case: strip the workshop to its floor and confirm the
    // floor holds.
    const everythingOff = Object.fromEntries(
      [...CAPABILITY_REGISTRY.keys()].map((key) => [key, "DISABLED" as const]),
    ) as Record<CapabilityKey, "DISABLED">;

    const result = validateCapabilityProfile(everythingOff);
    const dropped = new Set(result.droppedGates);

    for (const gate of coreGates()) expect(dropped.has(gate)).toBe(false);
    // And the work order must still be able to reach a terminal state.
    const workOrder = result.reachability.find((r) => r.entity === "WorkOrder");
    expect(workOrder?.stranded).toEqual([]);
    expect(workOrder?.reachable).toContain("CLOSED");
  });
});

describe("gate ownership resolves the Inventory / Part Returns conflict", () => {
  it("drops the parts-used gate when Inventory goes, despite Part Returns wanting to keep it", () => {
    const result = validateCapabilityProfile({
      INVENTORY: "DISABLED",
      PART_RETURNS: "DISABLED",
      MULTI_WAREHOUSE: "DISABLED",
    });

    expect(result.droppedGates).toContain("parts.received_used_or_returned");
    expect(result.keptGates).not.toContain("parts.received_used_or_returned");
    expect(result.valid).toBe(true);
  });

  it("keeps the parts-used gate when only returns are removed", () => {
    // The same gate must survive here -- parts are still issued, so the
    // check is still meaningful. This is why ownership, not a blanket
    // rule, is the right model.
    const result = validateCapabilityProfile({ PART_RETURNS: "DISABLED" });

    expect(result.droppedGates).toContain("parts.no_pending_return");
    expect(result.droppedGates).not.toContain("parts.received_used_or_returned");
  });
});

describe("gate wording", () => {
  /**
   * A finish checklist renders passed and failed rows side by side, so a
   * gate missing either message falls back to its own key with the
   * separators stripped -- which is how "parts received used or returned"
   * came to sit directly under "Complete the inspection before finishing."
   *
   * This is pinned per gate rather than as a count, so adding a gate
   * without wording fails here rather than in front of a technician.
   */
  it.each(GATE_DEFINITIONS.map((gate) => [gate.key, gate] as const))(
    "%s states both the blocked and the satisfied case",
    (_key, gate) => {
      expect(gate.blockedMessage.trim().length).toBeGreaterThan(0);
      expect(gate.satisfiedMessage.trim().length).toBeGreaterThan(0);

      // Neither may be the key wearing a disguise.
      expect(gate.satisfiedMessage).not.toBe(gate.key);
      expect(gate.satisfiedMessage).not.toContain("_");
      expect(gate.satisfiedMessage).not.toBe(gate.blockedMessage);

      // Written for a person: a sentence, not a fragment.
      expect(gate.satisfiedMessage).toMatch(/^[A-Z].*\.$/);
      expect(gate.blockedMessage).toMatch(/^[A-Z].*\.$/);
    },
  );

  it("gives every declared gate key a definition, so nothing renders raw", () => {
    for (const key of GATE_KEYS) {
      expect(gateDefinition(key)).not.toBeNull();
    }
  });
});

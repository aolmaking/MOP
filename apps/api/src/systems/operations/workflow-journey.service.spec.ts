import { WORK_ORDER_GRAPH } from "@mop/shared";
import { JOURNEY_LABELS, type JourneyAudience } from "./workflow-journey.service";

/**
 * The words, not the projection -- the projection is tested against the
 * graph itself in `packages/shared/src/operations/workflow-journey.spec.ts`.
 *
 * What matters here is that no status can reach a human as an enum. The
 * service falls back to `stage.status` verbatim, so a state added to the
 * graph without a label would show a paying customer "READY_FOR_QC".
 * This is what makes that fail in CI rather than in front of them.
 */
const AUDIENCES: readonly JourneyAudience[] = ["CUSTOMER", "TECHNICIAN", "MANAGER"];

describe("every status has words for every audience", () => {
  it.each(AUDIENCES)("covers all graph states for %s", (audience) => {
    const covered = JOURNEY_LABELS[audience];
    const missing = WORK_ORDER_GRAPH.states.filter((state) => !covered[state]);

    expect(missing).toEqual([]);
  });

  /**
   * Deliberately NOT applied to MANAGER.
   *
   * A manager works an operations board and "In progress" is simply the
   * correct English for IN_PROGRESS -- contorting it into something else
   * to satisfy an assertion would make the product worse. The rule exists
   * to catch a label MECHANICALLY derived from an enum and shown to
   * somebody who does not share our vocabulary, which is the customer
   * and, on the shop floor, the technician.
   */
  it.each(["CUSTOMER", "TECHNICIAN"] as const)("never gives %s a label that is the enum in disguise", (audience) => {
    for (const [status, label] of Object.entries(JOURNEY_LABELS[audience])) {
      // A single-word status like CANCELLED -> "Cancelled" is simply the
      // right word; the rule only bites where there was something to
      // translate.
      if (!status.includes("_")) continue;
      expect(label.toUpperCase().replace(/ /g, "_")).not.toBe(status);
    }
  });

  it.each(AUDIENCES)("gives %s a real sentence, not an identifier", (audience) => {
    for (const label of Object.values(JOURNEY_LABELS[audience])) {
      expect(label).not.toContain("_");
      expect(label.trim()).toBe(label);
      // "QC" is two characters and is exactly what a technician calls it,
      // so the floor is "not empty", not an arbitrary word length.
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("the three vocabularies are genuinely different", () => {
  /**
   * The whole reason three tables exist rather than one. If these ever
   * collapse to the same string, the feature has quietly become a single
   * status label with extra steps.
   */
  it("says something different to each role about the same blocked state", () => {
    const said = AUDIENCES.map((audience) => JOURNEY_LABELS[audience].AWAITING_CUSTOMER_APPROVAL);

    expect(new Set(said).size).toBe(AUDIENCES.length);
    // Case-insensitive: the customer's label leads the sentence ("Your
    // approval"), the technician's does not. What matters is WHOSE move
    // each one says it is, not where the capital letter falls.
    expect(JOURNEY_LABELS.CUSTOMER.AWAITING_CUSTOMER_APPROVAL.toLowerCase()).toContain("your");
    expect(JOURNEY_LABELS.TECHNICIAN.AWAITING_CUSTOMER_APPROVAL.toLowerCase()).toContain("customer");
  });

  it("tells the customer a part wait is about a part, and the technician it is about the store", () => {
    expect(JOURNEY_LABELS.CUSTOMER.WAITING_PARTS).toBe("Waiting for a part");
    expect(JOURNEY_LABELS.TECHNICIAN.WAITING_PARTS).toBe("Waiting on the store");
  });

  it("never tells a customer their finished car is 'closed'", () => {
    // The exact wording bug a previous session fixed on the portal's own
    // status map. It must not come back through this second surface.
    expect(JOURNEY_LABELS.CUSTOMER.CLOSED).toBe("Completed");
  });
});

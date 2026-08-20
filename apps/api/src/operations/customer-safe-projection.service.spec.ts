import { CustomerSafeProjectionService } from "./customer-safe-projection.service";

describe("CustomerSafeProjectionService", () => {
  const service = new CustomerSafeProjectionService();

  it("returns the canned message for a known event key when no text is supplied", () => {
    expect(service.project("part.requested")).toBe(
      "We are waiting for a required part. The branch will update you when it is available.",
    );
  });

  it("matches the canonical spec's own brake-pads worked example", () => {
    // Internal: "Inventory Manager created supplier order for unavailable brake pads."
    const result = service.project("part.requested", "Inventory Manager created supplier order for unavailable brake pads.");
    expect(result).toBe("We are waiting for a required part. The branch will update you when it is available.");
  });

  it("passes through caller-supplied text that contains nothing sensitive", () => {
    const result = service.project("fault.created", "The front brake pads are worn and should be replaced soon.");
    expect(result).toBe("The front brake pads are worn and should be replaced soon.");
  });

  it.each([
    "Waiting on our supplier for this part",
    "Only 2 left in stock quantity",
    "See internal note from technician",
    "Technician performance was slow on this job",
    "Margin on this part is thin",
    "Cost price is higher than usual",
    "Platform control disabled this feature",
  ])("blocks supplied text containing internal-operational language: %s", (text) => {
    const result = service.project("fault.created", text);
    expect(result).not.toBe(text);
    expect(result).toBe("We found something that needs your attention. Check your pending decisions.");
  });

  it("falls back to the generic message for an unknown event key with no supplied text", () => {
    expect(service.project("some.unmapped.event")).toBe(
      "Your service is being updated. We'll notify you of any changes.",
    );
  });
});

/**
 * The canned sentences must be reachable.
 *
 * Every message in SAFE_DEFAULTS was written for a specific moment in a
 * repair, and six of them were keyed on names no service emits -- the
 * contract in `packages/shared/src/contracts/events.ts` says
 * `part.requested` and `payment.recorded`, while Inventory emits
 * `part_request.created` and Finance emits `finance.payment_recorded`.
 * A customer therefore got the generic fallback at exactly the moments
 * the product had something specific to say.
 */
describe("the keys services actually emit are all covered", () => {
  const service = new CustomerSafeProjectionService();

  const EMITTED_ON_THE_CORE_JOURNEY = [
    "work_order.created",
    "customer_decision.requested",
    "customer_decision.responded",
    "part_request.created",
    "part_request.issued",
    "part_request.used",
    "finance.invoice_issued",
    "finance.payment_recorded",
  ];

  it.each(EMITTED_ON_THE_CORE_JOURNEY)("has a written sentence for %s", (eventKey) => {
    const message = service.project(eventKey);
    // The fallback is the failure: it means nobody wrote words for this.
    expect(message).not.toBe("Your service is being updated. We'll notify you of any changes.");
    expect(message.length).toBeGreaterThan(10);
    // Never an identifier leaking into a sentence a customer reads.
    expect(message).not.toContain("_");
  });
});

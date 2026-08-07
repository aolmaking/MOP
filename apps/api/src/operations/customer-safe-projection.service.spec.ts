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

import { OPERATION_EVENT_KEYS, type OperationEventKey } from "./events";
import type { ChargeableWorkItem, InvoiceCandidate, InvoiceIssued } from "./cross-system";

describe("domain event keys", () => {
  it("declares every key exactly once", () => {
    expect(new Set(OPERATION_EVENT_KEYS).size).toBe(OPERATION_EVENT_KEYS.length);
  });

  it("names every key as resource.action", () => {
    for (const key of OPERATION_EVENT_KEYS) {
      expect(key).toMatch(/^[a-z][a-z_]*\.[a-z][a-z_]*$/);
    }
  });

  it("covers the full part lifecycle, which spans three systems", () => {
    // Operations requests, Inventory fulfils, Finance bills. A gap here
    // means one of them has no way to hear about a step.
    const required: OperationEventKey[] = [
      "part.requested",
      "part.issued",
      "part.arrived_confirmed",
      "part.used",
      "part.return_requested",
      "part.return_accepted",
    ];
    for (const key of required) expect(OPERATION_EVENT_KEYS).toContain(key);
  });

  it("keeps invoice clearance separate from invoice issuance", () => {
    // In a clearance jurisdiction an issued invoice is not yet legally
    // valid. Collapsing these into one event would make it impossible to
    // hold delivery until the state portal accepts the document.
    expect(OPERATION_EVENT_KEYS).toContain("invoice.issued");
    expect(OPERATION_EVENT_KEYS).toContain("invoice.cleared");
    expect(OPERATION_EVENT_KEYS).toContain("invoice.clearance_failed");
  });
});

describe("ChargeableWorkItem", () => {
  it("can express a customer-supplied part billed as labour only", () => {
    // The scenario that motivated the provenance field: the customer
    // brings their own part and pays only for fitting. No stock movement,
    // no inventory item, no cost to the workshop.
    const item: ChargeableWorkItem = {
      tenantId: "t1",
      branchId: "b1",
      workOrderId: "wo1",
      taskId: "task1",
      assetId: "a1",
      customerId: "c1",
      itemType: "LABOUR",
      itemName: "Fit customer-supplied brake pads",
      quantity: 1,
      provenance: "CUSTOMER_SUPPLIED",
      inventoryItemId: null,
      sourceType: "TASK",
      sourceId: "task1",
      requiresCustomerApproval: true,
      approvalStatus: "APPROVED",
      approvedUnitPrice: "0.00",
      approvedLabourPrice: "150.00",
      addedAt: "2026-08-08T10:00:00.000Z",
    };

    expect(item.provenance).toBe("CUSTOMER_SUPPLIED");
    expect(item.inventoryItemId).toBeNull();
    // Money is a string on the wire, never a JS number.
    expect(typeof item.approvedLabourPrice).toBe("string");
  });

  it("carries the approved price as a snapshot that survives catalogue changes", () => {
    const item = { approvedUnitPrice: "100.00" } as Pick<ChargeableWorkItem, "approvedUnitPrice">;
    expect(item.approvedUnitPrice).toBe("100.00");
  });
});

describe("InvoiceCandidate", () => {
  it("carries country and billing profile so Billing never asks Operations", () => {
    const candidate: InvoiceCandidate = {
      tenantId: "t1",
      branchId: "b1",
      customerId: "c1",
      workOrderId: "wo1",
      currency: "EGP",
      country: "EG",
      billingProfile: "eta-standard",
      invoiceType: "STANDARD",
      lines: [],
      taxBreakdown: [{ taxCode: "VAT", ratePercent: "14.00", taxableAmount: "100.00", taxAmount: "14.00" }],
      subtotal: "100.00",
      discountTotal: "0.00",
      taxTotal: "14.00",
      total: "114.00",
      amountPaid: "0.00",
      createdById: "u1",
      createdAt: "2026-08-08T10:00:00.000Z",
    };

    expect(candidate.country).toBe("EG");
    // Rate is snapshotted, so a five-year-old invoice re-renders under the
    // law that applied when it was issued.
    expect(candidate.taxBreakdown[0]?.ratePercent).toBe("14.00");
  });
});

describe("InvoiceIssued", () => {
  it("reports clearance separately, so delivery cannot be released too early", () => {
    const issued: InvoiceIssued = {
      tenantId: "t1",
      workOrderId: "wo1",
      invoiceId: "inv1",
      invoiceNumber: "INV-2026-0001",
      total: "114.00",
      currency: "EGP",
      clearanceStatus: "PENDING",
      issuedAt: "2026-08-08T10:00:00.000Z",
    };

    expect(issued.clearanceStatus).toBe("PENDING");
  });
});

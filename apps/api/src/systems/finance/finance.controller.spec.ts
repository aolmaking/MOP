import { ForbiddenException } from "@nestjs/common";
import { createSession } from "../../identity/access/test-support/session-fixture";
import { FinanceController } from "./finance.controller";

function harness(allowed = true) {
  const finance = {
    settlement: jest.fn().mockResolvedValue({ invoiceId: "invoice-1", total: "100.00", paid: "0.00", outstanding: "100.00" }),
    approveRefund: jest.fn().mockResolvedValue({ id: "refund-1", creditNoteNumber: "CN-000001" }),
    rejectRefund: jest.fn().mockResolvedValue({ id: "refund-1", status: "REJECTED" }),
    approveDiscount: jest.fn().mockResolvedValue({ id: "discount-1", status: "APPROVED" }),
    rejectDiscount: jest.fn().mockResolvedValue({ id: "discount-1", status: "REJECTED" }),
  };
  const access = { can: jest.fn().mockResolvedValue(allowed) };
  const controller = new FinanceController(finance as never, access as never);
  const session = createSession({
    tenantId: "tenant-1",
    accountId: "finance-1",
    displayName: "Finance Manager",
    role: "TENANT_ADMIN",
  });
  return { controller, finance, access, session };
}

describe("FinanceController tenant-scoped calls", () => {
  it("passes the current session tenant into settlement reads", async () => {
    const { controller, finance, access, session } = harness();

    await controller.settlement(session, "invoice-1");

    expect(access.can).toHaveBeenCalledWith(session, "finance.payment.record");
    expect(finance.settlement).toHaveBeenCalledWith("invoice-1", "tenant-1");
  });

  it("passes the current session tenant into refund decisions", async () => {
    const { controller, finance, session } = harness();

    await controller.approveRefund(session, "refund-1");
    await controller.rejectRefund(session, "refund-2", { reason: "Missing receipt" });

    expect(finance.approveRefund).toHaveBeenCalledWith(
      "refund-1",
      { accountId: "finance-1", displayName: "Finance Manager", actorType: "TENANT_STAFF" },
      "tenant-1",
    );
    expect(finance.rejectRefund).toHaveBeenCalledWith(
      "refund-2",
      { accountId: "finance-1", displayName: "Finance Manager", actorType: "TENANT_STAFF" },
      "Missing receipt",
      "tenant-1",
    );
  });

  it("passes the current session tenant into discount decisions", async () => {
    const { controller, finance, session } = harness();

    await controller.approveDiscount(session, "discount-1");
    await controller.rejectDiscount(session, "discount-2", { reason: "Too high" });

    expect(finance.approveDiscount).toHaveBeenCalledWith(
      "discount-1",
      { accountId: "finance-1", displayName: "Finance Manager", actorType: "TENANT_STAFF" },
      "tenant-1",
    );
    expect(finance.rejectDiscount).toHaveBeenCalledWith(
      "discount-2",
      { accountId: "finance-1", displayName: "Finance Manager", actorType: "TENANT_STAFF" },
      "Too high",
      "tenant-1",
    );
  });

  it("does not call FinanceService when access is denied", async () => {
    const { controller, finance, session } = harness(false);

    await expect(controller.settlement(session, "invoice-1")).rejects.toBeInstanceOf(ForbiddenException);

    expect(finance.settlement).not.toHaveBeenCalled();
  });

  it("does not call FinanceService when the session has no tenant", async () => {
    const { controller, finance, session } = harness();
    const platformLike = { ...session, tenantId: null };

    await expect(controller.settlement(platformLike, "invoice-1")).rejects.toBeInstanceOf(ForbiddenException);

    expect(finance.settlement).not.toHaveBeenCalled();
  });
});

import { DEFAULT_ROLE_PERMISSIONS } from "@mop/shared";

/**
 * docs/detailed-specs/tenant-owner.md gives the Owner "a company-wide
 * Work Orders view -- read-only summary; actually working a Work Order is
 * Branch Manager/Technician territory".
 *
 * Before this was granted, the Owner -- the one person who owns the
 * workshop -- opened the operational shortcuts on their own Home page and
 * got "You don't have access to branch operations." The fix is narrow on
 * purpose, and this test is what keeps it narrow: `workorders.branch.view`
 * guards GET routes only (attention, board, work-order detail, approvals,
 * delivery), while every mutation those pages can trigger is gated by a
 * different key. If someone later widens the Owner's grant to make an
 * action "just work", this fails.
 */
describe("TENANT_OWNER operational visibility", () => {
  const granted = DEFAULT_ROLE_PERMISSIONS.TENANT_OWNER ?? {};

  it("can read branch operations", () => {
    expect(granted["workorders.branch.view" as keyof typeof granted]).toBe(true);
  });

  it("cannot perform any branch operation it can now see", () => {
    for (const forbidden of [
      "customer.intake.create",
      "customer_decision.record_on_behalf",
      "workorders.branch.reassign_technician",
      "workorders.branch.manage_blockers",
      "task.complete",
      "task.review",
      "parts.issue",
    ]) {
      expect(granted[forbidden as keyof typeof granted]).not.toBe(true);
    }
  });
});

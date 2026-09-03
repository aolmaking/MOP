/**
 * The recommendation truth model, tested where it is decided.
 *
 * These are unit tests on purpose. The rule they cover -- "never call
 * something performed because it was recommended" -- is a product
 * decision, not a query, and it must be provable without a database so
 * that a change to it fails here loudly rather than inside a
 * three-minute integration run.
 *
 * Every case below is a state a real workshop reaches.
 */
import { resolveOutcome, UNRESOLVED_OUTCOMES, type OutcomeInputTask } from "./recommendation-outcome";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const SENT = new Date("2026-09-01T09:00:00.000Z");
const DECIDED = new Date("2026-09-01T10:30:00.000Z");

function task(overrides: Partial<OutcomeInputTask> = {}): OutcomeInputTask {
  return {
    id: "task-1",
    title: "Replace front brake discs",
    status: "DONE",
    createdAt: new Date("2026-09-01T11:00:00.000Z"),
    updatedAt: new Date("2026-09-01T15:00:00.000Z"),
    ...overrides,
  };
}

function input(overrides: Partial<Parameters<typeof resolveOutcome>[0]> = {}) {
  return resolveOutcome({
    decision: "APPROVED",
    decidedAt: DECIDED,
    requestStatus: "RESPONDED",
    sentAt: SENT,
    viewedAt: null,
    respondedAt: DECIDED,
    expiresAt: null,
    workOrderStatus: "CLOSED",
    workOrderClosedAt: new Date("2026-09-02T09:00:00.000Z"),
    tasks: [],
    now: NOW,
    ...overrides,
  });
}

describe("resolveOutcome", () => {
  it("never reports PERFORMED for a recommendation that was merely approved", () => {
    const result = input({ tasks: [] });

    expect(result.outcome).toBe("APPROVED_NO_WORK_LINKED");
    expect(result.outcome).not.toBe("PERFORMED");
    expect(result.evidence.map((e) => e.text)).toContain("No work on this job is linked to this recommendation");
  });

  it("reports PERFORMED only when every linked task is done", () => {
    expect(input({ tasks: [task()] }).outcome).toBe("PERFORMED");
    expect(input({ tasks: [task(), task({ id: "task-2", status: "ASSIGNED" })] }).outcome).toBe("PARTIALLY_PERFORMED");
  });

  it("treats a cancelled task as work the workshop never intended to finish", () => {
    const result = input({ tasks: [task(), task({ id: "task-2", status: "CANCELLED" })] });
    expect(result.outcome).toBe("PERFORMED");
  });

  it("reports NOT_PERFORMED when the job ended with the planned work undone", () => {
    const result = input({ tasks: [task({ status: "ASSIGNED" })] });

    expect(result.outcome).toBe("NOT_PERFORMED");
    expect(result.evidence.map((e) => e.text)).toContain("The job ended with none of this work completed");
  });

  it("distinguishes planned-but-not-started from in-progress while the job is still open", () => {
    const open = { workOrderStatus: "IN_PROGRESS", workOrderClosedAt: null };

    expect(input({ ...open, tasks: [task({ status: "ASSIGNED" })] }).outcome).toBe("APPROVED_PLANNED");
    expect(input({ ...open, tasks: [task({ status: "IN_PROGRESS" })] }).outcome).toBe("APPROVED_IN_PROGRESS");
  });

  it("reports the customer's own answer without reinterpreting it", () => {
    expect(input({ decision: "REJECTED" }).outcome).toBe("DECLINED");
    expect(input({ decision: "PENDING", respondedAt: null, requestStatus: "SENT" }).outcome).toBe("AWAITING_CUSTOMER");
  });

  it("reports an unanswered request that ran out of time as EXPIRED, not declined", () => {
    const result = input({
      decision: "PENDING",
      respondedAt: null,
      requestStatus: "SENT",
      expiresAt: new Date("2026-09-02T09:00:00.000Z"),
    });

    expect(result.outcome).toBe("EXPIRED");
    expect(result.outcome).not.toBe("DECLINED");
  });

  it("does not put words in a customer's mouth when the workshop cancelled the ask", () => {
    const result = input({ decision: "PENDING", respondedAt: null, requestStatus: "CANCELLED" });

    expect(result.outcome).toBe("CANCELLED");
    expect(result.outcome).not.toBe("DECLINED");
  });

  it("still reports a decided item inside a cancelled request as decided", () => {
    // The workshop cancelling the remainder of a request must not erase
    // an answer the customer already gave on one of its items.
    expect(input({ decision: "REJECTED", requestStatus: "CANCELLED" }).outcome).toBe("DECLINED");
  });

  it("carries the evidence for every answer it gives", () => {
    const result = input({ tasks: [task()] });

    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.map((e) => e.text)).toEqual(
      expect.arrayContaining(["Sent to the customer", "Customer approved this item"]),
    );
    // A timestamp is either a real one from the record or null. Nothing
    // in this module may date a historical fact "now".
    for (const item of result.evidence) {
      expect(item.at === null || !Number.isNaN(Date.parse(item.at))).toBe(true);
      expect(item.at).not.toBe(NOW.toISOString());
    }
  });

  it("never lists a performed item as unresolved", () => {
    expect(UNRESOLVED_OUTCOMES).not.toContain("PERFORMED");
    expect(UNRESOLVED_OUTCOMES).toContain("NOT_PERFORMED");
  });
});

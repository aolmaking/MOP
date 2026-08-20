import { workflowJourney } from "./workflow-journey";
import { WORK_ORDER_GRAPH } from "../capabilities/workflow-graphs";
import type { CapabilityProfile } from "../capabilities/types";

/**
 * The claim under test: the strip a workshop sees is generated from its
 * own capabilities, not from a fixed picture of one workshop's process.
 *
 * These are the tests that would fail if somebody replaced the projection
 * with a hardcoded list of stages -- which is exactly what a workflow
 * animation usually is, and exactly what this must never become.
 */

/**
 * `CapabilityProfile` is a flat map in which an ABSENT key means active
 * (`isCapabilityActive` returns true for undefined), so a workshop is
 * described by what it has switched OFF. The first version of this helper
 * listed what was on and disabled nothing -- every test passed against a
 * fully-enabled workshop and proved nothing about capability filtering.
 */
function without(...disabled: readonly string[]): CapabilityProfile {
  return Object.fromEntries(disabled.map((key) => [key, "DISABLED"])) as CapabilityProfile;
}

const EVERYTHING = without();

const statuses = (result: { stages: readonly { status: string }[] }) => result.stages.map((stage) => stage.status);

describe("the route ahead comes from the workshop's own graph", () => {
  it("routes a full-capability workshop through review, QC and payment", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "IN_PROGRESS");

    expect(statuses(journey)).toEqual([
      "IN_PROGRESS",
      "READY_FOR_TEAM_REVIEW",
      "READY_FOR_QC",
      "PAYMENT_PENDING",
      "READY_FOR_DELIVERY",
      "CLOSED",
    ]);
  });

  it("has no QC stage at all in a workshop without QC -- not a hidden one", () => {
    const journey = workflowJourney(
      WORK_ORDER_GRAPH,
      without("QC"),
      "IN_PROGRESS",
    );

    expect(statuses(journey)).not.toContain("READY_FOR_QC");
    expect(statuses(journey)).toContain("READY_FOR_TEAM_REVIEW");
  });

  it("drops straight to delivery in a workshop with neither review, QC nor finance", () => {
    const journey = workflowJourney(
      WORK_ORDER_GRAPH,
      without("TEAM_REVIEW", "QC", "FINANCE_CORE"),
      "IN_PROGRESS",
    );

    expect(statuses(journey)).not.toContain("READY_FOR_TEAM_REVIEW");
    expect(statuses(journey)).not.toContain("READY_FOR_QC");
    expect(statuses(journey)).not.toContain("PAYMENT_PENDING");
    expect(statuses(journey)[statuses(journey).length - 1]).toBe("CLOSED");
  });

  it("never routes a job toward CANCELLED, though the graph allows it from almost anywhere", () => {
    for (const status of ["REGISTERED", "UNDER_INSPECTION", "IN_PROGRESS", "APPROVED_FOR_WORK"]) {
      const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, status);
      expect(statuses(journey)).not.toContain("CANCELLED");
    }
  });
});

describe("where the job is now", () => {
  it("marks a parts wait as WAITING, not as progress", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "WAITING_PARTS");
    const current = journey.stages.find((stage) => stage.status === "WAITING_PARTS");

    expect(current?.state).toBe("WAITING");
    expect(journey.waiting).toBe(true);
  });

  it("marks active work as CURRENT", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "IN_PROGRESS");

    expect(journey.stages.find((stage) => stage.status === "IN_PROGRESS")?.state).toBe("CURRENT");
    expect(journey.waiting).toBe(false);
  });

  it("reports a closed job as finished with nothing ahead of it", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "CLOSED");

    expect(journey.finished).toBe(true);
    expect(journey.stages.every((stage) => stage.state === "DONE")).toBe(true);
  });

  it("still reports a cancelled job as finished rather than routing out of it", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "CANCELLED");

    expect(journey.finished).toBe(true);
    expect(statuses(journey)).toEqual(["CANCELLED"]);
  });
});

describe("what already happened is history, not a guess", () => {
  it("puts real transitions behind the current stage, with their timestamps", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "IN_PROGRESS", [
      { status: "REGISTERED", at: "2026-08-01T09:00:00.000Z" },
      { status: "UNDER_INSPECTION", at: "2026-08-01T10:00:00.000Z" },
      { status: "APPROVED_FOR_WORK", at: "2026-08-01T11:00:00.000Z" },
    ]);

    const done = journey.stages.filter((stage) => stage.state === "DONE");
    expect(done.map((stage) => stage.status)).toEqual(["REGISTERED", "UNDER_INSPECTION", "APPROVED_FOR_WORK"]);
    expect(done[0].at).toBe("2026-08-01T09:00:00.000Z");
  });

  it("draws a job that bounced through a stage twice only once", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "IN_PROGRESS", [
      { status: "IN_PROGRESS", at: "2026-08-01T11:00:00.000Z" },
      { status: "BLOCKED", at: "2026-08-01T12:00:00.000Z" },
      { status: "IN_PROGRESS", at: "2026-08-01T13:00:00.000Z" },
    ]);

    expect(statuses(journey).filter((status) => status === "IN_PROGRESS")).toHaveLength(1);
    expect(statuses(journey).filter((status) => status === "BLOCKED")).toHaveLength(1);
  });

  it("keeps the first time a stage was reached, not the latest", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "BLOCKED", [
      { status: "IN_PROGRESS", at: "2026-08-01T11:00:00.000Z" },
      { status: "BLOCKED", at: "2026-08-01T12:00:00.000Z" },
      { status: "IN_PROGRESS", at: "2026-08-01T13:00:00.000Z" },
    ]);

    expect(journey.stages.find((stage) => stage.status === "IN_PROGRESS")?.at).toBe("2026-08-01T11:00:00.000Z");
  });
});

describe("optional stages are not drawn on jobs that do not need them", () => {
  it("routes past customer approval when the caller says this job does not need it", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "UNDER_INSPECTION", [], {
      skipAhead: ["AWAITING_CUSTOMER_APPROVAL"],
    });

    expect(statuses(journey)).not.toContain("AWAITING_CUSTOMER_APPROVAL");
    expect(statuses(journey)).toContain("APPROVED_FOR_WORK");
  });

  it("draws customer approval when the job does need it", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "UNDER_INSPECTION");

    expect(statuses(journey)).toContain("AWAITING_CUSTOMER_APPROVAL");
  });

  it("still draws a skipped stage when it is the ONLY way forward", () => {
    // Nothing leaves PAYMENT_PENDING except SETTLE_PAYMENT. Refusing to
    // draw the only path would be a worse lie than drawing an optional
    // stage, so the skip is ignored here.
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "PAYMENT_PENDING", [], {
      skipAhead: ["READY_FOR_DELIVERY"],
    });

    expect(statuses(journey)).toContain("READY_FOR_DELIVERY");
  });

  it("never invents a stage the workshop's graph does not have, skip or no skip", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, without("QC"), "IN_PROGRESS", [], {
      skipAhead: ["AWAITING_CUSTOMER_APPROVAL"],
    });

    expect(statuses(journey)).not.toContain("READY_FOR_QC");
  });
});

describe("stopped is not one state", () => {
  it("calls a blocker BLOCKED, not merely waiting", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "BLOCKED");

    expect(journey.blocked).toBe(true);
    expect(journey.waiting).toBe(false);
    expect(journey.stages.find((s) => s.status === "BLOCKED")?.state).toBe("BLOCKED");
  });

  it("calls a failed QC blocked too -- something went wrong, nobody is merely waiting", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "QC_FAILED");
    expect(journey.blocked).toBe(true);
  });

  it("calls a job sitting at review WAITING -- it is healthy, somebody owes it a look", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "READY_FOR_TEAM_REVIEW");

    expect(journey.waiting).toBe(true);
    expect(journey.blocked).toBe(false);
  });

  it("calls an unpaid invoice WAITING, not blocked", () => {
    const journey = workflowJourney(WORK_ORDER_GRAPH, EVERYTHING, "PAYMENT_PENDING");
    expect(journey.waiting).toBe(true);
    expect(journey.blocked).toBe(false);
  });
});

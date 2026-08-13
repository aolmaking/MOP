import { averageMsByStatus, computeStatusDurations, type WorkOrderDurations } from "./lifecycle-duration.util";

const HOUR = 60 * 60 * 1000;

describe("computeStatusDurations", () => {
  it("attributes each span to the status it just entered, up to the next transition", () => {
    const events = [
      { workOrderId: "wo1", from: "DRAFT", to: "REGISTERED", at: new Date("2026-01-01T00:00:00Z") },
      { workOrderId: "wo1", from: "REGISTERED", to: "IN_PROGRESS", at: new Date("2026-01-01T02:00:00Z") },
      { workOrderId: "wo1", from: "IN_PROGRESS", to: "CLOSED", at: new Date("2026-01-01T05:00:00Z") },
    ];

    const [result] = computeStatusDurations(events, new Date("2026-01-02T00:00:00Z"));

    expect(result!.msByStatus["REGISTERED"]).toBe(2 * HOUR);
    expect(result!.msByStatus["IN_PROGRESS"]).toBe(3 * HOUR);
    // CLOSED is terminal and has no next event -- duration runs to `asOf`.
    expect(result!.msByStatus["CLOSED"]).toBe(19 * HOUR);
    expect(result!.totalMs).toBe(24 * HOUR);
  });

  it("closes an open (non-terminal) work order's current status out at `asOf`, not zero", () => {
    const events = [{ workOrderId: "wo2", from: "DRAFT", to: "WAITING_PARTS", at: new Date("2026-01-01T00:00:00Z") }];
    const [result] = computeStatusDurations(events, new Date("2026-01-01T10:00:00Z"));
    expect(result!.msByStatus["WAITING_PARTS"]).toBe(10 * HOUR);
  });

  it("keeps separate work orders' histories independent", () => {
    const events = [
      { workOrderId: "a", from: "DRAFT", to: "IN_PROGRESS", at: new Date("2026-01-01T00:00:00Z") },
      { workOrderId: "b", from: "DRAFT", to: "IN_PROGRESS", at: new Date("2026-01-01T00:00:00Z") },
    ];
    const results = computeStatusDurations(events, new Date("2026-01-01T02:00:00Z"));
    expect(results).toHaveLength(2);
  });

  it("returns an empty array for no events, never throws", () => {
    expect(computeStatusDurations([], new Date())).toEqual([]);
  });
});

describe("averageMsByStatus", () => {
  it("averages only across work orders that actually entered that status", () => {
    const durations: WorkOrderDurations[] = [
      { workOrderId: "a", msByStatus: { WAITING_PARTS: 4 * HOUR }, totalMs: 4 * HOUR },
      { workOrderId: "b", msByStatus: { WAITING_PARTS: 2 * HOUR }, totalMs: 2 * HOUR },
      { workOrderId: "c", msByStatus: { IN_PROGRESS: 10 * HOUR }, totalMs: 10 * HOUR },
    ];
    const averages = averageMsByStatus(durations);
    expect(averages["WAITING_PARTS"]).toBe(3 * HOUR);
    expect(averages["IN_PROGRESS"]).toBe(10 * HOUR);
  });

  it("returns an empty object for no data", () => {
    expect(averageMsByStatus([])).toEqual({});
  });
});

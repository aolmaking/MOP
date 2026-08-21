import { detectStatusLoops } from "./loop-detection.util";

describe("detectStatusLoops", () => {
  it("flags a status re-entered after already having been left", () => {
    const events = [
      { workOrderId: "wo1", from: "APPROVED_FOR_WORK", to: "IN_PROGRESS", at: new Date("2026-01-01T00:00:00Z") },
      { workOrderId: "wo1", from: "IN_PROGRESS", to: "READY_FOR_QC", at: new Date("2026-01-01T02:00:00Z") },
      { workOrderId: "wo1", from: "READY_FOR_QC", to: "QC_FAILED", at: new Date("2026-01-01T03:00:00Z") },
      { workOrderId: "wo1", from: "QC_FAILED", to: "IN_PROGRESS", at: new Date("2026-01-01T04:00:00Z") },
    ];

    const loops = detectStatusLoops(events);
    expect(loops).toEqual([{ workOrderId: "wo1", reenteredStatus: "IN_PROGRESS", count: 2 }]);
  });

  it("does not flag a normal, single-pass lifecycle", () => {
    const events = [
      { workOrderId: "wo2", from: "DRAFT", to: "REGISTERED", at: new Date("2026-01-01T00:00:00Z") },
      { workOrderId: "wo2", from: "REGISTERED", to: "IN_PROGRESS", at: new Date("2026-01-01T01:00:00Z") },
      { workOrderId: "wo2", from: "IN_PROGRESS", to: "CLOSED", at: new Date("2026-01-01T02:00:00Z") },
    ];
    expect(detectStatusLoops(events)).toEqual([]);
  });

  it("keeps different work orders' loop counts independent", () => {
    const events = [
      { workOrderId: "a", from: "X", to: "Y", at: new Date("2026-01-01T00:00:00Z") },
      { workOrderId: "a", from: "Y", to: "Z", at: new Date("2026-01-01T01:00:00Z") },
      { workOrderId: "a", from: "Z", to: "Y", at: new Date("2026-01-01T02:00:00Z") },
      { workOrderId: "b", from: "X", to: "Y", at: new Date("2026-01-01T00:00:00Z") },
    ];
    const loops = detectStatusLoops(events);
    expect(loops).toEqual([{ workOrderId: "a", reenteredStatus: "Y", count: 2 }]);
  });

  it("returns an empty array for no events", () => {
    expect(detectStatusLoops([])).toEqual([]);
  });
});

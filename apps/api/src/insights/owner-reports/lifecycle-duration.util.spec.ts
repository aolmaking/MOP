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

  it("preserves initial status duration before the first recorded transition when meta is supplied", () => {
    const createdAt = new Date("2026-01-01T08:00:00Z");
    const registeredAt = new Date("2026-01-01T09:30:00Z"); // 1.5h in DRAFT
    const inProgressAt = new Date("2026-01-01T11:00:00Z"); // 1.5h in REGISTERED
    const closedAt = new Date("2026-01-01T14:00:00Z"); // 3.0h in IN_PROGRESS

    const events = [
      { workOrderId: "wo-initial", from: "DRAFT", to: "REGISTERED", at: registeredAt },
      { workOrderId: "wo-initial", from: "REGISTERED", to: "IN_PROGRESS", at: inProgressAt },
      { workOrderId: "wo-initial", from: "IN_PROGRESS", to: "CLOSED", at: closedAt },
    ];

    const metas = [{ workOrderId: "wo-initial", createdAt, initialStatus: "DRAFT", closedAt }];
    const [result] = computeStatusDurations(events, new Date("2026-01-02T00:00:00Z"), metas);

    expect(result).toBeDefined();
    expect(result!.msByStatus["DRAFT"]).toBe(1.5 * HOUR);
    expect(result!.msByStatus["REGISTERED"]).toBe(1.5 * HOUR);
    expect(result!.msByStatus["IN_PROGRESS"]).toBe(3.0 * HOUR);
    expect(result!.activeWorkMs).toBe(3.0 * HOUR);
    expect(result!.waitingMs).toBe(3.0 * HOUR); // DRAFT (1.5h) + REGISTERED (1.5h)
    expect(result!.bottleneckStatus).toBe("IN_PROGRESS");
  });

  it("computes duration for work orders that have zero events yet", () => {
    const createdAt = new Date("2026-01-01T08:00:00Z");
    const asOf = new Date("2026-01-01T12:00:00Z");
    const metas = [{ workOrderId: "wo-new", createdAt, initialStatus: "DRAFT" }];

    const [result] = computeStatusDurations([], asOf, metas);
    expect(result).toBeDefined();
    expect(result!.msByStatus["DRAFT"]).toBe(4 * HOUR);
    expect(result!.waitingMs).toBe(4 * HOUR);
    expect(result!.activeWorkMs).toBe(0);
  });

  it("returns an empty array for no events and no metas, never throws", () => {
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

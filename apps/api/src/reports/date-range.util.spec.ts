import { resolveDateRange, previousPeriod } from "./date-range.util";

describe("resolveDateRange", () => {
  it("ends at the end of today, not at the calling instant", () => {
    // The bug this pins: `to` used to be `new Date()`, so a row written a
    // few milliseconds after the report was built fell outside a window
    // that claims to cover "up to now". Found in production analytics as
    // a technician showing 0% rework while demonstrably having a rework
    // task -- assignedAt .809 against a range.to of .804.
    const { to } = resolveDateRange({});
    const now = new Date();

    expect(to.getTime()).toBeGreaterThan(now.getTime());
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);
  });

  it("includes a row written immediately after the range was resolved", () => {
    const { from, to } = resolveDateRange({});
    // Anything the application writes during this request must fall
    // inside the window it just computed.
    const writtenNow = new Date();

    expect(writtenNow >= from).toBe(true);
    expect(writtenNow <= to).toBe(true);
  });

  it("still honours an explicit `to` exactly, so a caller can ask for a closed period", () => {
    const explicit = "2026-03-15T10:00:00.000Z";
    const { to } = resolveDateRange({ to: explicit });
    expect(to.toISOString()).toBe(explicit);
  });

  it("defaults to a 30-day window", () => {
    const { from, to } = resolveDateRange({});
    const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(30);
  });

  it("rejects a reversed range rather than silently returning nothing", () => {
    expect(() => resolveDateRange({ from: "2026-05-01", to: "2026-04-01" })).toThrow("date_range_reversed");
  });

  it("previousPeriod is the immediately preceding window of the same length", () => {
    const range = resolveDateRange({ from: "2026-04-01T00:00:00.000Z", to: "2026-04-11T00:00:00.000Z" });
    const prev = previousPeriod(range);
    expect(prev.to.toISOString()).toBe(range.from.toISOString());
    expect(prev.from.toISOString()).toBe("2026-03-22T00:00:00.000Z");
  });
});

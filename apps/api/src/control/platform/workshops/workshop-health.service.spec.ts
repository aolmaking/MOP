import { WorkshopHealthService } from "./workshop-health.service";

describe("WorkshopHealthService", () => {
  const service = new WorkshopHealthService();
  const NOW = new Date("2026-08-08T00:00:00.000Z");

  function daysAgo(days: number): Date {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  }

  it("is HEALTHY when the owner logged in recently, staff are active, and nothing else is wrong", () => {
    const result = service.evaluate(
      {
        ownerLastLoginAt: daysAgo(1),
        staffLastActivityAt: daysAgo(1),
        ownerFailedLoginCount: 0,
        frozenOrSuspendedInLast90Days: false,
      },
      NOW,
    );

    expect(result.status).toBe("HEALTHY");
    expect(result.warnings).toEqual([]);
  });

  it("is CRITICAL when the owner has never logged in", () => {
    const result = service.evaluate(
      { ownerLastLoginAt: null, staffLastActivityAt: null, ownerFailedLoginCount: 0, frozenOrSuspendedInLast90Days: false },
      NOW,
    );

    expect(result.status).toBe("CRITICAL");
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "owner_never_logged_in" }));
  });

  it("is CRITICAL when the owner has been inactive 30+ days", () => {
    const result = service.evaluate(
      { ownerLastLoginAt: daysAgo(31), staffLastActivityAt: daysAgo(1), ownerFailedLoginCount: 0, frozenOrSuspendedInLast90Days: false },
      NOW,
    );

    expect(result.status).toBe("CRITICAL");
  });

  it("is CRITICAL when frozen or suspended within the last 90 days, even if otherwise healthy", () => {
    const result = service.evaluate(
      { ownerLastLoginAt: daysAgo(1), staffLastActivityAt: daysAgo(1), ownerFailedLoginCount: 0, frozenOrSuspendedInLast90Days: true },
      NOW,
    );

    expect(result.status).toBe("CRITICAL");
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "recent_freeze_or_suspend" }));
  });

  it("is AT_RISK (not CRITICAL) for a shorter owner-inactivity window", () => {
    const result = service.evaluate(
      { ownerLastLoginAt: daysAgo(20), staffLastActivityAt: daysAgo(1), ownerFailedLoginCount: 0, frozenOrSuspendedInLast90Days: false },
      NOW,
    );

    expect(result.status).toBe("AT_RISK");
  });

  it("is AT_RISK on a failed-login spike alone", () => {
    const result = service.evaluate(
      { ownerLastLoginAt: daysAgo(1), staffLastActivityAt: daysAgo(1), ownerFailedLoginCount: 4, frozenOrSuspendedInLast90Days: false },
      NOW,
    );

    expect(result.status).toBe("AT_RISK");
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "failed_login_spike" }));
  });

  it("every warning behind an AT_RISK/CRITICAL badge is itemized, never just the badge with no explanation", () => {
    const result = service.evaluate(
      { ownerLastLoginAt: daysAgo(20), staffLastActivityAt: daysAgo(20), ownerFailedLoginCount: 5, frozenOrSuspendedInLast90Days: false },
      NOW,
    );

    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });
});

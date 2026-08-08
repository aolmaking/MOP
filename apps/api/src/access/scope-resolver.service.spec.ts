import { ScopeResolverService } from "./scope-resolver.service";
import { createSession } from "./test-support/session-fixture";

describe("ScopeResolverService", () => {
  const service = new ScopeResolverService();

  it("builds an `in` filter on the given field from the session's branch scope", () => {
    const session = createSession({ branchScope: ["branch-1", "branch-2"] });

    expect(service.filterBy(session, "branch", "branchId")).toEqual({
      branchId: { in: ["branch-1", "branch-2"] },
    });
  });

  it("builds an `in` filter from the session's warehouse scope", () => {
    const session = createSession({ warehouseScope: ["wh-1"] });

    expect(service.filterBy(session, "warehouse", "warehouseId")).toEqual({
      warehouseId: { in: ["wh-1"] },
    });
  });

  it("builds an `in` filter from the session's category scope", () => {
    const session = createSession({ categoryScope: ["CARS"] });

    expect(service.filterBy(session, "category", "categoryCode")).toEqual({
      categoryCode: { in: ["CARS"] },
    });
  });

  it("builds an `in` filter from the session's team scope", () => {
    const session = createSession({ teamScope: ["team-1"] });

    expect(service.filterBy(session, "team", "teamId")).toEqual({
      teamId: { in: ["team-1"] },
    });
  });

  it("builds an `in` filter from the session's managed-technician list (Team Leader scoping)", () => {
    const session = createSession({ managedTechnicianIds: ["tech-1", "tech-2"] });

    expect(service.filterBy(session, "managedTechnician", "assignedTechnicianId")).toEqual({
      assignedTechnicianId: { in: ["tech-1", "tech-2"] },
    });
  });

  it("produces an `in: []` filter (matches zero rows) for a scoped role with no scope assigned, rather than matching everything", () => {
    const session = createSession({ branchScope: [] });

    expect(service.filterBy(session, "branch", "branchId")).toEqual({
      branchId: { in: [] },
    });
  });
});

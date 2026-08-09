import { WORK_ORDER_GRAPH } from "../capabilities/workflow-graphs";
import { WORK_ORDER_LANES, laneForStatus, openStatuses } from "./work-order-lanes";

describe("work order lanes", () => {
  it("covers every state in the graph", () => {
    // The board is built from the graph. A state with no lane is a job
    // that exists and appears nowhere, which is the exact failure the
    // reachability guarantee exists to prevent on the other side.
    const unmapped = WORK_ORDER_GRAPH.states.filter((status) => laneForStatus(status) === null);

    expect(unmapped).toEqual([]);
  });

  it("puts every state in exactly one lane", () => {
    // Two lanes claiming a status would show the same car twice, and a
    // manager counting cars would get a number the yard disagrees with.
    const seen = new Map<string, number>();
    for (const lane of WORK_ORDER_LANES) {
      for (const status of lane.statuses) seen.set(status, (seen.get(status) ?? 0) + 1);
    }

    expect([...seen.entries()].filter(([, count]) => count > 1)).toEqual([]);
  });

  it("treats exactly the graph's terminal states as finished", () => {
    const finished = WORK_ORDER_LANES.filter((lane) => lane.closed).flatMap((lane) => lane.statuses);

    expect([...finished].sort()).toEqual([...WORK_ORDER_GRAPH.terminal].sort());
  });

  it("excludes finished work from the board's default scope", () => {
    for (const terminal of WORK_ORDER_GRAPH.terminal) {
      expect(openStatuses()).not.toContain(terminal);
    }
  });

  it("returns null rather than guessing for a status it does not know", () => {
    expect(laneForStatus("SOMETHING_NEW")).toBeNull();
  });
});

import { attentionReason, describeWait, rankAttentionItem, sortByAttention } from "./attention-ranking";
import type { AttentionKind } from "./attention-ranking";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

const rank = (kind: AttentionKind, hours: number) => rankAttentionItem({ kind, waitingSince: hoursAgo(hours) }, NOW);

describe("tier order reflects what actually costs the workshop", () => {
  it("puts unbounded safety liability above everything", () => {
    const safety = rank("CRITICAL_REJECTION_UNACKNOWLEDGED", 0.5);
    const blocked = rank("TECHNICIAN_BLOCKED", 8);

    expect(safety.score).toBeLessThan(blocked.score);
  });

  it("puts an idle technician above a customer who has only just been asked", () => {
    // Someone paid is idle right now; the customer has not started waiting.
    expect(rank("TECHNICIAN_BLOCKED", 1).score).toBeLessThan(rank("CUSTOMER_APPROVAL_WAITING", 1).score);
  });

  it("puts uncollected money above a parts wait", () => {
    // The parts wait is usually outside this person's control.
    expect(rank("READY_UNPAID", 2).score).toBeLessThan(rank("WAITING_PARTS", 2).score);
  });
});

describe("age escalates, because a long wait changes what is at stake", () => {
  it("lifts a customer waiting over a day above a freshly blocked technician", () => {
    // At a day, the risk is losing the customer entirely rather than
    // losing an hour of labour.
    const customer = rank("CUSTOMER_APPROVAL_WAITING", 30);
    const blocked = rank("TECHNICIAN_BLOCKED", 1);

    expect(customer.escalated).toBe(true);
    expect(customer.score).toBeLessThan(blocked.score);
  });

  it("does not escalate the same customer before the threshold", () => {
    const customer = rank("CUSTOMER_APPROVAL_WAITING", 23);

    expect(customer.escalated).toBe(false);
    expect(customer.score).toBeGreaterThan(rank("TECHNICIAN_BLOCKED", 1).score);
  });

  it("never escalates safety, which is already top and does not decay", () => {
    expect(rank("CRITICAL_REJECTION_UNACKNOWLEDGED", 500).tier).toBe(1);
  });
});

describe("age breaks ties without crossing tiers", () => {
  it("orders oldest first inside a tier", () => {
    expect(rank("WAITING_PARTS", 40).score).toBeLessThan(rank("WAITING_PARTS", 2).score);
  });

  it("cannot let age alone outrank a higher tier", () => {
    // A very old low-tier item must not silently overtake an urgent one --
    // only explicit escalation may change tiers.
    const ancientRework = rankAttentionItem(
      { kind: "REWORK_REQUIRED", waitingSince: hoursAgo(24 * 365) },
      NOW,
    );
    const freshSafety = rank("CRITICAL_REJECTION_UNACKNOWLEDGED", 0);

    expect(freshSafety.score).toBeLessThan(ancientRework.score);
  });
});

describe("sortByAttention", () => {
  it("returns the queue a manager should work top-down", () => {
    const items = [
      { id: "parts", rank: rank("WAITING_PARTS", 2) },
      { id: "safety", rank: rank("CRITICAL_REJECTION_UNACKNOWLEDGED", 1) },
      { id: "old-customer", rank: rank("CUSTOMER_APPROVAL_WAITING", 72) },
      { id: "blocked", rank: rank("TECHNICIAN_BLOCKED", 1) },
    ];

    expect(sortByAttention(items).map((item) => item.id)).toEqual([
      "safety",
      "old-customer", // escalated past the blocked technician by age
      "blocked",
      "parts",
    ]);
  });

  it("does not mutate the caller's array", () => {
    const items = [{ id: "a", rank: rank("WAITING_PARTS", 1) }, { id: "b", rank: rank("TECHNICIAN_BLOCKED", 1) }];
    const original = [...items];

    sortByAttention(items);

    expect(items).toEqual(original);
  });
});

describe("the row explains itself in words", () => {
  it("states the reason and the wait, not a status code", () => {
    // A badge asks the reader to remember what it maps to. A sentence
    // does not, and lets the manager disagree with our ranking.
    const reason = attentionReason("CUSTOMER_APPROVAL_WAITING", 72);

    expect(reason).toContain("approve");
    expect(reason).toContain("3 days");
  });

  it("rounds the wait to something a person acts on", () => {
    expect(describeWait(0.4)).toBe("just now");
    expect(describeWait(1.2)).toBe("1 hour");
    expect(describeWait(5.9)).toBe("5 hours");
    expect(describeWait(25)).toBe("1 day");
    expect(describeWait(73.4)).toBe("3 days");
  });
});

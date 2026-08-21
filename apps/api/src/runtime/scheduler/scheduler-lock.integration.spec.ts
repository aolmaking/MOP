/**
 * The property that matters: two "replicas" racing for the same job key
 * at the same instant must not both run the work. This is what actually
 * closes the gap named in docs/PHASE_MAP.md's Phase 13 entry -- without
 * this, two API processes both firing @Cron(EVERY_MINUTE) would both
 * believe they are the only one and both execute.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { SchedulerLockService } from "./scheduler-lock.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const lock = new SchedulerLockService(prisma as unknown as PrismaService);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("SchedulerLockService", () => {
  it("lets a single caller run once", async () => {
    let ran = 0;
    const result = await lock.runExclusively(`solo-${Date.now()}`, async () => {
      ran += 1;
      return "done";
    });

    expect(result).toBe("done");
    expect(ran).toBe(1);
  });

  it("blocks a second, concurrent caller for the same job key -- the double-fire this phase exists to prevent", async () => {
    const jobKey = `race-${Date.now()}`;
    let executions = 0;

    // Two "replicas" racing for the same tick, genuinely concurrently --
    // both transactions are in flight before either resolves.
    const [first, second] = await Promise.all([
      lock.runExclusively(jobKey, async () => {
        executions += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "winner";
      }),
      // Started a beat later so it reliably finds the lock already held
      // rather than racing the transaction's own startup, but still well
      // before the first call's 100ms of held work finishes.
      new Promise((resolve) => setTimeout(resolve, 10)).then(() =>
        lock.runExclusively(jobKey, async () => {
          executions += 1;
          return "loser";
        }),
      ),
    ]);

    expect(executions).toBe(1);
    expect([first, second].filter((r) => r !== null)).toHaveLength(1);
    expect([first, second]).toContain("winner");
    expect([first, second]).toContain(null);
  });

  it("different job keys never contend with each other", async () => {
    const [a, b] = await Promise.all([
      lock.runExclusively(`key-a-${Date.now()}`, async () => "a"),
      lock.runExclusively(`key-b-${Date.now()}`, async () => "b"),
    ]);

    expect(a).toBe("a");
    expect(b).toBe("b");
  });

  it("releases the lock once the transaction ends, so the next tick can acquire it", async () => {
    const jobKey = `sequential-${Date.now()}`;

    const first = await lock.runExclusively(jobKey, async () => "first-tick");
    const second = await lock.runExclusively(jobKey, async () => "second-tick");

    expect(first).toBe("first-tick");
    expect(second).toBe("second-tick");
  });
});

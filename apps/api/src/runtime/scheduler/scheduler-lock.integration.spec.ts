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

/**
 * A second client, standing in for a second API replica.
 *
 * Two clients rather than two calls on one, because the contention this
 * file exists to prove is between two Postgres SESSIONS. Sharing a
 * client means sharing a pool, and a pool under load can serialize the
 * two calls -- at which point both legitimately acquire the lock in turn
 * and the test reports a double-fire that never happened. That is
 * exactly how F-004 read: it failed only in the full suite and passed
 * every time in isolation.
 */
const otherReplica = new PrismaClient();
const otherLock = new SchedulerLockService(otherReplica as unknown as PrismaService);

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), otherReplica.$disconnect()]);
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

    // The overlap is arranged, not timed. The first caller announces
    // that it holds the lock and then waits; the second is only
    // attempted after that announcement, and the first is only released
    // after the second has answered. There is no sleep anywhere, so
    // there is no load under which the two stop overlapping.
    let announceHeld!: () => void;
    const held = new Promise<void>((resolve) => {
      announceHeld = resolve;
    });
    let release!: () => void;
    const mayFinish = new Promise<void>((resolve) => {
      release = resolve;
    });

    const winner = lock.runExclusively(jobKey, async () => {
      executions += 1;
      announceHeld();
      await mayFinish;
      return "winner";
    });

    await held;

    // Attempted from a different client, so it cannot be waiting on the
    // first one's connection rather than on the first one's lock.
    const loser = await otherLock.runExclusively(jobKey, async () => {
      executions += 1;
      return "loser";
    });

    release();

    expect(loser).toBeNull();
    expect(await winner).toBe("winner");
    expect(executions).toBe(1);
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

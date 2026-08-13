/**
 * HeartbeatJob now runs its tick through SchedulerLockService, which
 * takes a real Postgres advisory lock -- there is no meaningful way to
 * fake that with a mock without re-testing the mock instead of the
 * behavior, so this is a real-database test like the rest of the
 * integration suite.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { HeartbeatJob } from "./heartbeat.job";
import { SchedulerLockService } from "./scheduler-lock.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const lock = new SchedulerLockService(prisma as unknown as PrismaService);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("HeartbeatJob", () => {
  it("has no last-run time before it has ever ticked", () => {
    const job = new HeartbeatJob(lock);

    expect(job.getLastRunAt()).toBeNull();
  });

  it("tick() records the current time", async () => {
    const job = new HeartbeatJob(lock);
    const before = new Date();

    await job.tick();

    const after = new Date();
    const recorded = job.getLastRunAt();
    expect(recorded).not.toBeNull();
    expect(recorded!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(recorded!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("onModuleInit() ticks immediately, so a fresh instance already has a timestamp at boot", async () => {
    const job = new HeartbeatJob(lock);

    job.onModuleInit();
    // onModuleInit fires the tick without awaiting it (boot must not
    // block on a lock acquisition), so give the microtask queue a turn.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(job.getLastRunAt()).not.toBeNull();
  });
});

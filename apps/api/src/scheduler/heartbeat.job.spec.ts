import { HeartbeatJob } from "./heartbeat.job";

describe("HeartbeatJob", () => {
  it("has no last-run time before it has ever ticked", () => {
    const job = new HeartbeatJob();

    expect(job.getLastRunAt()).toBeNull();
  });

  it("tick() records the current time", () => {
    const job = new HeartbeatJob();
    const before = new Date();

    job.tick();

    const after = new Date();
    const recorded = job.getLastRunAt();
    expect(recorded).not.toBeNull();
    expect(recorded!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(recorded!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("onModuleInit() ticks immediately, so a fresh instance already has a timestamp at boot", () => {
    const job = new HeartbeatJob();

    job.onModuleInit();

    expect(job.getLastRunAt()).not.toBeNull();
  });
});

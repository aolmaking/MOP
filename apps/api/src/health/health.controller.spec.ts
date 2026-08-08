import { HealthController } from "./health.controller";
import { PrismaService } from "../database/prisma.service";
import { HeartbeatJob } from "../scheduler/heartbeat.job";

describe("HealthController", () => {
  function createPrismaMock() {
    return { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) } as unknown as PrismaService;
  }

  it("reports ok/connected plus the scheduler's last heartbeat when the database responds", async () => {
    const prisma = createPrismaMock();
    const heartbeat = {
      getLastRunAt: jest.fn().mockReturnValue(new Date("2026-08-07T12:00:00.000Z")),
    } as unknown as HeartbeatJob;
    const controller = new HealthController(prisma, heartbeat);

    const result = await controller.check();

    expect(result).toEqual({
      status: "ok",
      database: "connected",
      schedulerLastHeartbeatAt: "2026-08-07T12:00:00.000Z",
    });
  });

  it("reports schedulerLastHeartbeatAt: null when the scheduler hasn't ticked yet", async () => {
    const prisma = createPrismaMock();
    const heartbeat = { getLastRunAt: jest.fn().mockReturnValue(null) } as unknown as HeartbeatJob;
    const controller = new HealthController(prisma, heartbeat);

    const result = await controller.check();

    expect(result.schedulerLastHeartbeatAt).toBeNull();
  });

  it("propagates a database failure rather than reporting ok", async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error("connection refused")) } as unknown as PrismaService;
    const heartbeat = { getLastRunAt: jest.fn().mockReturnValue(null) } as unknown as HeartbeatJob;
    const controller = new HealthController(prisma, heartbeat);

    await expect(controller.check()).rejects.toThrow("connection refused");
  });
});

import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { HeartbeatJob } from "../scheduler/heartbeat.job";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly heartbeat: HeartbeatJob,
  ) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      database: "connected",
      // Proves the scheduler is actually alive, not just that it was wired
      // up at boot -- a stuck/crashed scheduler would leave this stale.
      schedulerLastHeartbeatAt: this.heartbeat.getLastRunAt()?.toISOString() ?? null,
    };
  }
}

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

/**
 * Minimal proof that @nestjs/schedule is really wired up and firing on
 * time -- Phase 10 adds the real background jobs (reminder nudges, token
 * cleanup, report snapshots) using this same @Cron pattern. The last tick
 * time is exposed through GET /health (see health.controller.ts), so
 * "is the scheduler alive" is something anyone can check from outside the
 * process, not just something to trust from log lines.
 */
@Injectable()
export class HeartbeatJob implements OnModuleInit {
  private readonly logger = new Logger(HeartbeatJob.name);
  private lastRunAt: Date | null = null;

  // Ticks once immediately at boot too, so /health has a real timestamp to
  // show right away instead of null for up to a minute after startup.
  onModuleInit(): void {
    this.tick();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  tick(): void {
    this.lastRunAt = new Date();
    this.logger.log(`Heartbeat at ${this.lastRunAt.toISOString()}`);
  }

  getLastRunAt(): Date | null {
    return this.lastRunAt;
  }
}

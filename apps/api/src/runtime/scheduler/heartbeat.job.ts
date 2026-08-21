import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SchedulerLockService } from "./scheduler-lock.service";

/**
 * Minimal proof that @nestjs/schedule is really wired up and firing on
 * time -- future real background jobs (reminder nudges, token cleanup,
 * report snapshots) use this same @Cron pattern. The last tick time is
 * exposed through GET /health (see health.controller.ts), so "is the
 * scheduler alive" is something anyone can check from outside the
 * process, not just something to trust from log lines.
 *
 * Every tick runs through `SchedulerLockService`, so this stays correct
 * the moment a second API replica exists -- see Phase 13
 * (`docs/phases/PHASE_13.md`) for why a Postgres advisory lock, not a
 * separate worker deployable, is what actually closes that gap today.
 */
@Injectable()
export class HeartbeatJob implements OnModuleInit {
  private readonly logger = new Logger(HeartbeatJob.name);
  private lastRunAt: Date | null = null;

  constructor(private readonly lock: SchedulerLockService) {}

  // Ticks once immediately at boot too, so /health has a real timestamp to
  // show right away instead of null for up to a minute after startup.
  onModuleInit(): void {
    void this.tick();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    await this.lock.runExclusively("heartbeat-tick", async () => {
      this.lastRunAt = new Date();
      this.logger.log(`Heartbeat at ${this.lastRunAt.toISOString()}`);
    });
  }

  getLastRunAt(): Date | null {
    return this.lastRunAt;
  }
}

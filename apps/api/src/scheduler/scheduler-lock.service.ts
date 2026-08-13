import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../database/prisma.service";

/**
 * Single-flight guard for a scheduled job across however many API
 * replicas are running.
 *
 * `@nestjs/schedule`'s `@Cron` fires inside every process that loads the
 * module -- one replica, one tick; two replicas, two ticks at the same
 * instant, each believing it is the only one. That is exactly the gap
 * named in `docs/PHASE_MAP.md`'s Phase 13 entry ("the in-process
 * scheduler double-fires the moment there are two API replicas").
 *
 * `pg_try_advisory_xact_lock` is the fix: a transaction-scoped advisory
 * lock, non-blocking (`_try_`, not `_lock`), auto-released the instant
 * the transaction ends -- so a crashed replica can never leave the lock
 * held forever, and a losing replica does not wait, it is simply told
 * "someone else has this tick" and returns immediately. The key is
 * hashed with `hashtext()` rather than passed as a raw integer, so a job
 * name reads as a name in the calling code instead of a number somebody
 * has to keep unique by hand.
 */
@Injectable()
export class SchedulerLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `work` only if this replica wins the lock for `jobKey`. Returns
   * `null`, not a rejected promise, when another replica already holds
   * it -- losing the race is the expected, common case, not a failure.
   */
  async runExclusively<T>(jobKey: string, work: () => Promise<T>): Promise<T | null> {
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ acquired: boolean }[]>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${jobKey})::bigint) AS acquired`,
      );

      if (!row.acquired) return null;
      return work();
    });
  }
}

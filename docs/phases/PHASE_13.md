# Phase 13 — System Automation

> **Named problem:** the in-process `@nestjs/schedule` scheduler double-fires the moment there are two API replicas -- each process runs its own `@Cron` timer with no idea another one exists.

## What shipped

`SchedulerLockService` (`apps/api/src/scheduler/scheduler-lock.service.ts`) wraps a job in `pg_try_advisory_xact_lock`: a Postgres advisory lock scoped to one transaction, non-blocking, auto-released the instant the transaction ends. A replica that loses the race gets `null` back immediately rather than waiting or erroring — losing is the normal, expected outcome for every replica but one.

`HeartbeatJob.tick()` now runs through it (`this.lock.runExclusively("heartbeat-tick", ...)`), and any future `@Cron` job follows the same one-line pattern.

Proven by `scheduler-lock.integration.spec.ts` against real Postgres: two concurrent callers racing for the same job key produce exactly one execution and one `null`; different job keys never contend; the lock releases cleanly so the next tick can acquire it again.

## What this phase did not build, and why

A genuinely separate worker process (its own deployable, its own `Dockerfile`, its own health check) is what the phase name implies, but there is nothing for it to run yet — the only scheduled job in the codebase is the heartbeat, a liveness probe with no business logic. Building a second deployable to host one `console.log` would be infrastructure with no job, which is exactly the kind of premature scaffolding this project's own rules warn against. The advisory lock is the part of "system automation" that is actually load-bearing today: it makes the *current* in-process scheduler correct under horizontal scaling, which is the literal problem `PHASE_MAP.md` names. When a real recurring job with actual work exists (reminder nudges, token cleanup, report snapshots — all named as HeartbeatJob's own future in its comment), that is the point to decide whether it belongs on a separate worker process or can stay in-process behind this same lock.

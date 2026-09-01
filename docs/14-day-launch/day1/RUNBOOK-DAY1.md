# DAY-1 RUNBOOK — launch the fleet, operate the mechanism, brief every agent

---

## 1. Commands to run right now (primary machine)

```powershell
# from the repo clone's docs\14-day-launch\scripts\ (this file lives beside it)
powershell -ExecutionPolicy Bypass -File .\setup-fleet.ps1 -Fleet C:\mop-fleet
```

Then, in three separate terminals:

```powershell
# Terminal 1 — COORDINATOR (Claude, fleet root; sees board + all worktrees read-only)
cd C:\mop-fleet
opencode --agent coordinator          # or your normal launcher; brief = §4.1 below

# Terminal 2 — A1 INTEGRATOR (Claude)
cd C:\mop-fleet\w-int
opencode                              # paste §4.2 integrator brief as first message

# Terminal 3 — A3 BACKEND (ox-alpha)
cd C:\mop-fleet\w-a3
opencode                              # paste §4.3 backend brief
```

**Give Codex (remote machine) exactly this:**

```text
1. git clone https://github.com/aolmaking/MOP.git mop && cd mop
2. git switch track/a2-frontend
3. docker run -d --name mop-pg -e POSTGRES_USER=mop_dev -e POSTGRES_PASSWORD=mop_dev_secret -p 5432:5432 postgres:16-alpine
4. Create DB: docker exec mop-pg psql -U mop_dev -d postgres -c "CREATE DATABASE mop_test_w2"
5. Write .env at repo root:  DATABASE_URL=postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_test_w2?schema=public
6. corepack pnpm install   |   corepack pnpm --filter @mop/shared run build   |   corepack pnpm db:generate   |   corepack pnpm db:deploy
7. Read docs/14-day-launch/day1/WAVE-1-TASK-CARDS.md → execute cards W1-A2-001…005 in order.
8. Contracts are FROZEN in day1/CONTRACTS-v0.md — implement clients exactly; request amendments via your STATUS file, never by inventing shapes.
9. Report: commit to track/a2-frontend at each card boundary; keep a2-STATUS.md at repo root updated (card id / state / evidence / findings F-xx).
10. Never touch apps/api/** or packages/database/prisma/migrations/**.
```

Wave 1 formally starts when the coordinator writes `board/current-wave.md` — the seed already contains it (the task-cards file doubles as Wave-1 content until split).

## 2. The operational mechanism in practice

```text
Coordinator (morning, ~10 min)
  reads master plan + yesterday's residue → writes board/current-wave.md:
  ordered card ids per agent + one-line priority rationale.

Worker claim (~1 min)
  worker writes claims/<agent>.json {task:"W1-A3-002", paths:[...]}.
  Harness rule: one active claim per worker; hotspot overlap = reject.

Implement (30–90 min)
  worker codes ONLY inside claimed paths, in its own worktree,
  against frozen contracts. Deviation spotted ⇒ stop, file blocker, re-plan.

Verify
  worker runs scoped tests (its own DB). Full gates are NOT worker jobs.

Report
  status/<agent>.json updated {state, evidence:[sha, test names]} + push to track/*.
  Codex equivalent: commits + a2-STATUS.md on its branch.

Integrate (windows ~11:00 & ~17:00)
  A1 runs harness\integrate.ps1 <branch>:
    fetch → rebase onto develop → claims/hotspot check → migration-lock check
    → scoped gate → (evening: full gate) → merge --no-ff → archive status.
  Red gate ⇒ automatic bounce-back with log path; develop never goes red.
  Conflicts beyond trivial ⇒ returned to owner with a conflict note.

Unlock
  merged cards flip dependencies in current-wave.md; coordinator immediately asks:
  "highest-value unblocked task toward the launch gate?" and writes the next card.

Escalation path for anything ambiguous: blockers/<id>.md → coordinator decides
within the wave, or escalates to YOU with a one-paragraph decision request.
```

Practical notes: workers may push several times a day — every push is an integration *candidate*, not an event; A1 batches windows so full gates stay serialized on the 16 GB machine. The Honesty Harness turns green only when the real spine works — its verdict ends any "is it done?" debate instantly.

## 3. What YOU give Claude immediately

Open the Claude integrator session (`w-int`) and paste this as the first message:

```text
You are A1 — Integrator, Infra, Verification, Migration Owner for the MOP 14-day
quick-service launch. Authoritative context, in reading order:
1. C:\mop-fleet\board\master-plan-ref.md        (product scope, frozen)
2. C:\mop-fleet\board\docs\DETAILED-EXECUTION-PLAN.md   (critical path, checkpoints)
3. C:\mop-fleet\board\docs\INVENTORY-EXECUTION-MAP.md   (inventory ground truth)
4. C:\mop-fleet\board\contracts.md              (FROZEN API/UI contracts v0)
5. C:\mop-fleet\board\current-wave.md           (your Day-1 cards: W1-A1-001..005)

Your standing rules:
- You are the ONLY merger. Author ≠ merger, always. Review every diff against the
  Execution Map before merging; write reviews/<task>.md ("approved" | "changes: …").
- You own migrations FIFO via board/claims/migrations.lock. No chain edits without it.
- Full gates are yours and serialized (16 GB machine): scoped gates anytime, full gate
  after each evening integration window and before D7/D12/D14.
- The Honesty Harness (apps/api/src/testing/walkthrough.http.spec.ts) outranks all
  opinions: features are done when it says so.
- Never accept scope changes without a decisions.md entry; new ideas go to inbox/.
- Workers: A3=track/a3-backend (backend/domain), A2=track/a2-frontend (frontend, remote).
  Their contracts are frozen; bounce deviations back, do not absorb them silently.

Start now with W1-A1-001, then proceed through your cards in order. Evidence into
board/runs/. At each integration window use harness scripts once they exist (W1-A1-004).
```

(The coordinator session gets the same context list plus: "write waves, decompose cards per granularity rules, prioritize critical-path → unblocked → value → risk → verification gaps → polish.")

## 4. Definition of done for Day 1

- All three primary sessions active with briefs loaded; Codex acknowledged environment card.
- `develop` has baseline gate evidence; CI green run URL recorded.
- Honesty Harness scaffold exists and is pinned RED at the exact spine break.
- Harness scripts smoke-tested (refuse wrong targets).
- Staging URL answering `/health` over HTTPS (self-signed OK), backup script dumps four DBs.
- A3: start-inspection/start-work implemented service-level green; decision auto-moves landed behind tests.
- A2: env up; typed clients compiled; work-card action states mocked-green; narrowing PR drafted; IM console findings list posted.

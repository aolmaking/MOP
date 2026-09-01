# MULTI-AGENT EXECUTION ARCHITECTURE — MOP 14-Day Quick-Service Launch

**Scope of this document:** execution orchestration only. Product scope is frozen per `DETAILED-EXECUTION-PLAN.md`. No application code has been modified.

---

## 1. Final agent architecture

| Agent | Engine | Role | Owns |
|---|---|---|---|
| **A1 — Integrator / Infra / Verification** | Claude/Opus (primary machine) | Merge authority, migration queue, full gates, CI/staging/backups, Honesty Harness, board curation | `develop`, migrations FIFO, `tools/`, `.github/`, `apps/api/src/testing/**`, infra configs |
| **A2 — Frontend / UX** | Codex (remote machine) | All web experiences incl. inventory surfaces, surface-narrowing, browser journeys | `apps/web/src/app/experiences/**`, api-client files |
| **A3 — Backend / Domain** | OpenCode/ox-alpha (primary machine) | Spine ignition, decision transitions, task creation, inventory completion endpoints, service-layer correctness | `systems/**`, `experiences/**` controllers, schema+migration authoring (applied by A1) |
| **W4 — Local auxiliary** | Ollama/Gemma 4 | **Deferred — see §2.** Conditional night-lane spec included | nothing critical |

## 2. Should local Gemma 4 participate?

**Verdict: not as a fourth continuous engineering worker on this machine. Measured, not assumed:**

| Constraint (measured just now) | Value | Consequence |
|---|---|---|
| CPU | i7-8650U @ 1.90 GHz — 4 cores / 8 threads | CPU-only inference; expect single-digit tokens/sec on ≥12B models while sharing cycles with Jest/Angular |
| RAM | 16 GB total, **1.4 GB free at inspection** | A resident 12B Q4 model wants ~8 GB; the machine cannot hold model + workers + Docker comfortably — it is *already* saturated |
| GPU / VRAM | Intel UHD 620 integrated only; no nvidia-smi | No meaningful acceleration; every token burns CPU that tests and builds need |
| Disk C: | **13 GB free** / 116 GB | A 12B model download alone consumes most of the headroom; 26B/31B do not fit |
| Ollama | Installed & running (`ollama.exe` under `%LOCALAPPDATA%\Programs\Ollama`) | Integration itself is trivial — the constraint is resources, not plumbing |

**Decision:** Gemma 4 stays **out of the critical loop** for the 14 days. A slow fourth coder adds coordination overhead and steals RAM/CPU from verification — the exact resource the fleet cannot spare. Revisit when: RAM ≥ 32 GB + discrete GPU ≥ 12 GB VRAM, or hosted on a second box.

**Conditional night-lane (only if you insist):** variant **E4B or 12B quantized**, context ≤ 8k, launched only after 23:00 when no gates run, in one role — *documentation/board synthesis + read-only diff summarization*. Barred permanently from lifecycle, permissions, workflow graph, migrations, money, auth. Its output is advisory text into `board/reviews/w4-notes.md`, never code. Expected value: small; expected risk: low if fenced as above. Default answer remains **no**.

## 3–4. Agent order swap — evaluated, then approved with guardrails

The proposed swap (Claude → Integrator, ox-alpha → Backend/Domain) is **better than the original arrangement**, for reasons specific to this project:

1. **All work converges on one merge point.** The highest-leverage placement for the strongest model is the seat that reviews everyone's diffs, arbitrates conflicts, applies the migration chain, and decides gate outcomes. A weak integrator is the #1 way fleets ship breakage; a strong-but-busy coder is replaceable by well-specified tasks.
2. **The backend work is now unusually well-specified.** After the audit + execution map, M1 ignition and the inventory endpoints have fixed contracts (`board/contracts.md`), named services, known patterns (guarded `updateMany`, refusal-swallowing moves), and the Honesty Harness as mechanical arbiter. That makes A3 executable by ox-alpha — which also carries unmatched project context from having produced the forensic audit.
3. Migration ownership pairs correctly with integration (FIFO application onto `develop`), so it follows Claude into A1.

**Guardrails that make the swap safe:**
- G-1: A3 implements strictly against `board/contracts.md`; any deviation requires a contract amendment entry before coding.
- G-2: A1 reviews **every** backend diff against the Execution Map before merge; the Honesty Harness result outranks both agents' opinions.
- G-3: Schema *authoring* stays with A3 (domain knowledge); schema *application* to `develop` is A1's FIFO queue. One writer of chain history at all times.

## 5. Coordinator architecture — what I would actually build

**Hybrid: deterministic scripts + one OpenCode coordinator session + a git-versioned file board.**

- **Board (files)** = durable, greppable, human-editable state. Any text editor is an override console. Git history = audit trail.
- **Scripts (`harness\*.ps1`)** = deterministic mechanics: provision, spawn, watch, integrate, gate. Scripts never improvise.
- **Coordinator (one OpenCode primary session, custom agent)** = judgment: decompose waves into task cards, prioritize per §10 policy, review diffs, triage blockers, decide stop/switch. It drives mechanics by *invoking the scripts*, never by hand-editing five worktrees.
- An MCP server exposing the board as tools is nice-to-have; skip for 14 days — file I/O through normal tools is sufficient and debuggable.

Why not the alternatives: pure-script coordinator lacks judgment for review/conflict triage; pure-agent coordinator is fragile at timing/crash-resume and tends to improvise procedure under context pressure.

## 6. Automation split

**Fully automated (harness does it, no judgment):**
provisioning worktrees/branches/envs/DBs/generated clients · spawning & resuming workers (`opencode run`/TUI per directory) · polling branch pushes · running focused test suites · running full gates · collecting STATUS files into board snapshots · merge-after-green *when* review note exists and no conflicts · golden-journey smoke invocation · backup execution.

**Judgment-driven (coordinator/human only):**
task decomposition & sizing · diff review approval · conflict resolution beyond trivial · dependency unlocks with architectural nuance · scope-change decisions (must append to `decisions.md`) · incident triage · checkpoint go/no-go · launch approval.

## 7. Safety boundaries — rule → enforcement mapping

| Rule | Enforcement |
|---|---|
| No simultaneous edits to the migration chain | `board/claims/migrations.lock` held by A1; harness refuses a merge containing `prisma/migrations` changes unless lock owner is merging |
| No two workers in one hotspot | `claims/*.json` paths checked by `integrate.ps1`; overlap ⇒ auto-reject merge with note |
| No direct writes to `main` | Branch protection + workers' push permission limited to `track/*` (harness wrapper `mop-push.ps1` refuses other refs) |
| No force-push | Same wrapper; server-side protection if a remote is used |
| No cross-worktree writes | Workers physically cannot — separate directories; OpenCode `external_directory: deny` permission set per worker |
| No test-DB collisions | Per-worktree `DATABASE_URL` (distinct DB names), written at provisioning |
| No blind merges / failed gates merged | `integrate.ps1` runs scoped gate → full gate; exits non-zero on failure; merge command literally unreachable on red |
| No scope expansion | New ideas land in `board/inbox/`; entering scope requires a `decisions.md` entry referencing the master plan |

## 8. Board structure (minimal, durable, overridable)

```
C:\mop-fleet\board\
├── master-plan.md            pointer + wave map (from DETAILED-EXECUTION-PLAN)
├── current-wave.md           today's wave: task ids, owners, priorities
├── decisions.md              append-only decision ledger (pre-authorized items live here Day 1)
├── contracts.md              API/UI contracts between A3 and A2 (frozen per amendment)
├── tasks\W<agent>-<nnn>.md   task cards (schema below)
├── claims\<agent>.json       claimed paths + task id (single active claim per worker)
├── status\<agent>.json       {task, state: working|blocked|review|done, evidence[], updated}
├── blockers\<id>.md          blocker + requested unblock
├── reviews\<id>.md           integrator review notes ("approved", "changes: …")
├── inbox\                    humans/coordinator drop new ideas here
├── checkpoints\d7.md d12.md d14.md
└── runs\                     gate/journey evidence (timestamps + results)
```

Task card schema (fields enforced by coordinator when writing cards):
`id · title · agent · depends-on[] · claimed-paths[] · acceptance[] (commands or checks) · est · notes`
Status JSON: `{task:"W3-007", state:"done", evidence:["track/a3@abc123","tests: part-request.http.spec green"], updated:"ISO"}`.

Resumability guarantee: a crashed worker resumes from (a) its branch HEAD, (b) its task card, (c) its last STATUS — never from chat memory. Compaction hook (per OpenCode plugin docs) injects: current card path, claimed paths, next step.

---

*(sections 9–20 continue)*
## 9. Git / worktree architecture

```
C:\mop-fleet\
├── repo\          canonical clone (origin = GitHub). Only A1 merges here; main protected.
├── w-a3\          worktree → branch track/a3-backend      (ox-alpha, this machine)
├── w-int\         worktree → branch develop               (A1 Claude works here)
├── board\         coordination state (also a git repo for history — private remote or local bundle)
├── harness\       spawn.ps1 · gate.ps1 · integrate.ps1 · mop-push.ps1 · new-task.md template
└── logs\
Codex (remote): its own clone + worktree w-a2 on branch track/a2-frontend; reports via
commits to track/a2-frontend including `a2-STATUS.md` at repo root of its worktree;
A1 copies status into central board at each merge window.
```

Branches: `main` (protected, launch tags only) ← `develop` (integration) ← `track/a3-backend`, `track/a2-frontend`. A1 works directly on `develop` for infra commits; product changes from A1 also go through review notes for the record.

## 10. Database / environment isolation

| Worker | Worktree | Branch | DB (`DATABASE_URL`) | API port | Notes |
|---|---|---|---|---|---|
| A1 integrator | `w-int` | `develop` | `mop_dev_int` | 4000 | runs full gates |
| A3 backend | `w-a3` | `track/a3-backend` | `mop_test_w3` | 4010 | Prisma client generated locally |
| A2 Codex (remote) | its own machine | `track/a2-frontend` | own Postgres container `mop_test_w2` | n/a (UI only) | pushes only |
| W4 Gemma (if ever) | `w-w4` read-only checkout | none | none (read-only analysis) | – | deferred |

One Docker Desktop instance hosts all databases (`docker-compose.yml` extended with the extra DBs or created via psql). `.env` per worktree is gitignored already. **Machine-load rule (measured 16 GB / heavy use):** full gates run ≤ 1 concurrent instance — A1 serializes; workers run scoped suites only.

## 11. Task granularity

Ideal card: **30–90 minutes of agent work · ≤ ~6 files · explicit acceptance commands · produces evidence.**
Examples of correct size: *"Implement POST /technician/work-orders/:id/start-inspection via WorkOrderLifecycleService.apply(intent START_INSPECTION); add HTTP test in walkthrough suite asserting UNDER_INSPECTION and 409-on-invalid-state; return existing work-card payload shape."*
Too big: "Implement M1" → decompose into 4–6 cards. Too small: single-line edits → batch into one card. Rule enforced by coordinator when writing cards: estimated >2 h ⇒ split; <15 min ⇒ batch.

## 12. Task assignment mechanism

Wave-based pull with coordinator push override:
1. Coordinator writes `current-wave.md` each morning (and mid-day if the wave drains): ordered task ids per agent + priority rationale.
2. Worker claims by writing its `claims/<agent>.json` (harness validates no hotspot overlap) and sets `status.state=working`.
3. If a worker goes idle with no unblocked card, it reports `state=idle` + reason; coordinator either decomposes more or re-prioritizes.
Priority policy encoded in the coordinator prompt (§10 of your spec): critical-path blockers → unblocked dependencies → product value → integration risk → verification gaps → polish. One active task per worker; critical-path task preempts anything not merged.

## 13–14. Reporting, reviewing, integrating, gates

**Reporting:** worker updates `status/<agent>.json` + commits/pushes at every meaningful checkpoint (feature-complete, tests green/blocked). Evidence fields carry commit SHAs and test names — never prose claims alone.
**Reviewing:** A1 reviews each diff against the Execution Map/contracts; writes `reviews/<task>.md`: "approved" or "changes: …". Author ≠ merger, always.
**Integrating:** `integrate.ps1 <agent>`: fetch → rebase onto `develop` → hotspot/migration lock check → scoped gate → on green: merge `--no-ff`, STATUS archived, worker rebases next claim. Conflicts beyond trivial ⇒ bounce to owner with conflict note.
**Gates:** scoped gates anytime by workers; **full gate** (typecheck + 6 linters + unit+integration tests + build) scheduled by A1: after each daily integration window, before checkpoints D7/D12/D14. Golden journey smoke: end of each day on staging; full matrix ×2 profiles at D7/D12/D13.

## 15. Failure / recovery mechanism

| Failure | Detection | Recovery |
|---|---|---|
| Context compaction | OpenCode compaction hook | Hook injects: card path, claimed paths, last evidence, next step (per plugin docs' swarm pattern) |
| Worker crash/restart | `status` stale > N hours OR process gone | Re-run spawn command for that directory; it resumes from git HEAD + card + STATUS |
| Machine reboot/sleep | — | Idempotent provisioning script re-verifies worktrees/DBs; relaunch workers; nothing else lost (board is files, code is git) |
| API rate limit | Worker reports blocked | Coordinator re-queues task; shifts wave order to keep other lanes moving |
| Red gate on integration | `integrate.ps1` non-zero | Automatic bounce-back to author with log path; `develop` untouched |
| Migration conflict | Lock check | Second migration waits; FIFO applied by A1; downstream worktrees regenerate clients after pull |
| Codex unreachable | No push in window | A1 absorbs its current card's API-side stub or reassigns UI polish to backlog; frontend lane pauses without blocking backend |

## 16. Daily execution loop (derived, practical)

```
08:00  Coordinator opens wave: writes current-wave.md from plan + yesterday's residue
08:05  Workers claim & start (spawn/resume)
~11:00 Window 1: pushes → integrate.ps1 per ready branch → scoped gate → merge
12:00  Midday wave update (unlocks, re-priorities)
~17:00 Window 2: same as Window 1; then FULL GATE on develop (A1)
18:00  Golden-journey smoke vs staging; backups (D5+); board snapshot
18:30  Coordinator plans tomorrow's wave; humans read decisions/inbox
Continuous: workers may push more than once/day — every push is a potential window
```

14-day cadence overlays the existing day plan: D7/D12 hard checkpoints replace the normal afternoon; D13 admits CRITICAL-only cards; D14 is launch-gate execution, no new cards.

---

*(sections 17–20 + commands continue)*
## 17. Exact startup procedure (Windows / PowerShell — runnable)

> Prereqs already verified on this machine: git + node present; Docker Desktop used for Postgres; OpenCode launched the way you normally launch it (not on this shell's PATH — substitute your launcher for `opencode` below). Adjust `$Fleet` if you use another drive (C: has 13 GB free — consider D:).

```powershell
# ── 0. Constants ──────────────────────────────────────────────
$Fleet = "C:\mop-fleet"
$Repo  = "$Fleet\repo"

# ── 1. Prepare canonical repo (first time only) ───────────────
New-Item -ItemType Directory -Force -Path $Fleet | Out-Null
git clone https://github.com/aolmaking/MOP.git $Repo
git -C $Repo config safe.directory $Repo

# ── 2–3. Worktrees + branches (idempotent-ish) ────────────────
git -C $Repo worktree add "$Fleet\w-int"  -b develop
git -C $Repo worktree add "$Fleet\w-a3"   -b track/a3-backend
# A2/Codex clones independently on the remote machine and works on track/a2-frontend:
git -C $Repo push origin main:refs/heads/track/a2-frontend   # seed the branch

# ── 4. Isolated databases (one Postgres container) ────────────
docker compose -f $Repo\docker-compose.yml up -d
$pg = 'docker exec -i ' + (docker ps --format '{{.Names}}' | Select-String postgres | ForEach-Object { $_ }) 
foreach ($db in 'mop_dev_int','mop_test_w3','mop_test_w2') {
  cmd /c "docker exec -i mop-postgres psql -U mop_dev -d postgres -c `"CREATE DATABASE $db`""
}

# ── 5. Per-worktree envs (gitignored files) ────────────────────
@{
  "$Fleet\w-int" = 'postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_dev_int?schema=public'
  "$Fleet\w-a3"  = 'postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_test_w3?schema=public'
}.GetEnumerator() | ForEach-Object {
  Set-Content -Path "$($_.Key)\.env" -Value "DATABASE_URL=$($_.Value)" -Encoding ascii
}
# Codex writes its own .env on its machine pointing at ITS local container.

# ── 6. Install + Prisma client per primary-machine worktree ───
foreach ($wt in "$Fleet\w-int", "$Fleet\w-a3") {
  Push-Location $wt
  corepack pnpm install
  corepack pnpm --filter @mop/shared run build
  corepack pnpm db:generate
  Pop-Location
}

# ── 7. Board scaffold ─────────────────────────────────────────
$board = "$Fleet\board"
'master-plan.md','current-wave.md','decisions.md','contracts.md' |
  ForEach-Object { Set-Content "$board\$_" "# $_ (populated by coordinator Day 1 morning)" }
'docs\14-day-launch\DETAILED-EXECUTION-PLAN.md' | Copy-Item -Destination "$board\master-plan.md" -Force
'tasks','claims','status','blockers','reviews','inbox','checkpoints','runs' |
  ForEach-Object { New-Item -ItemType Directory -Force -Path "$board\$_" } | Out-Null

# ── 8. Start coordinator (its own OpenCode session at fleet root)
#      custom agent 'coordinator' defined in opencode.json (prompt: prioritize per
#      §10 policy, write task cards, invoke harness scripts, never edit worker trees)
opencode --agent coordinator --cwd $Fleet

# ── 9. Start A1 integrator (Claude) in w-int
opencode --cwd $Fleet\w-int        # agent: build; role brief from board/master-plan

# ── 10. Start A3 backend (ox-alpha) in w-a3
opencode --cwd $Fleet\w-a3         # same brief pattern

# ── 11. A2 Codex on remote machine (there):
#        git clone … ; git switch track/a2-frontend ; docker compose up -d ;
#        create .env (own DB name mop_test_w2) ; corepack pnpm install ; db:generate ;
#        launch Codex with the frontend brief.

# ── 12. Begin Wave 1: coordinator writes current-wave.md with the Day-1 cards
#        from DETAILED-EXECUTION-PLAN §8 and posts them into tasks\
```

**Scripts to create once (contents are small; skeleton responsibilities):**
- `harness\integrate.ps1 <branch>`: fetch → rebase onto develop → hotspot/lock check vs `claims\` → scoped gate → full-gate flag → merge `--no-ff` → append `runs\`.
- `harness\gate.ps1 [-full]`: typecheck → linters → (`-full`) unit+integration tests+build, with DATABASE_URL pointed at `mop_dev_int`.
- `harness\mop-push.ps1`: refuses refs other than own `track/*`; refuses force flags.
- Coordinator compaction hook plugin: injects card path + claimed paths + next step on compaction (pattern exists in OpenCode plugin docs).

## 18. Shutdown / checkpoint procedure

```powershell
# End of day (or before host maintenance):
1. Workers finish current card or park it: status state='parked', evidence committed, pushed.
2. A1 runs final integration window + full gate + golden-journey smoke; results → board\runs\.
3. Backup: pg_dump each DB to $Fleet\backups\<date>\ ; copy board to a bundle:
     git -C $Fleet\board add . ; git -C $Fleet\board commit -m "EOD snapshot <date>"
4. Close worker sessions (Ctrl+C / exit). Leave worktrees intact — they are resumable state.
5. Restart later = re-run steps 9–12 only (provisioning is idempotent).
```

## 19. Operational cadence summary (14 days)

Days 1–4 ignition+golden path (waves daily) · Day 5 parts-loop tests · Day 6 journeys+narrowing · **Day 7 checkpoint-1** (scope freeze) · Days 8–11 hardening/pilot-data · **Day 12 checkpoint-2** (rehearsal) · Day 13 critical-only · **Day 14 launch gate**. Full gates: every evening + checkpoints. Golden journey: nightly on staging; ×2 profiles at D7/D12/D13.

## 20. Safety boundaries recap (contractual)

Migration FIFO via lock · hotspot claims enforced at merge · no direct main writes · no force-push wrapper bypass · cross-worktree access denied by permission config · one DB per worker · no red-gate merges · scope changes require decisions.md entry · author ≠ merger · launch approval is HUMAN, informed by coordinator recommendation.

---

## FINAL ANSWER

> The safest and fastest coordination model for Claude + Codex + ox-alpha (+ optionally Gemma 4) is: **a file-based, git-versioned coordination board as the single source of truth; thin deterministic PowerShell scripts owning all mechanics (provision, spawn, integrate, gate); one Claude coordinator session converting the master plan into small bounded task cards and reviewing every diff; workers isolated in git worktrees with private `.env`/databases/generated clients, claiming paths before touching hotspots; migrations applied FIFO by the integrator; merges gated mechanically behind green scopes/full gates; and the Honesty Harness HTTP walkthrough as the non-negotiable arbiter of progress.** On your measured hardware, run three agents — Claude as integrator/infra (swapped in, with review-before-merge guardrails), ox-alpha as backend/domain against frozen contracts, Codex as frontend on its own machine — and leave Gemma 4 out of the loop until you have ≥32 GB RAM and a real GPU; its only safe 14-day role here would be an advisory night-lane summarizer, which costs more coordination than it returns. This architecture survives compaction, crashes, reboots, and rate limits because no worker ever depends on conversational memory — only on the board, the branches, and the scripts.

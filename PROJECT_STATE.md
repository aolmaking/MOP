# Project State

> **Purpose:** everything needed to continue MOP in a fresh session without the previous conversation.
> **Companion:** [`CLAUDE.md`](./CLAUDE.md) holds permanent knowledge (architecture, rules, toolchain). This holds *where we are*.
> **Last updated:** 2026-08-09, after Phase 5 task 5.A.
> **Keep this current.** Update it at the end of any phase task, and before ending a long session.

---

## 1. Current objective

Build **Phase 5 — Branch Manager**: the first real role interface. Six pages, derived from the manager's actual day rather than from a feature list.

Phase 5 matters beyond itself: it sets the visual and structural precedent that five more roles inherit. A layout decision made here without a reason gets copied five times.

## 2. Where we are

| Phase | State |
|---|---|
| 1 — Runnable and Provable | 🟢 7 of 7. CI cause found and fixed; awaiting a green run to confirm |
| 2 — Design Completeness | ✅ complete |
| 3 — Governance Runtime | 🟢 4 of 5. Capability UI moved to Phase 5 (5.F) |
| 4 — Operations Spine | ✅ complete |
| **5 — Branch Manager** | **🔵 in progress — 5.A + 5.B done, 5.C–5.G open** |
| 6–14 | ⬜ not started |

**Verified at last commit:** 379 tests (93 shared + 217 API + 69 web), run in CI ORDER from a wiped build state, typecheck clean, both custom lint rules passing, full build green. Working tree clean, pushed to `origin/main`.

## 3. Completed work

**Foundation.** 1,409-line Prisma schema (16 WO statuses, 19 part states, capability tables). Reproducible environment with `pnpm run doctor`. DB path verified end-to-end. Security baseline: rate limiting, boot-time config validation, helmet, body limits, request IDs, graceful shutdown. Money serialization interceptor. RTL/i18n foundation with a linter enforcing logical CSS.

**Capability engine.** Registry, capability-annotated workflow graphs, removal policies, reachability validator, gate registry with ownership, seven shipped profiles. Time-ranged `TenantCapability` storage. Runtime enforcement above role and user override. Change pipeline with live-data preconditions and atomic apply. Permission resolution is constant-cost (20 keys = same 6 queries as 1).

**Operations spine.** Capability-aware workflow router with intent-labelled edges. Gate evaluator, registry-driven and capability-filtered. `WorkOrderLifecycleService` as the sole writer of work-order status. Transactional intake with ownership transfer. Technician records with blocker routing.

**Branch Manager.** Attention queue API (5.A) — six sources, ranked by cost of delay with age escalation, tenant- and branch-scoped.

**Documentation.** Vision, systems, capability model, scenarios, three engineering charters, design language, phase map and per-phase docs. README + CONTRIBUTING as the repository front door.

## 4. Current task — what to do next

**5.C — the Customer Intake wizard.** Must survive being left mid-way: the manager is interrupted constantly and long forms get abandoned.

5.B is done and is the pattern the remaining pages copy — read `attention-center.ts/html/css` before writing another page.

*(Previously: 5.B — the Attention Center page.)*

Its structure is already decided in [`docs/phases/PHASE_5.md`](docs/phases/PHASE_5.md) §2, in this order:

1. **Needs you now** — ranked items from `AttentionQueueService`, each with its reason sentence, wait time, and primary action *on the row*
2. **Today's flow** — compact orientation strip
3. **Watch list** — the spec's count tiles, as entry points into filtered lists

Then 5.C intake wizard · 5.D board + workspace · 5.E approvals + delivery/payments · 5.F Super Admin capability UI · 5.G scenario walkthrough.

**Before building the remaining five pages**, the product owner may want to review 5.B's layout — it is the pattern the others copy.

## 5. Key technical decisions (do not re-litigate)

| Decision | Reason |
|---|---|
| Billing is a **separate bounded system** from Finance Core | Egypt ETA / Saudi ZATCA make an invoice a compliance artifact with its own lifecycle. Also enables External Billing Mode |
| Capability status includes **EXTERNAL**, not just enabled/disabled | "Invoices issued from other software" is neither on nor off |
| Removal **never changes the shape of the data** | A single-branch workshop keeps one hidden `Branch` row, never `branchId = null`, so re-enabling is config not migration |
| The **step is separate from the channel** | Customer approval is core; the portal is optional. Removing the portal moves approval to the counter, it does not delete consent |
| `TenantCapability` is **time-ranged** | A 2026 work order with no part requests reads as corrupt unless the system knows Inventory was off in 2026 |
| Intent-labelled graph edges; **declaration order is precedence** | A workshop with review + QC + finance has three live FINISH edges; review must win |
| Attention ranking is a **score with age escalation**, not a fixed list | A customer ignored 24h outranks a freshly blocked technician |
| The customer clock starts **when they were asked**, not when drafted | An unsent request is the branch's delay; charging it to the customer hides our own failure |
| Attention Center leads with **items, not count tiles** | A departure from the canonical spec, stated openly in PHASE_5.md §2 |

## 6. Things tried that failed — do not repeat

| Attempt | What happened | What to do instead |
|---|---|---|
| `corepack enable` | `EPERM` — needs admin, writes to `Program Files` | `tools/pnpm.mjs` re-invokes pnpm via `npm_execpath` |
| `--env-file` flag on our own script | **Node 24 consumes it** even after the script path, then tries to execute the filename | Our flag is `--mop-env` |
| Comparing `schema.prisma` to the generated copy byte-wise | Reports "stale" on every healthy project — the generator writes a *reformatted* copy | `doctor` compares mtime |
| Multi-heredoc bash command with an unmatched quote | Bash parses the whole command first, so **nothing ran** and five file writes silently did not happen | Use the Write tool for multi-file edits |
| `pnpm doctor` | Silently runs pnpm's built-in and exits 0 | `pnpm run doctor` |
| Letting integration specs rely on jest's default timeout | Auth spec does several ~1s scrypt hashes; failed as a timeout under parallel load and took the next test with it | `testTimeout: 120000` set in `apps/api` jest config |
| `pnpm --parallel --filter A --filter B run <script>` where B lacks the script | pnpm **skips B silently and exits 0**. `pnpm dev` started only the API for weeks; port 4200 simply never opened | Every filtered package must define the script. If a `dev`/`test` script looks like it did nothing, check the script exists in *that* package |

## 7. Known issues and open questions

1. **CI was red on every commit until 2026-08-09, now fixed.** Cause: the pipeline ran lint/typecheck/test BEFORE build, but `@mop/shared` is consumed through its built `dist/` (see its package.json main/types), which does not exist in a fresh checkout. It passed locally only because dist had been built at some point. Fixed by making the ordering explicit in both the root scripts and the workflow. Reproduce any suspected CI failure locally with `rm -rf packages/shared/dist` first.
2. **Two gates return `true` unconditionally** — `review.team_review_passed` and `qc.passed` in `gate-evaluator.service.ts`. The justification is that reaching a post-review state *is* the evidence, since the router will not route there otherwise. This is defensible but is still a hardcoded true, which the project elsewhere treats as a defect. **Revisit when Team Leader (Phase 10) and QC produce real records.**
3. **`byStatus` uses `updatedAt`** as a proxy for "entered this state", because no `statusChangedAt` column exists. Honest but imprecise; a dedicated column would be exact.
4. **Multiple partial issues against one part request** are not expressible (`IssuedItem.partRequestId` is unique). Deferred to Phase 7 with the reason recorded in `SCENARIOS.md` 3.5.
5. **Structured logging** is still outstanding from Phase 1.4. The correlation id it needs is already emitted.
6. **Billing vs Finance split** is decided but only Finance-side contracts exist; no billing adapter is built yet (Phase 9).

## 7a. Looking at the app

```bash
docker compose up -d && corepack pnpm db:deploy && corepack pnpm db:seed && corepack pnpm db:seed:demo && corepack pnpm dev
```

Then `http://localhost:4200/branch/attention` → sign in `manager@apex-motors.local` / `ChangeMe-Manager-123`.

The base seed creates **no work orders** by design, and no seeded account
except this demo manager holds `workorders.branch.view` — without
`db:seed:demo` the page correctly renders its no-access or empty state.

## 8. Environment requirements

- Node 20 (`.nvmrc`); this machine runs 24, which `doctor` warns about — CI runs 20, so a local pass is not proof of a CI pass
- pnpm 9.15.0 via corepack
- Docker Desktop running, `docker compose up -d` for Postgres on 5432
- Databases: `mop_platform_dev` and `mop_platform_test`
- `.env` at repo root (gitignored); `.env.test` is committed and carries relaxed throttle limits for the test suite

## 9. Files most recently worked on

| File | Why |
|---|---|
| `packages/shared/src/operations/attention-ranking.ts` | Cost-of-delay ranking, pure and shared so two screens cannot disagree |
| `apps/api/src/branch-manager/attention-queue.service.ts` | Builds the queue from six real data sources |
| `docs/DESIGN_LANGUAGE.md` | Reason behind every visual value |
| `docs/phases/PHASE_5.md` | Branch Manager pages derived from the user's day |
| `apps/api/package.json` | Added `testTimeout` after the flakiness above |

## 10. Immediate next steps

1. Build **5.B Attention Center page** to the structure in `PHASE_5.md` §2, using only tokens from `styles.css` and logical CSS properties.
2. Cover all six UI states from `UX_PRINCIPLES.md` §4 — empty and no-results are **different screens**.
3. Verify under `dir="rtl"`, with plate numbers still reading correctly via `<mop-identifier>`.
4. Run the full gate: `typecheck && lint && test && build`, then commit with a Conventional Commit and push.
5. Update this file.

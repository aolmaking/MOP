# Project State

> **Purpose:** everything needed to continue MOP in a fresh session without the previous conversation.
> **Companion:** [`CLAUDE.md`](./CLAUDE.md) holds permanent knowledge (architecture, rules, toolchain). This holds *where we are*.
> **Last updated:** 2026-08-09, after Phase 8 completed.
> **Keep this current.** Update it at the end of any phase task, and before ending a long session.

---

## 1. Current objective

**Close the page gap before starting Phase 9.**

An audit against `detailed-specs/` found the spec requires **53 pages** and **15 exist**. Phase 7 had been marked complete with three of its six pages built, because completion was measured against what had been made rather than against the spec. [`PAGE_INVENTORY.md`](docs/PAGE_INVENTORY.md) now tracks every page and is the definition of done.

Three of the gaps are **finished systems with no door** — built, tested, and unreachable by any human:

1. **Invite Accept.** Add Workshop writes `inviteTokenHash` and nothing redeems it, so every owner created through the product cannot log in.
2. **Customer Decision Page.** `secureToken` appears nowhere in the API. The customer cannot approve anything.
3. **Audit & Change History.** `AuditLog` is written on every risky action; `audit/` has no controller.

Those come first. Then the pages owed by phases already run.

## 2. Where we are

| Phase | State |
|---|---|
| 1 — Runnable and Provable | 🟢 7 of 7. CI cause found and fixed; awaiting a green run to confirm |
| 2 — Design Completeness | ✅ complete |
| 3 — Governance Runtime | 🟢 4 of 5. Capability UI moved to Phase 5 (5.F) |
| 4 — Operations Spine | ✅ complete |
| 5 — Branch Manager | 🟠 6 of 7 pages — Team Setup owed |
| 6 — Technician | ✅ complete — 6.A–6.G |
| 7 — Inventory | 🟠 **engine done, 3 of 6 pages built** — see PAGE_INVENTORY.md |
| 8 — Finance Core | 🟠 engine done; Owner "Money" page owed (Phase 10) |
| **9 — Billing / Invoicing** | **🔵 next** |
| 10–14 | ⬜ not started |

**Verified at last commit:** 560 tests (121 shared + 292 API + 147 web), typecheck clean, all **four** custom lint rules passing, full build green. Pushed to `origin/main`.

## 3. Completed work

**Foundation.** 1,409-line Prisma schema (16 WO statuses, 19 part states, capability tables). Reproducible environment with `pnpm run doctor`. DB path verified end-to-end. Security baseline: rate limiting, boot-time config validation, helmet, body limits, request IDs, graceful shutdown. Money serialization interceptor. RTL/i18n foundation with a linter enforcing logical CSS.

**Capability engine.** Registry, capability-annotated workflow graphs, removal policies, reachability validator, gate registry with ownership, seven shipped profiles. Time-ranged `TenantCapability` storage. Runtime enforcement above role and user override. Change pipeline with live-data preconditions and atomic apply. Permission resolution is constant-cost (20 keys = same 6 queries as 1).

**Operations spine.** Capability-aware workflow router with intent-labelled edges. Gate evaluator, registry-driven and capability-filtered. `WorkOrderLifecycleService` as the sole writer of work-order status. Transactional intake with ownership transfer. Technician records with blocker routing.

**Branch Manager (Phase 5, 6 of 7 pages).** Attention Center, Work Orders board and Workspace, Customer Intake, Approvals, Delivery & Payments, and the Super Admin capability UI. Plus 5.0, a mid-phase design-language redo after the product owner rejected the first visual language outright.

**Technician (Phase 6, complete — 3 of 3 pages).** Its own shell with a 56px density layer derived from what a gloved hand can hit, three pages (Now / My Work / Work Card), the Finish Gate shown as a checklist before the press, and `tools/lint-touch-targets.mjs` enforcing the target floor.

**Inventory (Phase 7, engine complete, 3 of 6 pages).** `StockService` as the only writer of a stock balance, with the movement written in the same transaction and `beforeQty`/`afterQty` stored so the ledger can be replayed and compared. Never-negative enforced in the database as well as in service code. Part request lifecycle on `PART_REQUEST_GRAPH`, with issuing bound to the stock transaction. Partial fulfilment (SCENARIOS.md 3.5, open since Phase 2) settled: one request, many issues, fulfilment derived. Requests queue, Stock table, and the Item page whose ledger *is* the page.

**Finance Core (Phase 8, engine complete).** Exact money arithmetic in `@mop/shared/money` — integer minor units, never a float, with rounding and the discount/tax order decided once. Running total, immutable issued invoices with snapshotted prices, and idempotent payments where the same key with a DIFFERENT amount is refused rather than replayed. `paid` is derived from payment rows and a test corrupts the cached column to prove it. `tools/lint-money.mjs` is the fourth linter.

**Documentation.** Vision, systems, capability model, scenarios, three engineering charters, design language, phase map and per-phase docs. README + CONTRIBUTING as the repository front door.

## 4. Current task — what to do next

**Write `docs/phases/PHASE_9.md` first, then build it.** The detail document comes before any code, as in Phases 5–8.

Before writing any of it, read `DESIGN_LANGUAGE.md` §0.5 (character), §1 (the red rule) and **§7.5 — structure is decided per page, researched against how that page type is solved outside MOP, and argued in the phase document.**

Phase 9 inherits one deferred item and one seam:

- **Refunds and credit notes.** Phase 8 built payments but no refund flow, deliberately: a refund is only half the concern, and the other half is a credit note, which is a Billing artifact with its own numbering and immutability rules. `RefundRequest` and `CreditNote` exist in the schema and are untouched. Reasoning is in `PHASE_8.md` §6.
- **The country-adapter seam.** Egypt ETA and Saudi ZATCA make an invoice a compliance artifact. `GenericBillingAdapter` is the default, and the seam must exist before a market forces it rather than after.

Note also that `BILLING` = `EXTERNAL` is a real capability state, not on/off: totals are still computed and shown, but the legal document is issued elsewhere and `FinanceConfiguration.externalInvoiceReference` records where.

*(Previously: Phase 8 — Finance Core, complete.)*

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
| Visual character is derived from the **workshop job card in the rack** | A design system with justified values but no decided character converges on the generated-UI default. Priority is a card edge because a rack already reads that way |
| **Red `#d41717` is the only saturated colour**, and always means "attention here" | Keeps it at 10% without policing a percentage — there is nowhere else it is allowed. `--brand` and `--danger` are the same value on purpose |
| **Light is the ground; dark is opt-in** and true black, never navy | Bright bays, tablet glare, and the artifact being replaced is paper. Default dark is the most-cited tell of AI-generated UI |
| **No house page layout** — composition is decided per page | Product owner's rule. A single template shapes pages by the framework instead of by their job |

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

# Project State

> **Purpose:** everything needed to continue MOP in a fresh session without the previous conversation.
> **Companion:** [`CLAUDE.md`](./CLAUDE.md) holds permanent knowledge (architecture, rules, toolchain). This holds *where we are*.
> **Last updated:** 2026-08-12, after closing the Inventory/Branch Manager/Platform page gap, drafting Phases 15–17, completing a second 40-scenario platform-layer discovery pass that drafted Phases 18–20, and a third 20-item edge-case hardening pass attributed against existing phases.
> **Keep this current.** Update it at the end of any phase task, and before ending a long session.

---

## 1. Current objective

**Three tracks are now open at once.** Continue closing the remaining
page gap toward Phase 9; carry forward the drafted Phases 15–17
(specialization); carry forward the newly-drafted Phases 18–20 (tenant
relationships, governance depth, operational resilience at scale). None
of the three has started as code. All three are planning output — real,
detailed, and waiting.

The page-gap audit against `detailed-specs/` originally found the spec
requires **53 pages** against **15 built**. [`PAGE_INVENTORY.md`](docs/PAGE_INVENTORY.md)
tracks every page and is the definition of done; it now reads **23 of
53**. Closed since the last update: Inventory Home / Catalog Control /
Reports (Inventory Manager now 5/6), Team Setup (Branch Manager now
**7/7, complete** — required a new permission-resolver layer, since team
management is owner-delegated, not capability- or role-gated), and the
Workshops list (Platform Super Admin now 3/6 — the fourth "finished
system with no door": `WorkshopsService`, freeze/reactivate and the
health service had existed since Phase 2 with no page).

**New:** [`docs/scenarios/`](docs/scenarios/) holds 20 detailed
walkthroughs across four deliberately different workshop shapes
(1-branch single-operator, 4-branch dealership network, field-service
heavy-equipment, 6-branch quick-lube chain), written to discover what
MOP is missing for real, differently-specialized workshops — not what's
missing from the page count. [`FINDINGS_SYNTHESIS.md`](docs/scenarios/FINDINGS_SYNTHESIS.md)
consolidates 78 findings into **three new phases, 15–17**, added to
`PHASE_MAP.md` and detailed in `docs/phases/PHASE_15.md`–`PHASE_17.md`.
They are drafted, not started — no code yet.

**Newer:** [`docs/scenarios2/`](docs/scenarios2/) holds a second,
harder 40-scenario pass — 8 workshops, 5 scenarios each — this time
watched from the **super admin's console and the server's own machine
room**, not the workshop floor. It asks whether a workshop can be stood
up using only MOP (a hyper-specialized motorsport-prep shop that fits
none of Phase 17's four starter profiles), how a second country breaks
unstated assumptions (Saudi Arabia — VAT/ZATCA, a Friday–Saturday
weekend, Gulf-dialect Arabic), what a 50-branch bulk migration weekend
actually requires, what a fraud investigation demands of governance
that assumed good faith everywhere, what happens when tenants merge,
split, or are owned by a holding company, and what a low-connectivity
workshop reveals about an architecture that has always assumed a live
connection. [`docs/scenarios2/SYNTHESIS.md`](docs/scenarios2/SYNTHESIS.md)
traces one dominant finding through five of the eight workshops —
`Tenant.id` is treated everywhere as permanent and singular, and real
businesses are sold, merged, split, invested in, and closed — plus a
full cross-reference table of all 40 scenarios' findings. Consolidated
into **three more new phases, 18–20**, added to `PHASE_MAP.md` and
detailed in `docs/phases/PHASE_18.md`–`PHASE_20.md`. Also drafted, not
started.

`PHASE_MAP.md` was rebuilt in full this session to carry both discovery
passes: updated progress table (23/53 pages, all four linters, 377+158
tests), the specialization chain (15–17) as before, the new tenant/
governance/resilience chain (18–20), and a rewritten dependency graph
showing where 18–20 couple back into the original 9–14 chain (Phase 9's
country-adapter scope should read Phase 20.D first; Phase 12's
reporting engine should sequence after Phase 19.G or explicitly name
live-only reporting as a stated limitation).

Three doors closed earlier this arc, from the original audit:

1. **Invite Accept.** Add Workshop writes `inviteTokenHash` and nothing redeems it, so every owner created through the product cannot log in. *(closed)*
2. **Customer Decision Page.** `secureToken` appears nowhere in the API. The customer cannot approve anything. *(closed)*
3. **Audit & Change History.** `AuditLog` is written on every risky action; `audit/` has no controller. *(closed)*

## 2. Where we are

| Phase | State |
|---|---|
| 1 — Runnable and Provable | 🟢 7 of 7. CI cause found and fixed; awaiting a green run to confirm |
| 2 — Design Completeness | ✅ complete |
| 3 — Governance Runtime | 🟢 4 of 5. Capability UI moved to Phase 5 (5.F) |
| 4 — Operations Spine | ✅ complete |
| 5 — Branch Manager | ✅ **complete — 7 of 7 pages**, Team Setup closed |
| 6 — Technician | ✅ complete — 6.A–6.G |
| 7 — Inventory | ✅ **complete — 6 of 6 pages**, Returns/Movements closed |
| 8 — Finance Core | 🟠 engine done; Owner "Money" page owed (Phase 10) |
| **9 — Billing / Invoicing** | ✅ **complete** — refund workflow + compliantBlocked closed |
| **10 — Team Leader & People/Performance** | ✅ **complete (narrowed)** — 4 Team Leader pages + Owner Home; Money page and staff exit-reason/rehire-eligibility re-planned out, see `docs/phases/PHASE_10.md` |
| 11–14 | ⬜ not started |
| 15 — Specialization Discovery | ⬜ **drafted**, not started — `docs/phases/PHASE_15.md` |
| 16 — Specialization Structure | ⬜ **drafted**, not started — `docs/phases/PHASE_16.md` |
| 17 — Specialization at Creation | ⬜ **drafted**, not started — `docs/phases/PHASE_17.md` |
| 18 — Tenant Relationships | ⬜ **drafted**, not started — `docs/phases/PHASE_18.md` |
| 19 — Governance Depth | ⬜ **drafted**, not started — `docs/phases/PHASE_19.md` |
| 20 — Operational Resilience at Scale | ⬜ **drafted**, not started — `docs/phases/PHASE_20.md` |

Platform Super Admin: 3 of 6 pages (Add Workshop Owner, Workshops,
Builder Control partial). Governance Controls, Platform Reports and
Workshop Live View still owed.

**Verified at last commit:** 519 API/shared tests + 163 web tests, typecheck clean, all **four** custom lint rules passing, full build green.

**Phase 9 (this arc, in progress).** `docs/phases/PHASE_9.md` written first. Built and tested: `BillingModule` (`GenericBillingAdapter` + `BillingService`), `BillingDocument` as its own model distinct from `Invoice` (Finance keeps the settlement record; Billing gets its own row, lifecycle, immutable snapshot), wired into `FinanceService.issueInvoice()` as a typed-contract call in the same transaction, External Billing Mode made load-bearing (suppresses document creation, proven by test), the adapter seam proven swappable (a test-only adapter produces a differently-shaped document from the same snapshot without the amount changing), and `CreditNote` issuance with real sequential numbering (`credit_note_sequences`, same atomic-upsert pattern as invoices). Found and fixed a real gap in `docs/SYSTEMS.md`'s own quoted adapter interface while implementing it: `generateCreditNote`/`generateDebitNote` had no `amount` parameter (silently assumed a credit note always refunds the full invoice) and no numbering parameter — both docs corrected alongside the code.

**Phase 9 closed out.** The refund-approval workflow now exists: `requestRefund`/`approveRefund`/`rejectRefund` on `FinanceService`, with `finance.refund.request`/`finance.refund.decide` as two separate permission keys (a branch manager can request, only the owner decides, by default) so the separation-of-duties gap this creates is at least visible until Phase 19 enforces it structurally. `settlement()` nets a COMPLETED refund out of `paid` rather than editing a payment row. `compliantBlocked` is computed and upserted on every `issueDocument()` call (`ADAPTER_COVERED_COUNTRIES` is empty until a real country adapter ships) — visibility only, per the phase doc, and not yet surfaced on the Workshops list drawer (a small remaining UI task, not blocking). `EgyptETAAdapter`/`SaudiZATCAAdapter` remain explicitly out of scope per the phase doc's exit criteria.

**Also fixed this arc, found while reading code for the first time, not by design:** `FinanceService.nextInvoiceNumber()` was `tx.invoice.count()+1` racing a unique-constraint backstop, rewritten to a real atomic upsert against the previously-unused `InvoiceSequence` table, proven by a 10-way concurrent-issuance test. `StockService.record()`'s "locked for the duration" comment was untrue — a plain `findUnique` takes no row lock under Postgres's default `READ COMMITTED`; rewritten to `SELECT ... FOR UPDATE`, proven by a concurrent-issue test. Both are edge cases H3 and H6/E16 in `docs/scenarios3/EDGE_CASE_REGISTER.md`, now marked fixed there.

## 3. Completed work

**Foundation.** 1,409-line Prisma schema (16 WO statuses, 19 part states, capability tables). Reproducible environment with `pnpm run doctor`. DB path verified end-to-end. Security baseline: rate limiting, boot-time config validation, helmet, body limits, request IDs, graceful shutdown. Money serialization interceptor. RTL/i18n foundation with a linter enforcing logical CSS.

**Capability engine.** Registry, capability-annotated workflow graphs, removal policies, reachability validator, gate registry with ownership, seven shipped profiles. Time-ranged `TenantCapability` storage. Runtime enforcement above role and user override. Change pipeline with live-data preconditions and atomic apply. Permission resolution is constant-cost (20 keys = same 6 queries as 1).

**Operations spine.** Capability-aware workflow router with intent-labelled edges. Gate evaluator, registry-driven and capability-filtered. `WorkOrderLifecycleService` as the sole writer of work-order status. Transactional intake with ownership transfer. Technician records with blocker routing.

**Branch Manager (Phase 5, 6 of 7 pages).** Attention Center, Work Orders board and Workspace, Customer Intake, Approvals, Delivery & Payments, and the Super Admin capability UI. Plus 5.0, a mid-phase design-language redo after the product owner rejected the first visual language outright.

**Technician (Phase 6, complete — 3 of 3 pages).** Its own shell with a 56px density layer derived from what a gloved hand can hit, three pages (Now / My Work / Work Card), the Finish Gate shown as a checklist before the press, and `tools/lint-touch-targets.mjs` enforcing the target floor.

**Inventory (Phase 7, engine complete, 3 of 6 pages).** `StockService` as the only writer of a stock balance, with the movement written in the same transaction and `beforeQty`/`afterQty` stored so the ledger can be replayed and compared. Never-negative enforced in the database as well as in service code. Part request lifecycle on `PART_REQUEST_GRAPH`, with issuing bound to the stock transaction. Partial fulfilment (SCENARIOS.md 3.5, open since Phase 2) settled: one request, many issues, fulfilment derived. Requests queue, Stock table, and the Item page whose ledger *is* the page.

**Finance Core (Phase 8, engine complete).** Exact money arithmetic in `@mop/shared/money` — integer minor units, never a float, with rounding and the discount/tax order decided once. Running total, immutable issued invoices with snapshotted prices, and idempotent payments where the same key with a DIFFERENT amount is refused rather than replayed. `paid` is derived from payment rows and a test corrupts the cached column to prove it. `tools/lint-money.mjs` is the fourth linter.

**Documentation.** Vision, systems, capability model, scenarios, three engineering charters, design language, phase map and per-phase docs. README + CONTRIBUTING as the repository front door.

**Page-gap closure (this arc).** Inventory Home (7 triage cards, per-warehouse breakdown), Catalog Control (paginated editor, cost gated behind a new `inventory.cost.view` permission defaulting false), and Reports (velocity-based stock risk per warehouse, warehouse comparison suppressed rather than shown as a one-bar chart) for Inventory Manager. Team Setup for Branch Manager, which required a **new permission-resolver layer** — `DelegationLayer`, position 8 of what is now a 10-layer chain (`permission-resolver.service.ts`) — because team management is owner-delegated per workshop, a decision neither the capability engine nor a role template owns. The Workshops list for Platform Super Admin: server-side paged/sorted/filtered table, a details drawer (its own component, split out after the combined page tripped the CSS budget), and freeze/reactivate with a live-computed impact preview.

**Scenario research (this arc).** 20 scenarios across `docs/scenarios/`, four workshops chosen to be as structurally different as possible, each finding 3–4 core product mistakes by walking the software step by step. Synthesized into `FINDINGS_SYNTHESIS.md` and three new phases (15–17) added to `PHASE_MAP.md`, detailed in their own phase docs. No code from this track yet — it is planning output, matching this project's rule that re-planning at a phase boundary is expected, silent drift is not.

**Second scenario pass (this arc).** 40 scenarios across `docs/scenarios2/`, eight tenant profiles chosen to stress the platform layer specifically — super admin control, workshop creation using only the product, and the server under genuine multi-tenant load — rather than any one workshop's daily operation. Synthesized into `SYNTHESIS.md` with a full cross-reference table, and three more new phases (18–20) added to `PHASE_MAP.md`, detailed in their own phase docs. Also no code yet.

**Third scenario pass — edge cases (this arc).** 20 items across `docs/scenarios3/` — 10 hard, 10 extremely hard — not persona-driven, a direct audit for rare conditions a real deployment will eventually hit: concurrent writes racing each other (blockers, team-membership moves, invoice numbering, payment idempotency, freeze/reactivate), clock and calendar edge cases (leap-year warranty dates, replica clock skew, database failover), and data-integrity edge cases (hard-deleting a `ControlSetting` row instead of deactivating it, migrations against a dormant archived tenant). Two real, previously-unverified findings worth flagging specifically: `FinanceService.nextInvoiceNumber()` computes `count()+1` inside a transaction and relies on a unique-constraint backstop, while the schema already has an unused `invoice_sequences` table sitting right next to it (H3); and the stock-never-negative guarantee's actual atomicity (single `UPDATE` vs. read-then-write) was never verified against the generated SQL (H6/E16). None of these earned a new phase — `PHASE_MAP.md` gained rule 8 instead: a hardening pass attaches to the phase that already owns the affected system, via `docs/scenarios3/EDGE_CASE_REGISTER.md`, not a new phase number. Each affected phase (1, 3, 4, 5, 7, 8, 15, 18, 19, 20) now carries an inline "Edge cases owed" note.

## 4. Current task — what to do next

**Four directions are now legitimate next steps; pick based on what's asked for.**

**A — Continue the page-gap track toward Phase 9.** Remaining: Returns/Movements actions (accept/reject a return, request clarification — Inventory Manager's last owed page), Platform's Governance Controls / Platform Reports / Workshop Live View, then Phase 9 (Billing/Invoicing) as originally planned. Before finalizing Phase 9's scope, read `docs/phases/PHASE_20.md` §20.D — the country-adapter seam is sharper than originally scoped; a tenant onboarded into a country without a ready adapter needs an explicit **compliant-blocked** state, not silent non-compliance. See §1 above.

**B — Start Phase 15.** The scenario research is done; Phase 15 is drafted and ready to build against. Its exit criteria and the primitives it owns (service card, measurement form, position taxonomy, credential, blocker reason) are in `docs/phases/PHASE_15.md`. Do not start Phase 17's creation-time UI before 15 and 16 exist — see that document's closing note, which names Phase 7's own history as the cautionary case. Also note Phase 17's scope was sharpened this session: a fixed starter-profile library under-covers reality on day one (Workshop 1 of `docs/scenarios2/`), so Phase 17 must ship an explicit "start from nothing" authoring path as a first-class option, not a fallback.

**C — Start Phase 18.** Independent of both other tracks, gated only behind Phase 3 (already complete). `docs/phases/PHASE_18.md` names six sub-items (18.A–18.F); 18.A (external stakeholder access) and 18.D (the tenant archive/retention lifecycle) are the two with the clearest, smallest schema surface and are the recommended starting point if this track is picked. 18.F (merge/split) is a design decision, not an implementation, and should be scoped last within this phase.

**D — Work the edge-case register.** Independent of the other three; each item is small and attaches to already-complete phases, so this is the lowest-risk, fastest-to-land track if a quick win is wanted. Start with the two flagged **verify first** in `docs/scenarios3/EDGE_CASE_REGISTER.md` (H6/E16, the stock-decrement atomicity question, and H3, the invoice-numbering race) — both are a few hours of reading generated SQL plus one concurrency-specific integration test each, and both touch money or inventory correctness directly, which the register's own severity note ranks above the more dramatic-sounding items like E20's database failover.

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
4. ~~Multiple partial issues against one part request are not expressible~~ **Resolved.** `IssuedItem.partRequestId` is deliberately NOT unique (see the schema's own comment) precisely so this is expressible; fulfilment is derived by summing, never cached. This entry was stale.
5. **Structured logging** is still outstanding from Phase 1.4. The correlation id it needs is already emitted.
6. **Billing vs Finance split** is decided but only Finance-side contracts exist; no billing adapter is built yet (Phase 9).
7. **No technician-facing HTTP endpoint exists for the part-request lifecycle at all** — found while closing Returns/Movements. `PartRequestService` (request, issue-receipt, return, everything) is called only from `InventoryController` and from tests; nothing in `apps/api/src/technician/` or the Work Card web page wires a "request a part" or "return a part" action, despite the Work Card being one of Phase 6's shipped "10 tools" pages. The Inventory Manager's side of the return queue is now fully built and tested (service-level, via direct `PartRequestService` calls in integration tests), but nothing in the product can *originate* a request or a return through the UI a real technician uses. Needs its own task against Phase 6, not silently absorbed into whatever's being built next.

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

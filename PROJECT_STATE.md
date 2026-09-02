# Project State

> **Purpose:** everything needed to continue MOP in a fresh session without the previous conversation.
> **Companion:** [`CLAUDE.md`](./CLAUDE.md) holds permanent knowledge (architecture, rules, toolchain). This holds *where we are*.
> **Last updated:** 2026-09-02 — the mission is now governed by
> [`docs/STRATEGY_B_EXECUTION_LEDGER.md`](./docs/STRATEGY_B_EXECUTION_LEDGER.md). Read that file first; it is the live queue. See the entry directly below for what just landed, then the entries after it for the history this new mission builds on.
> **Keep this current.** Update it at the end of any phase task, and before ending a long session.

---

## 0. Mission pivot: Strategy B — Quick-Service Vertical, 14-day contract (2026-09-02)

The owner gave a full 14-day product-scope contract directly in chat (four
strategies compared — Minimal OS, Quick-Service Vertical, Configurable
Core, Pilot Product — with Strategy B chosen: the existing
`SINGLE_BAY_QUICK_SERVICE` capability profile shipped as the product,
`BILLING=EXTERNAL` as the compliance seam since no country adapter
exists) and instructed this session to self-manage the mission queue,
work it continuously across sessions without stopping for confirmation,
and resume automatically after any usage/token limit recharges. The full
MUST/SHOULD/DEFERRED/FORBIDDEN contract, current code-verified status per
item, and the next-item pointer live in
[`docs/STRATEGY_B_EXECUTION_LEDGER.md`](./docs/STRATEGY_B_EXECUTION_LEDGER.md)
— that file, not this section, is the live queue going forward.
`docs/UI_UX_EXECUTION_LEDGER.md`'s remaining items were folded into the
new ledger's "Also queued" section rather than abandoned.

**First slice shipped this pass — M-1 (spine ignition, backend) + M-3
(decision lifecycle hygiene):** a code-verified audit (Explore agent, full
file:line citations) found the six lifecycle intents `START_INSPECTION`,
`REQUEST_APPROVAL`, `APPROVE`, `START_WORK`, `ASK_CUSTOMER`,
`CUSTOMER_RESPONDED` had zero production callers — a job could be booked
in and could never move again except through a test calling
`WorkOrderLifecycleService.apply()` directly. Fixed:

- `TechnicianWorkService.startInspection`/`.startWork` (new), exposed at
  `POST technician/work-orders/:id/start-inspection`/`start-work`.
- `CustomerDecisionService.raiseAndSend`/`applyAnswers`
  (`apps/api/src/systems/customer/decision.service.ts`) now call the
  lifecycle service themselves, outside their own write transactions, via
  a new `moveIfPossible` that swallows only a refused transition
  (`ConflictException`) — a genuine bug still propagates.
  `raiseAndSend` tries `REQUEST_APPROVAL` then `ASK_CUSTOMER`;
  `applyAnswers` tries `APPROVE` (only when at least one item was actually
  approved — a full rejection must never read as an approval) then
  `CUSTOMER_RESPONDED`, and only once the whole request is resolved, not
  on a partial answer.
- Branch Manager gained parity endpoints — `POST
  branch-manager/work-orders/:id/tasks` and `.../decisions` — reusing the
  exact same `TechnicianWorkService.createTask`/`CustomerDecisionService.
  raiseAndSend` the technician's own card calls, so both doors into the
  same action agree by construction.
- **M-3:** `CustomerDecisionService.read()` now writes `SENT -> VIEWED`
  (best-effort; a read must never fail because the status write did) —
  `CUSTOMER_DECISION_GRAPH` had declared that edge since it was written
  and nothing wrote it. New `cancel()` lets staff withdraw an ask nobody
  has answered yet (refuses once `respondedAt` is set), wired at `POST
  branch-manager/approvals/:requestId/cancel`.
- New permission keys (all in `packages/shared/src/permissions/`):
  `task.start_inspection`, `task.start_work`, `task.branch.create`,
  `customer_decision.cancel` — granted to TECHNICIAN/BRANCH_MANAGER by
  default respectively. **Note:** existing seeded tenants will not have
  these rows until re-seeded or backfilled; new tenants get them
  automatically since onboarding seeds from this map.

**Verified:** 15 new integration tests against real Postgres
(`decision.integration.spec.ts`, `technician-work.integration.spec.ts`),
full gate green — 884/885 API tests (the one failure,
`scheduler-lock.integration.spec.ts`, is a pre-existing flaky
advisory-lock race under full-suite load; confirmed unrelated, passes
clean in isolation), 243 shared tests, all 6 custom lints, `apps/api` +
`packages/shared` typecheck, full build (API + web).

**Web wiring shipped in a second commit the same pass** (`1c6ef0a`): the
Tech Work Card's contextual primary action (Start inspection / Start
work, computed from job status) and the BM workspace's Add-task /
Ask-the-customer panels plus a Cancel action on unanswered decisions.
272/272 web tests, full build clean. See the ledger's "Next item" (M-5,
the technician part-return leg) for the exact resume point.

**Pre-existing uncommitted work found at session start, left untouched by
this pass, on purpose:** `apps/api/src/control/platform/
plan-limits.service.ts` had an uncommitted, substantial extension in the
working tree (a per-tenant `ControlSetting`-backed override on top of the
plan default — `EffectiveLimit`, `effectiveLimit(s)`, an
`activeOverride` read) referencing a `TenantLimitOverrideService` in
`apps/api/src/control/governance/` that does not yet exist. It typechecks
and builds cleanly standalone (confirmed as part of this pass's full
gate) but is not part of the Strategy B mission and was not started by
this session, so it was left exactly as found rather than committed,
discarded, or finished. It appears to be the "per-tenant override" item
the 2026-08-25 Plan-ceilings entry below named as explicitly not done —
worth finishing as its own slice, but not this one.

---

## 0. Plan ceilings (`maxBranches`/`maxUsers`/`maxWarehouses`) now enforced on an ongoing basis, not just at creation (2026-08-25)

Found while investigating the Autonomous Execution track's "Limits & Entitlements" queue item: `Plan.maxBranches`/`maxUsers`/`maxWarehouses` were checked exactly once, at workshop creation (`OnboardingService.validate()`, against the draft's own counts), and never again anywhere in the codebase. Nothing stopped a workshop from adding an unbounded number of branches, warehouses, or staff after that single moment — the ceiling a Super Admin sets at sign-up was decorative for the rest of the workshop's life. A real, unambiguous configuration island: `BranchWarehouseService.createBranch()`/`createWarehouse()` and `StaffService.invite()` had zero awareness the field existed.

New `PlanLimitsService` (`apps/api/src/control/platform/plan-limits.service.ts`, its own dependency-free `PlanLimitsModule`) exposes `assertBranchCapacity`/`assertWarehouseCapacity`/`assertUserCapacity`, each counting only **active** rows (a deactivated branch/warehouse/staff account frees the seat) against the tenant's plan ceiling, throwing a real 403 (`plan_branches_limit_reached` etc.) with a message naming the actual limit. Called as the first real check in all three creation paths. Workshop creation itself is untouched — `PlatformService`'s onboarding-time writes go straight to Prisma, as before, so the one-time draft-validation ceiling check there is unaffected and there's no double-application risk.

No web changes were needed: Organization & Access's existing Add Branch/Add Warehouse/Invite Staff forms already render `PresentedError.message` through the shared `ErrorBanner`/error-interceptor plumbing, so the new refusal surfaces automatically.

Proven against real Postgres: a new integration suite (`plan-limits.service.integration.spec.ts`) creates a plan capped at 1 of each resource, confirms the first of each succeeds and the second is refused with the real error shape (including through the actual `BranchWarehouseService.createBranch()` caller a controller would use, not just the bare service method), and confirms deactivating the occupying branch frees the seat. Sanity-checked against the real seeded dev tenants (Apex Motors: 2/10 branches, 2/5 warehouses, 7/100 staff; Delta Quick Service: 1/1 branches, 0/0 warehouses by design, 1/10 staff) to confirm the seeded demo accounts sit comfortably under their ceilings and are not accidentally blocked.

Full gate green: 871 API tests (866 + 5 new), all 6 lints, `apps/api` typecheck and build.

**Still open from the same "Limits & Entitlements" investigation, not done in this pass:** whether Super Admin should be able to narrow one specific workshop's ceiling *below* its shared plan's (a per-tenant override via `ControlSetting`, distinct from swapping the tenant onto a different `Plan` row entirely, which is already possible today by changing `Tenant.planId`). No product surface asks for that narrower case yet — recorded here rather than built speculatively.

---

## 0. Data Analyst Export built — Data Analyst is 7/7 pages (2026-08-25)

The last named gap in the Data Analyst role (`docs/detailed-specs/data-analyst.md`'s Saved Views / Exports page) is closed. `AnalystSavedViewsService`'s own doc comment used to say plainly: "Export file generation is deliberately separate ... no endpoint in this service writes report bytes." That endpoint now exists: `GET /analytics/export/:category` (`apps/api/src/insights/analytics/analytics-export.service.ts`) re-runs the exact same `build()` call each of the 5 analytical pages itself calls, serializes the result to CSV with a small generic tree-walker (`csv.util.ts` — no per-category template, so a new report shape is exportable for free), and streams it back with `Content-Disposition: attachment`. Gated twice: `analytics.export` (denied outright when the plan's `allowedExports` is empty) and then, in the service, the specific category against that same list — a plan can permit exporting Operations without permitting every category. Every export leaves a real `LOW`-risk `analytics.export.generated` audit row.

Each of the 5 analytical pages (`analyst-operations-page`, `-people-page`, `-inventory-page`, `-decisions-page`, `-feature-adoption-page`) now carries its own **Export CSV** action (`ExportAction` component, mirroring the existing `SavedViewAction` pattern), so the spec's "from any page" is real rather than centralized on the Saved Views page alone. **Named limitation, not silently dropped:** no analytical page has a date-range filter UI yet — every page calls its own report endpoint with no query params and shows the server's default range — so "reflecting exactly the currently-filtered view" is currently "exactly the currently-shown default range." The export endpoint itself already accepts `from`/`to`/`groupBy` and will honor real filters the moment a page has any to send.

Proven against real Postgres, not mocks: a new HTTP-level integration test (`analytics-export.controller.integration.spec.ts`, real login, real cookie, real guard chain) covers a successful export with real audit-row assertions, a category the plan doesn't allow (403 even with the permission granted), a plan with no exports allowed at all (403), and an unauthenticated request (401) — plus a unit test for the CSV tree-walker. Verified again by hand against the real dev database and a running API process: logged in as the seeded `analyst@apex-motors.local`, pulled all 5 categories over real HTTP, got real CSV bytes reflecting this session's actual seeded data (the demo technician, the demo inventory item, the demo customer decision), and confirmed the audit rows landed. The dev/demo seed's plans previously left `Plan.allowedExports` empty by default (nobody had populated it after the column was added), which would have made the feature permanently unreachable through the seeded accounts; `seed.ts` now sets it for any plan with the Reports module enabled.

**Also fixed in passing, small and unrelated to the export work:** `login-page.spec.ts` still asserted the pre-`Access Denied` fallback behavior (`navigateByUrl('/')` for an unrecognized landing-page key), which `identity/landing.ts`'s own doc comment says was deliberately changed to `/access-denied` — "an unknown landing page is an access boundary, not a guessable role fallback." The test was simply never updated when that change landed; fixed in its own commit.

Full gate green: 866 API + 243 shared + 272 web tests, all 6 lints, `apps/api`/`packages/shared` typecheck, full build (API + web).

---

## 0. Policy engine mission complete, merged with the concurrent reorg (2026-08-22)

The policy engine backend-first mission (started from `docs/POLICY_COVERAGE_MATRIX.md`'s 9-ENFORCED/7-RECORDED baseline) is done: all 16 registered policies are now `ENFORCED` with real, wired backend consumers. `DISCOUNT_AUTHORITY`, `QC_MANDATORY`, `UNCOVERED_COUNTRY_BILLING`, `TIME_TRACKING`, `WORKING_WEEK`, `POST_CLOSE_ADDENDA` and `APPROVAL_WEIGHT` went from `RECORDED` to real backend behaviour this pass, each proven against real Postgres. New primitives built along the way: `WorkOrderFacts` (a per-work-order dynamic-fact set threaded through the workflow router alongside `PolicyAnswers`), a `WorkOrderNote` model, `Task.actualMinutes`, and a `requiresAcknowledgement` per-decision-item projection driving the customer decision page's acknowledgement modal. `docs/POLICY_COVERAGE_MATRIX.md` still needs a pass to reflect the new 16/0 split.

This branch (`claude/jolly-cray-as9y2r`) diverged from `main` before the `apps/api`/`apps/web` directory reorg (`REORGANIZATION_REPORT.md`, `CODE_MAP.md`) described below landed there. Merging the two required reconciling roughly 30 conflicting files by hand: moving this mission's logic onto the new `control/`/`systems/`/`experiences/` layout, and reconciling two independent extensions of `CustomerDecisionService`, `FinanceService.emit()` and `AttentionQueueService` that had each grown new parameters for unrelated reasons — main's authenticated customer-portal decision flow and customer-timeline events, this branch's `APPROVAL_WEIGHT`/`DISCOUNT_AUTHORITY`/`WORKING_WEEK` enforcement. See the merge commit for the reconciliation in full.

---

## 0. Documentation consolidation — complete (2026-08-21)

**Status:** complete. This section was originally written mid-task as a checkpoint before a pause; the user said `continue` and every item originally listed below as "not done yet" has since been finished. Left in place, corrected, as the record of what changed and why — a future session should not re-open this as pending work.

**Why this pass started:** a code-verified build-status audit (see the session's chat transcript — every page route and API controller was read directly, not inferred from docs) found that this project's own tracking documents had drifted from each other and from the real code. Concretely: `PROJECT_STATE.md` (this file) claimed 23/53 pages built; `docs/PHASE_MAP.md` contradicted itself internally (23/53 at one line, 34/53 at another); `docs/PAGE_INVENTORY.md` claimed 48/53; and two of the project's own prior audits (`docs/archive/audits/IMPLEMENTATION_AUDIT.md`, `docs/archive/audits/PHASE_COMPLETION_AUDIT.md`) claimed Platform Super Admin's Governance Controls and Workshop Live View pages were unbuilt — when a direct read of the actual frontend/backend code this session found both are real, complete, and wired to working endpoints. The session's own live code audit is therefore the most current ground truth available, ahead of every existing doc including the two audits named above.

**Completed in this pass (committed and pushed — see commit SHA below):**
1. Deleted the stray, gitignored, byte-identical nested duplicate `MOP/` directory (a full extra copy of the repo — not meaningfully separate content).
2. Archived six one-time, now-superseded "audit the codebase" documents to `docs/archive/audits/`: `GAP_ANALYSIS_CANONICAL_SPEC.md`, `ENGINEERING_KNOWLEDGE_TRANSFER.md`, `IMPLEMENTATION_AUDIT.md`, `PHASE_COMPLETION_AUDIT.md`, `ARCHITECTURE_DECISION_INVENTORY.md`, `UI_UX_EXECUTION_LEDGER.md`. Their unique findings (the D1–D21 debt register, the four-cluster analysis) are preserved on disk, just relocated — nothing was deleted outright except the confirmed duplicate above.
3. Archived the three consumed discovery-pass directories (`docs/scenarios/`, `docs/scenarios2/`, `docs/scenarios3/`) to `docs/archive/discovery/` — their findings were already synthesized into Phases 15–20 and the edge-case register; the raw walkthroughs are historical input, not living docs.
4. Fixed every cross-reference to the moved files/directories across `docs/phases/PHASE_9.md` and `PHASE_15.md`–`PHASE_21.md`, `docs/PHASE_MAP.md`, `docs/POLICY_DECISION_INVENTORY.md`, `docs/README.md`, and this file, so no link points at a path that no longer exists.
5. Fixed a stray machine-specific local file path (`C:\Users\Stanikzai\...`) left in `docs/detailed-specs/README.md`, pointing it at `REBUILD_PLAN.md` instead, which is what it actually meant.

**Completed after the pause, once told to continue:**
- `docs/PAGE_INVENTORY.md` rewritten and made the single canonical page-count source (now 46 complete + 7 partial + 0 missing, of 53), with corrected per-role headers that no longer claim "X/X ✅" when some rows are 🟡.
- `PROJECT_STATE.md` (this file) — §1 and §2 rewritten against the verified reality, with the stale paragraphs kept below marked superseded rather than deleted, and the final "what's next" priority list (previously in §13) corrected.
- `docs/PHASE_MAP.md` — its internal 23-vs-34 self-contradiction fixed, Progress table corrected role-by-role, Governance Controls and Workshop Live View marked resolved, and it now cites `PAGE_INVENTORY.md`'s total instead of keeping its own.
- Root `README.md`'s status line and documentation table rewritten.
- `docs/README.md`'s index fully rebuilt: lists `PAGE_INVENTORY.md`, separates "archived discovery passes" from "archived audits" with an explicit staleness warning on the latter, and fixes several relative-path links (`./scenarios/` style) that an earlier repo-wide sed pass had missed because it only matched `docs/scenarios/`-style absolute paths.
- One remaining broken link (`PROJECT_STATE.md`'s own historical §1 narrative, pointing at a since-moved `FINDINGS_SYNTHESIS.md`) and three cosmetic stale-label mismatches in `PHASE_15/16/17/21.md` (link target was already correct, only the visible backticked text still showed the old path) were found in a final link-sweep and fixed.

**Deliberately NOT done, and not part of this consolidation's scope:** the phase debt register (D1–D21) from the now-archived `PHASE_COMPLETION_AUDIT.md` was not reconciled item-by-item into a living document — most of it (translation pass, exports, several Phase 16–20 deferrals) is still open and already correctly reflected in `PAGE_INVENTORY.md`/`PHASE_MAP.md`'s per-item notes; only the items this session's code audit specifically re-verified (Governance Controls, Workshop Live View, the technician part-request/return lifecycle) were corrected. A full line-by-line reconciliation of the rest of that register was out of scope for a documentation-consistency pass and would need its own code-verification effort, the same way this one did. The 21 individual `docs/phases/PHASE_*.md` files' own prose status headers were also not rewritten — only their cross-reference links were fixed — so their prose may still disagree with the corrected trackers above in isolated spots; treat `PAGE_INVENTORY.md` and `PHASE_MAP.md` as authoritative over any individual phase doc's own header.

**Known issue/blocker:** the deleted `MOP/` directory left one empty, OS-locked top-level folder behind (`rmdir` reported "Device or resource busy" — a transient handle from an indexer or file watcher, not a real block). Its contents are already gone; the empty folder itself can be removed with a plain `rmdir MOP` once nothing has it open, or ignored — it is gitignored either way and carries zero content.

**Important caveat discovered when resuming after the pause:** between the checkpoint commit and resuming, other work landed on `main` from elsewhere — including a large reorganization of `apps/api/src` and `apps/web/src` into the layered structure (`audit/`, `runtime/`, `identity/`, `control/`, `systems/`, `experiences/`, `insights/` on the API side; `runtime/`, `ui/`, `domain/`, `experiences/` on the web side) that `CLAUDE.md` already describes. This is exactly the concurrent-session collision risk this file's own §7 item 8 warned about from an earlier incident. Nothing from this documentation pass was lost or overwritten — `git reflog` confirms the checkpoint commit is a clean ancestor of the current `HEAD`, and this second pass's edits applied without conflict. But it does mean: **specific file paths cited in this session's code audit (in the chat transcript this pass is based on, and possibly echoed in `docs/PAGE_INVENTORY.md`'s notes) may now point at pre-reorganization locations.** The *findings* (which pages are real, which subsystems have real business logic, where the HTTP-test-coverage gap is) were verified functionally and almost certainly still hold, since a reorganization moves files without rewriting behavior — but nobody should treat a specific `apps/api/src/<old-path>/foo.service.ts`-style reference in this consolidation pass as a currently-accurate path without checking it against `CODE_MAP.md` (new this pass, from the reorganization work, not from this documentation task) first.

**Unrelated, pre-existing uncommitted work left untouched by this pass, on purpose:** at session start there was already-uncommitted work in the working tree — modifications to `apps/api/src/branch-manager/branch-manager.controller.ts`, `apps/api/src/customer/decision.service.ts` and its integration spec, several `apps/web/.../approvals/*` files, `apps/web/.../customer/decision-answer.*`, and three new untracked `record-approval-drawer.*` files. None of that belongs to this documentation task — it was not staged, not committed, and not modified by this pass, and remains exactly as it was found. (That work later landed on `main` directly; it is the same authenticated customer-portal decision flow referenced in §0 above.)

---

## 0. Latest session on `claude/jolly-cray-as9y2r` — Workshop Creation rebuilt (2026-08-20)

`Add Workshop Owner` was a single form with eighteen fields. Creating a
workshop wrote a `Tenant`, a configuration blob, an owner and a
permission baseline — and nothing else. **Every workshop the product had
ever created was implicitly the full twelve-capability platform with no
policies, no structure and no named operator**, whatever the operator had
been shown. The capability engine's seven shipped profiles were
documented as "Super Admin applies one at creation" and wired to nothing.

It is now a nine-stage journey (identity · plan · capabilities ·
specialisation · policies · responsibility · structure · services ·
review) over a pure engine in `packages/shared/src/onboarding/`. The
browser previews a workshop with exactly the functions the server refuses
it with, so a preview cannot promise something the publish then rejects.

**Three defects found by building it, not by looking for them:**

1. **`TENANT_OWNER` holds no `inventory.*` permission.** A workshop that
   enabled Inventory and never staffed a storekeeper had part requests
   nobody on earth could approve, and nothing anywhere refused that
   configuration. The Responsibility stage asks who operates each
   capability and writes the missing grants at creation — never
   laundering a permission the dedicated role is explicitly denied.
2. **`enabledModules` came from the starter template while capabilities
   came from the profile** — two sources of truth for one fact, with
   `ModuleEnabledLayer` denying any key whose module is absent. A
   workshop with pricing ON and a MINIMAL template got a live
   `FINANCE_CORE` and no FINANCE module. Found by logging in as a created
   workshop's owner. `modulesForProfile` derives it now.
3. **`.rail-content { overflow-x: auto }` broke `position: sticky`
   shell-wide** — a scroll container redirects every descendant's sticky
   to itself. `clip` stops the same overflow without one; wide surfaces
   already scroll in their own `.table-scroll` wrappers.

**Also shipped:** the policy registry went from 3 to 14 entries (Tranche-1
of `POLICY_DECISION_INVENTORY.md`), each carrying an `enforcement`
declaration so the UI never implies a stored string is live when nothing
reads it. Four are wired to real consumers — including P-07, the
per-workshop separation-of-duties opt-in that Phase 19.A was reverted for
want of. A 128-country registry replaced the free-text country field,
deriving currency, timezone and the working week (the bug behind P-15).
Specialization packs became data (7 packs, 11 real cards) instead of an
if-chain over two profiles.

**Verified:** 725 API + 239 web + 201 shared tests, six linters,
typecheck and build clean. Three materially different workshops created
through real HTTP against real Postgres and asserted row by row; one
created through a real browser and its owner logged into afterwards to
confirm the runtime product matches the configuration.

**Owed:** bulk staff/customer/asset import (17.C/17.D) is still not part
of creation. What was "ten of the fourteen policies `RECORDED`" here is
now resolved -- see §0 above: the registry grew to 16 entries across later
sessions and every one is `ENFORCED` as of 2026-08-22.

---

## 1. Current objective

> **Superseded 2026-08-21** — the paragraphs immediately below (the "23 of 53" narrative) are kept as historical record of what this file said before a code-verified audit corrected it; they were true at the time they were written but are not the current state. **The current, verified state and the current objective are in the box right after this note.** See §0 above for the full account of what changed and why.

**Current objective, as of the 2026-08-22 autonomous pass:** the original 9-role product is essentially built — `docs/PAGE_INVENTORY.md` reads 46 complete + 7 partial + 0 fully-missing, out of 53 spec'd pages (up from the 23/53 this section originally reported). The active frontier is no longer "build more pages." Four things now matter more than any remaining page:

1. **Close the HTTP-level test-coverage gap** on the highest-risk subsystems (Finance, Billing, Inventory) — most of the API is proven only at the service layer, never through an actual guarded HTTP request. This is the single most likely source of an undetected regression as more people touch the codebase.
2. **Ship at least one real country's billing/invoicing adapter** (Egypt ETA or Saudi ZATCA) — `GenericBillingAdapter` is the only one that exists, so every real country is currently compliance-blocked. This blocks onboarding a real paying customer in most markets, which is a business blocker, not a technical nice-to-have.
3. **Close remaining partial page gaps only where their blockers are backed**: Access Denied and Password Reset are now built; Data Analyst Saved Views persistence is built; `Plan.allowedExports`/`analytics.export` gates export permission correctly, and the export endpoint itself (`GET /analytics/export/:category`, real CSV, real HTTP test) is now built too — Data Analyst is 7/7 pages complete.
4. **Get an explicit owner decision on Phase 21's Policy & Decision Architecture direction** before investing further in Phases 15–20 (specialization, tenant relationships, governance depth, resilience) — Phase 21 is deliberately paused at documents-only, by design, awaiting exactly this review.

Phases 15–17 (specialization) and 18–20 (tenant relationships, governance depth, operational resilience) remain real, valuable, partially-shipped tracks — see the corrected phase table in §2 for exactly how much of each is built versus still design-only. Below is the original historical narrative, kept for the audit trail:

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

**New:** [`docs/archive/discovery/scenarios/`](docs/archive/discovery/scenarios/) holds 20 detailed
walkthroughs across four deliberately different workshop shapes
(1-branch single-operator, 4-branch dealership network, field-service
heavy-equipment, 6-branch quick-lube chain), written to discover what
MOP is missing for real, differently-specialized workshops — not what's
missing from the page count. [`FINDINGS_SYNTHESIS.md`](docs/archive/discovery/scenarios/FINDINGS_SYNTHESIS.md)
consolidates 78 findings into **three new phases, 15–17**, added to
`PHASE_MAP.md` and detailed in `docs/phases/PHASE_15.md`–`PHASE_17.md`.
They are drafted, not started — no code yet.

**Newer:** [`docs/archive/discovery/scenarios2/`](docs/archive/discovery/scenarios2/) holds a second,
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
connection. [`docs/archive/discovery/scenarios2/SYNTHESIS.md`](docs/archive/discovery/scenarios2/SYNTHESIS.md)
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

> **This table was rewritten 2026-08-21 after a code-verified audit** (every route file and controller read directly, not inferred from any prior doc — see §0 above and `docs/PAGE_INVENTORY.md`, now the canonical page tracker). It corrects two real errors found in this project's own history: the previous version of this table listed Platform Super Admin at "4 of 6 pages, Governance Controls and Workshop Live View still owed" — both are in fact built and working; that claim traced back through two of this project's own prior audits (now in `docs/archive/audits/`) that had themselves gone stale without anyone noticing. That is exactly the failure mode this file exists to prevent, so it's recorded here rather than silently corrected.

| Phase | State |
|---|---|
| 1 — Runnable and Provable | ✅ complete |
| 2 — Design Completeness | ✅ complete |
| 3 — Governance Runtime | ✅ complete |
| 4 — Operations Spine | ✅ complete |
| 5 — Branch Manager | ✅ complete — 7 of 7 pages |
| 6 — Technician | ✅ complete — 3 of 3 pages, including a real technician-facing part-request/return lifecycle (request → approve → issue → receive → use → return) — a prior "missing entirely" note in this file's history was verified false this pass |
| 7 — Inventory | ✅ complete — 6 of 6 pages |
| 8 — Finance Core | 🟢 engine complete; Owner-facing Pricing page shipped in Phase 10's later passes |
| 9 — Billing / Invoicing | 🟠 engine and refund/credit-note workflow complete and tested; **zero country-specific legal invoicing adapters exist** (no Egypt ETA, no Saudi ZATCA) — every real country is currently compliance-blocked by design, a real go-to-market blocker, not a cosmetic gap |
| 10 — Team Leader & People/Performance | ✅ complete (narrowed) — all 4 Team Leader pages and Owner Home built, tested, reachable |
| 11 — Customer Portal | ✅ complete — 6 pages, all real; customer sessions still bypass the main permission resolver by design (documented, not a silent gap) |
| 12 — Reporting & Data Analyst | 🟢 6 of 7 Data Analyst pages complete; Saved Views persistence is built; export entitlement gate exists; export file generation remains deferred |
| 13 — System Automation | ✅ complete (lock, not a separate worker) |
| 14 — Internationalization & Release Readiness | 🟠 partial — permission-key lint + a real perf fix shipped; the translation pass itself was never done despite the phase's own title |
| 15 — Specialization Discovery | ✅ schema settled, 3 of 5 primitives proven end-to-end |
| 16 — Specialization Structure | ✅ minimum bar met; several sub-items deferred with reasons |
| 17 — Specialization at Creation | 🟠 backend seam shipped; no authoring UI at workshop-creation time |
| 18 — Tenant Relationships | 🟠 stakeholder access, archive lifecycle, and read-only tenant grouping shipped; no merge/split support (deliberate) |
| 19 — Governance Depth | 🟠 dispute records, refund-reason taxonomy, account restriction shipped; a second-approver separation-of-duties rule was built, broke 22 tests for legitimate single-storekeeper shops, and was reverted — needs a fresh per-workshop-opt-in design, not a retry |
| 20 — Operational Resilience at Scale | 🟠 one real concurrency race fixed and proven; "no offline mode" decided and documented; no real load testing has been done; bulk onboarding not built |
| 21 — Policy & Decision Architecture | 🟠 documents only, by design — ~70 policy decisions cataloged with defaults and build-posture verdicts; zero implementation; explicitly paused awaiting an owner decision before continuing |

**Platform Super Admin — 5 of 6 pages complete, 1 partial (not 4 of 6):** Add Workshop Owner, Workshops, **Control Center — Governance Controls**, and **Workshop Live View** are all real and working — both confirmed built by direct code read this pass, correcting the stale claim above. Only Control Center's Builder Control facet remains narrow (capability shaping only; the spec's broader theme/layout/workflow-policy/permission-matrix scope is unbuilt), and Platform Reports covers only its first two sections of six. See `docs/PAGE_INVENTORY.md` for the full breakdown.

**No page in the entire 53-page spec now has zero implementation.** Access Denied and Password Reset are built; Saved Views/Exports has the saved-view persistence half live and the export entitlement gate in place, with export file generation still deferred. See `docs/PAGE_INVENTORY.md` for the complete, current, canonical count (46 complete + 7 partial + 0 missing = 53) — this file and `docs/PHASE_MAP.md` now cite that document's total rather than each keeping a separate one.

**The other real, non-cosmetic gap found this pass:** automated test coverage. Only Auth, Access/Permissions, and Platform/Super-Admin have tests that exercise a real HTTP request through the session guard and DTO validation. Every other subsystem — Technician, Inventory, Finance, Billing, Customer Portal, Team Leader, Branch Manager, Governance/Audit, Organization — is tested only by calling the service layer directly against a real database, which proves the business logic but never proves the actual route wiring, guard behavior, or request validation. Business logic itself is consistently real everywhere: no stub services, no hardcoded fake returns, no leftover TODOs were found anywhere in `apps/api/src`.

**Platform Reports (closed this session, 2026-08-13).** Found already
implemented and uncommitted on this working tree at session start
(`PlatformReportsController`/`Service`, two web pages) — verified
complete against the full gate rather than rebuilt, then committed.
Level 1 (aggregate totals + per-workshop card grid, reusing
`WorkshopsService.list()`'s paging/sort/search) and Level 2's Usage
Overview section only; the spec's other five Level 2 sections (Feature
Usage, Builder Adoption, Operational Activity, Commercial Snapshot,
Health & Risk) are named as owed in `PAGE_INVENTORY.md`, not built as
empty tabs. `usageScore` is this project's own defined composite (a
recency bucket off `lastActivityAt`) since the source spec names "a
composite" without pinning a formula.

**Verified at last commit:** 480 API tests + 225 web tests + 121 shared tests, typecheck clean, all **five** custom lint rules passing (audit boundary, directional CSS, touch targets, money, permission keys), full build green.

**Phase 9 (this arc, in progress).** `docs/phases/PHASE_9.md` written first. Built and tested: `BillingModule` (`GenericBillingAdapter` + `BillingService`), `BillingDocument` as its own model distinct from `Invoice` (Finance keeps the settlement record; Billing gets its own row, lifecycle, immutable snapshot), wired into `FinanceService.issueInvoice()` as a typed-contract call in the same transaction, External Billing Mode made load-bearing (suppresses document creation, proven by test), the adapter seam proven swappable (a test-only adapter produces a differently-shaped document from the same snapshot without the amount changing), and `CreditNote` issuance with real sequential numbering (`credit_note_sequences`, same atomic-upsert pattern as invoices). Found and fixed a real gap in `docs/SYSTEMS.md`'s own quoted adapter interface while implementing it: `generateCreditNote`/`generateDebitNote` had no `amount` parameter (silently assumed a credit note always refunds the full invoice) and no numbering parameter — both docs corrected alongside the code.

**Phase 9 closed out.** The refund-approval workflow now exists: `requestRefund`/`approveRefund`/`rejectRefund` on `FinanceService`, with `finance.refund.request`/`finance.refund.decide` as two separate permission keys (a branch manager can request, only the owner decides, by default) so the separation-of-duties gap this creates is at least visible until Phase 19 enforces it structurally. `settlement()` nets a COMPLETED refund out of `paid` rather than editing a payment row. `compliantBlocked` is computed and upserted on every `issueDocument()` call (`ADAPTER_COVERED_COUNTRIES` is empty until a real country adapter ships) — visibility only, per the phase doc, and not yet surfaced on the Workshops list drawer (a small remaining UI task, not blocking). `EgyptETAAdapter`/`SaudiZATCAAdapter` remain explicitly out of scope per the phase doc's exit criteria.

**Also fixed this arc, found while reading code for the first time, not by design:** `FinanceService.nextInvoiceNumber()` was `tx.invoice.count()+1` racing a unique-constraint backstop, rewritten to a real atomic upsert against the previously-unused `InvoiceSequence` table, proven by a 10-way concurrent-issuance test. `StockService.record()`'s "locked for the duration" comment was untrue — a plain `findUnique` takes no row lock under Postgres's default `READ COMMITTED`; rewritten to `SELECT ... FOR UPDATE`, proven by a concurrent-issue test. Both are edge cases H3 and H6/E16 in `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md`, now marked fixed there.

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

**Scenario research (this arc).** 20 scenarios across `docs/archive/discovery/scenarios/`, four workshops chosen to be as structurally different as possible, each finding 3–4 core product mistakes by walking the software step by step. Synthesized into `FINDINGS_SYNTHESIS.md` and three new phases (15–17) added to `PHASE_MAP.md`, detailed in their own phase docs. No code from this track yet — it is planning output, matching this project's rule that re-planning at a phase boundary is expected, silent drift is not.

**Second scenario pass (this arc).** 40 scenarios across `docs/archive/discovery/scenarios2/`, eight tenant profiles chosen to stress the platform layer specifically — super admin control, workshop creation using only the product, and the server under genuine multi-tenant load — rather than any one workshop's daily operation. Synthesized into `SYNTHESIS.md` with a full cross-reference table, and three more new phases (18–20) added to `PHASE_MAP.md`, detailed in their own phase docs. Also no code yet.

**Third scenario pass — edge cases (this arc).** 20 items across `docs/archive/discovery/scenarios3/` — 10 hard, 10 extremely hard — not persona-driven, a direct audit for rare conditions a real deployment will eventually hit: concurrent writes racing each other (blockers, team-membership moves, invoice numbering, payment idempotency, freeze/reactivate), clock and calendar edge cases (leap-year warranty dates, replica clock skew, database failover), and data-integrity edge cases (hard-deleting a `ControlSetting` row instead of deactivating it, migrations against a dormant archived tenant). Two real, previously-unverified findings worth flagging specifically: `FinanceService.nextInvoiceNumber()` computes `count()+1` inside a transaction and relies on a unique-constraint backstop, while the schema already has an unused `invoice_sequences` table sitting right next to it (H3); and the stock-never-negative guarantee's actual atomicity (single `UPDATE` vs. read-then-write) was never verified against the generated SQL (H6/E16). None of these earned a new phase — `PHASE_MAP.md` gained rule 8 instead: a hardening pass attaches to the phase that already owns the affected system, via `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md`, not a new phase number. Each affected phase (1, 3, 4, 5, 7, 8, 15, 18, 19, 20) now carries an inline "Edge cases owed" note.

## 4. Current task — what to do next

**Four directions are now legitimate next steps; pick based on what's asked for.**

**A — Continue the page-gap track toward Phase 9.** Remaining: Returns/Movements actions (accept/reject a return, request clarification — Inventory Manager's last owed page), Platform's Governance Controls / Platform Reports / Workshop Live View, then Phase 9 (Billing/Invoicing) as originally planned. Before finalizing Phase 9's scope, read `docs/phases/PHASE_20.md` §20.D — the country-adapter seam is sharper than originally scoped; a tenant onboarded into a country without a ready adapter needs an explicit **compliant-blocked** state, not silent non-compliance. See §1 above.

**B — Start Phase 15.** The scenario research is done; Phase 15 is drafted and ready to build against. Its exit criteria and the primitives it owns (service card, measurement form, position taxonomy, credential, blocker reason) are in `docs/phases/PHASE_15.md`. Do not start Phase 17's creation-time UI before 15 and 16 exist — see that document's closing note, which names Phase 7's own history as the cautionary case. Also note Phase 17's scope was sharpened this session: a fixed starter-profile library under-covers reality on day one (Workshop 1 of `docs/archive/discovery/scenarios2/`), so Phase 17 must ship an explicit "start from nothing" authoring path as a first-class option, not a fallback.

**C — Start Phase 18.** Independent of both other tracks, gated only behind Phase 3 (already complete). `docs/phases/PHASE_18.md` names six sub-items (18.A–18.F); 18.A (external stakeholder access) and 18.D (the tenant archive/retention lifecycle) are the two with the clearest, smallest schema surface and are the recommended starting point if this track is picked. 18.F (merge/split) is a design decision, not an implementation, and should be scoped last within this phase.

**D — Work the edge-case register.** Independent of the other three; each item is small and attaches to already-complete phases, so this is the lowest-risk, fastest-to-land track if a quick win is wanted. Start with the two flagged **verify first** in `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md` (H6/E16, the stock-decrement atomicity question, and H3, the invoice-numbering race) — both are a few hours of reading generated SQL plus one concurrency-specific integration test each, and both touch money or inventory correctness directly, which the register's own severity note ranks above the more dramatic-sounding items like E20's database failover.

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
8. **Two scheduled-task sessions ran concurrently on this exact working directory on 2026-08-13**, one racing far ahead through Phases 12–19, the other (this entry's author) independently closing Phase 10's real gap — the Team Leader web pages `docs/phases/PHASE_10.md` had correctly flagged as still owed. Both sessions' Edit/Write calls interleaved on shared files (`app.routes.ts`, `landing.ts`, `PHASE_MAP.md`, `PAGE_INVENTORY.md`, `PHASE_10.md`); one session's in-progress, not-yet-fixed edit (a 12th permission layer mid-refactor) transiently broke `apps/api` typecheck for about a minute before that session finished its own edit. No data was lost — each session staged and committed only the files it had itself authored, verified by `git diff --stat` before every commit, rather than `git add -A` — but this is not the project's intended mode. **Whoever schedules the next `mop-phase-by-phase` run should confirm only one instance runs against this path at a time**, or the working directory should be an isolated worktree per run. `PROJECT_STATE.md`, `PHASE_MAP.md`, and `PAGE_INVENTORY.md` in particular are wide, frequently-touched files with no lock — the likeliest place a genuine conflict (not just a race that happened to resolve cleanly) would show up next.

## 7a. Looking at the app

```bash
docker compose up -d && corepack pnpm db:deploy && corepack pnpm db:seed && corepack pnpm db:seed:demo && corepack pnpm dev
```

Then `http://localhost:4200/branch/attention` → sign in `manager@apex-motors.local` / `ChangeMe-Manager-123`.

The base seed creates **no work orders** by design, and no seeded account
except this demo manager holds `workorders.branch.view` — without
`db:seed:demo` the page correctly renders its no-access or empty state.

## 8. Environment requirements

- Node 24 (`.nvmrc`, matches `engines.node` in the root `package.json` and CI). Was pinned to 20 until this session found a real CI break: `@angular/cli` 22 requires Node ≥22.22.3/≥24.15.0/≥26.0.0, so `ng test`/`ng build` fail on Node 20 with a version error, not a real test failure — CI was silently broken on this point since whichever commit upgraded to Angular 22. Fixed by bumping `.nvmrc`, `engines.node`, and `.github/workflows/ci.yml`'s `setup-node` step together, since `doctor` only ever compares the running version against `.nvmrc`, not against what Angular actually needs
- pnpm 9.15.0 via corepack
- Docker Desktop running, `docker compose up -d` for Postgres on 5432
- Databases: `mop_platform_dev` and `mop_platform_test`
- `.env` at repo root (gitignored); `.env.test` is committed and carries relaxed throttle limits for the test suite

## 9. Files most recently worked on

| File | Why |
|---|---|
| `apps/api/src/platform/reports/*` | Platform Reports — Level 1 + Usage Overview, closed this run |
| `apps/web/src/app/experiences/platform/reports/*` | Same, web side |
| `apps/api/src/finance/finance.service.ts` | H5 fix — payment idempotency check-then-insert race |
| `apps/api/src/inventory/part-request.service.ts` | H2 fix — part-request check-then-write gap |
| `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md` | Both fixes recorded there, with the concurrency tests that prove them |

## 10. Immediate next steps (superseded by §11 below — kept for the historical Phase 5 pointer only)

1. ~~Build 5.B Attention Center page~~ — done long ago; Branch Manager is 7/7.

## 11. Stop point — 2026-08-13 scheduled run

**This session's chunks, in order (continued past the original 3-chunk scheduled-task boundary at the user's explicit request to keep going):**

1. **Platform Reports** (`/platform/reports`, `/platform/reports/:id`) — found already built and uncommitted on the working tree at session start. Verified against the full gate, committed, pushed. Platform Super Admin: 4/6 pages.
2. **H5** — `FinanceService.recordPayment()`'s idempotency-key check-then-insert race, plus a second race the fix's own testing surfaced. Fixed, proven by two concurrency tests against real Postgres.
3. **H2** — `PartRequestService.transition()`'s check-then-write gap. Rewritten to a guarded `updateMany`, mirroring `WorkOrderLifecycleService`.
4. **CI fix** (reported live by the project owner from a GitHub Actions failure) — `@angular/cli` 22 requires Node ≥22.22.3/≥24.15.0/≥26.0.0; CI, `.nvmrc`, and `engines.node` were all still pinned to 20. Bumped all three to 24.
5. **H1** — the harder one: `resolveBlocker`'s unblock decision and a concurrent `reportBlocker`'s insert raced across two separate transactions. First fix attempt (row lock only) was caught incomplete by its own regression test failing 2 of 3 runs; closed properly by giving `WorkOrderLifecycleService.apply()` an optional `tx` so the actual status write folds into the same locked transaction as the decision that triggered it.
6. **H8** — `TeamSetupService.moveTechnician()`'s check-then-write gap on `TeamMembership`; same guarded-transaction pattern.
7. **H4** — `CustomerDecisionService.respond()` never checked whether the work order had already closed; a late answer would falsely read as informed consent given before the work, not after. Fixed with a terminal-status check.
8. **H10** — preventive, not reactive: nothing writes `ControlSetting` yet, so a sixth custom lint rule (`tools/lint-no-hard-delete.mjs`) now fails the build if anything ever calls `.delete()`/`.deleteMany()` on it, closing the risk before Governance Controls (the page that will write it) exists.
9. **E14** — `WorkshopsService.changeStatus()`'s freeze/reactivate race from a third starting status (e.g. `SUSPENDED`); same guarded-`updateMany` pattern. First integration test coverage this method has ever had.
10. **H9 (partial)** — `CreateWorkshopDto.slug` had no pattern validation at all, only a length check; any RTL-override/zero-width/arbitrary string in range was accepted for what becomes a public URL segment. Added `@Matches`, proven with a real U+202E character over real HTTP. PDF generation (doesn't exist yet) and audit-log rendering (unaudited) remain named as open in the register.
11. **E19** — a customer decision token stays valid (correctly — the request was legitimately sent to that customer) even after the underlying asset is sold to someone else. `EDGE_CASES_EXTREME.md`'s own analysis names the real fix: not blocking or re-scoping the answer, but making sure a branch manager reading it later can plainly see the ownership changed, so a human makes the call. `respond()` now compares live asset ownership against the request's own `customerId` and writes `ownershipChangedSinceRequest`/`HIGH` risk onto the audit row when they differ.

**Full gate was green after every chunk** — typecheck, all six lint rules (five plus the new one from H10), the complete test suite (492 API + 121 shared + 225 web as of the last chunk), build. Every chunk was committed and pushed individually before starting the next; nothing was left uncommitted.

**Edge-case register state after this session:** H1, H2, H3, H4, H5, H6/E16, H8, H9 (partial), H10, E14, E15, E19 fixed or closed — 12 of 20 items. Still open: H7 (no path for deactivating a warehouse with nonzero stock — a real feature gap, not a bug), E11 (leap-year warranty-date policy — decide before the warranty field ships), E12 (clock skew between replicas), E13 (capability rollback racing a lifecycle transition — design spike required), E17 (migrations against a dormant tenant), E18 (no password-hash lazy-rehash path), E20 (no documented database-failover runbook).

## 12. Phase 21 opened — Policy & Decision Architecture (documents only)

**A new phase was opened at the project owner's direction, and it changes what happens next.** After reviewing `docs/archive/audits/ARCHITECTURE_DECISION_INVENTORY.md` (which argued against multiple workshop architectures and identified *policy* as the real missing axis), the owner accepted the diagnosis and sharpened it: policy questions should be **contextual and dynamic**, so that a workshop's model and capabilities determine *which* decisions it even faces — 15 questions for one workshop, 40 for another — with a documented **Default** per decision and a `Use Recommended Defaults` path at creation.

That refinement is what makes the layer tractable, and it is now the phase's load-bearing idea: **decision sets are derived, not enumerated.**

- [`docs/phases/PHASE_21.md`](docs/phases/PHASE_21.md) — the model: the decision-record schema, the relevance predicate (a DAG over capabilities/specializations/prior answers, cycles rejected at registration), the defaults doctrine (a default without a written reason cannot be registered), typed exhaustive consumption (so adding an option is a compile error, not an `if`), time-ranging, and the governed change pipeline.
- [`docs/POLICY_DECISION_INVENTORY.md`](docs/POLICY_DECISION_INVENTORY.md) — ~70 decisions identified across 10 domains; 16 written in full against the owner's 18-field schema; complete compact register for the rest.

**The sharpest thing to come out of it:** an objective test separating capability from policy — *a policy may never change reachability; anything that could is a mis-classified capability.* It keeps the capability engine's proof intact, and it already did real work: `REOPEN_ALLOWED` (P-16) and `REVIEW_REQUIRED` (P-09) were caught by it, and it puts this document in **explicit disagreement with the canonical spec** about QC, which the spec lists under Workflow Policy and the test classifies as a capability.

**Also validated the owner's instinct harder than expected:** the canonical spec's own Builder Control already describes a **Workflow Policy** tab naming eleven policies — none of which exists as a typed thing today. The layer was specified years ago and never built.

**Governance Controls is now explicitly gated behind Phase 21**, since it is the page that would surface policies and building it first would hardcode the answers.

**Update — inventory completed, and a build-posture test added.** The owner pushed the thinking further: not just a policy layer, but investigating whether MOP should become a platform that prebuilds most of its capability surface and makes a new workshop mostly configuration and activation. Accepted as sound but not unconditionally — added §3.7 to `PHASE_21.md`, a mechanical admission test: **a capability may be prebuilt-and-activatable only if it can declare a removal policy, its reachability effect is computable, and enabling/disabling it needs no schema fork or migration.** Otherwise it "is not an activatable capability — it is a fork wearing a toggle."

Wrote all 54 remaining decisions (tranches 2–5) with a build-posture verdict on all 70. The rollup: philosophy holds for ~56% (27 policy-controlled + 12 cleanly activatable), fails outright for 4 that would need a real schema fork (multi-role staff, multi-session jobs, cross-tenant staff membership, broad B2B accounts), and is deliberately withheld from 9 with no second scenario demanding them yet. Also surfaced four things invisible before writing it: `CAPABILITY_MODEL.md` Rule 3's counter-approval path is unimplemented (a live gap, not a future one); P-01's recommended default creates a write-off need nothing currently serves; realtime (P-63) belongs to no phase in `PHASE_MAP.md` at all; and three edge cases (E12, E13, E18) turned out to be invariants with only one defensible answer, two of them small enough to implement immediately once agreed.

**Still owed in Phase 21 (as of the previous checkpoint):** the consolidated relevance graph + acyclicity proof, and S-01. **Both closed in the follow-up pass below.**

## 13. Phase 21 — architectural resolution pass complete

The owner sent a detailed, structured follow-up closing out everything above had marked "still owed," with an explicit instruction to resolve architectural questions before executing remaining work, and an explicit stop boundary at the end (no Phase 22, no Governance Controls, no code). Delivered, with explicit status states (DECIDED/EVIDENCE-BACKED/PROPOSED/BLOCKED/DEFERRED/OPEN/INVARIANT) throughout rather than closing questions by assumption:

- **S-01 (scheduling)** turned out to be three questions, not one: promise/queue ordering is **DECIDED** (already shipped, 16.A/16.E); resource occupancy (bays/lifts/crews) is **EVIDENCE-BACKED → PREBUILT-ACTIVATABLE**, sequenced after Phase 17 per `PHASE_16.md`'s existing plan; pre-intake appointment booking + field-service travel scheduling is **DEFERRED** with a named unblock condition (Workshop B and Delta want incompatibly different things, so building one design for both would be the same mistake §3.7 warns against).
- **Policy scope**: narrow workshop-default + optional account-override model is **EVIDENCE-BACKED**, reusing 16.I's existing override-and-lock recommendation rather than inventing new machinery. Branch/work-order scope stays **OPEN** — no decision in the inventory demonstrated the need.
- **Owner vs. Super Admin authority**: a genuine conflict found between the 2026-08-07 amendment's explicit "workflow policy" scope and `PAGE_INVENTORY.md`'s still-unbuilt Owner "Pricing & Financial Configuration" page. **Recorded OPEN, not resolved by assumption**, per the owner's explicit instruction — a direction is recommended (Super Admin sets a ceiling, Owner tunes within it, mirroring the existing Limits & Entitlements pattern) but not decided.
- **QC classification**: resolved by reading the actual lifecycle graph rather than arguing from the label — confirmed a capability, and the read surfaced a real, previously invisible gap (QC is currently all-or-nothing per job, with no way to make it conditional). Closed by adding a new decision, **P-71**.
- **Decision count**: walked all 70 against two real capability profiles. Found the questionnaire stays at 25–50 questions depending on shape — small enough that no tier system is needed — but also found a genuine classification error: roughly a third of the original 70 are platform-wide one-time decisions, not per-workshop questions, and need a `scope` field the first pass didn't have.
- **The relevance graph**: built and audited edge-by-edge. **Found and fixed four latent cycles** (P-11↔P-12, P-16↔P-40, P-42↔P-43, P-02↔P-03) — each was a thematic relationship mis-recorded as a formal dependency. Also found and merged **one duplicate decision** (P-49 = the resource-occupancy sub-question of S-01).
- **The four architectural boundary candidates re-audited**: three confirmed (multi-session jobs, cross-tenant staff in its broad form, B2B accounts in their broad form); **one moved off the list** — multiple roles per staff member passes admission after all, in an additive `PRIMARY_PLUS_SECONDARY` join-table form nobody had tried before being asked to.
- **Three new gaps reconciled**: the portal counter-approval path (a real, ready-to-build gap, not a design question); the write-off decision P-01's own default creates (tagged second-order); realtime, decomposed into a CORE isolation half and a BOUNDED-SEPARATE delivery half, still unplaced in any phase.

**Both documents republished at their existing URLs** (`docs/phases/PHASE_21.md`, `docs/POLICY_DECISION_INVENTORY.md`), each carrying an explicit status ledger. **Stop boundary honored**: no `WorkshopPolicy` table, no registry, no resolver, no questionnaire UI, no Governance Controls, no Phase 22, no re-attempt at 19.A. A Phase 22 recommendation is written (§17 of the phase doc) as a proposal for the review, explicitly not an opened phase.

**Genuinely still OPEN, not resolved by this pass either** (`PHASE_21.md` §15): owner/Super-Admin money authority; S-01c's design; policy scope beyond workshop+account; which phase realtime belongs to. Everything else that was owed at the end of the previous checkpoint is now DECIDED, EVIDENCE-BACKED, or explicitly DEFERRED with a stated reason.

**Next: owner review of the complete pass**, before anything is implemented.

**What's next, in priority order — corrected 2026-08-21 (see §0 and §2 above; the list this replaced was stale and named as unbuilt two pages that a direct code audit confirmed are real):**

- **Close the HTTP-level test-coverage gap** on Finance, Billing, and Inventory first — every one of their endpoints is proven only at the service layer today, never through an actual guarded HTTP request. Highest leverage, since it protects money- and stock-correctness code from a future silent regression.
- **Ship one real country's billing/invoicing adapter** (Egypt ETA or Saudi ZATCA) against the existing `GenericBillingAdapter` seam — this is what actually unblocks onboarding a paying customer in a real market, not any remaining page.
- **Data Analyst is now 7/7 pages complete**: Export generates real CSV files, gated by `Plan.allowedExports` (per category) and `analytics.export` (permission). The remaining page gaps across the product are the partial rows already named in `docs/PAGE_INVENTORY.md`.
- **Get an explicit owner decision on Phase 21** before investing further in Phases 15–20 — it is deliberately paused at documents-only, awaiting exactly this review, per its own stop boundary above.
- **The remaining edge cases** (see `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md`) are no longer bug-fix-shaped — each needs its own short design note before code, not a quick fix.
- **Platform Super Admin, Owner, and every other role's page count** is no longer the active frontier — see the corrected count in §2 and the canonical breakdown in `docs/PAGE_INVENTORY.md`. Do not re-open "build the remaining pages" as a track without first checking that document; most of what earlier entries in this file called "owed" is already built.

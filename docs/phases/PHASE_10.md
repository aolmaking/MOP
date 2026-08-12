# Phase 10 — Team Leader & People/Performance

> **Goal:** the Team Leader role in full (4 pages, `managedTechnicianIds`-scoped, explicitly never a maintenance-decision role), plus Owner Home — the single most-cited gap in this project's own repeated audits.
> **Why it matters:** `docs/detailed-specs/team-leader.md` opens with a warning from the previous build's gap analysis: Team Leader had been given exactly the one capability the spec forbids it (QC pass/reject) while missing the pages it actually needs. This phase is written to make that mistake structurally hard to repeat.
> **Companions:** `docs/detailed-specs/team-leader.md`, `docs/detailed-specs/tenant-owner.md` (Owner Home section only), `PROJECT_STATE.md` known issue #2 (the two hardcoded-`true` gates in `gate-evaluator.service.ts`, explicitly deferred to "when Team Leader produces real records").

---

## 1. Scope, and what is deliberately deferred

Tenant Owner has **8 spec'd pages**; only Audit & Change History is built. This phase closes **one** of the remaining seven — Owner Home — because it is the role's default landing page and every other Owner gap this project's own PROJECT_STATE.md has flagged repeatedly traces back to "the owner has nowhere to start." Organization & Access, Forms & Fields, Messages & Templates, Pricing & Financial Configuration, Reports & Analytics, and Workflow Health remain explicitly owed, named here rather than silently folded in — each is a substantial page in its own right and belongs to its own pass, not squeezed into this phase's remaining budget.

Team Leader is a genuinely new role with **zero pages built and zero permissions granted** — `StaffRole.TEAM_LEADER` exists in the schema; nothing in `default-role-permissions.ts` has a `TEAM_LEADER` block yet. All four of its spec'd pages ship in this phase, because a role with no pages and no permissions is not usefully "partially done" — either it's a real, working role by the end of this phase, or it stays fully absent.

**People & Performance** the phase name promises but this pass does not build as a separate reporting system: `TaskPerformanceRecord` (the cross-system contract already typed in `packages/shared/src/contracts/cross-system.ts`, extracted independently by this session's graph analysis as a real, existing type with no producer or consumer yet) is the eventual data source for company-wide performance reporting, which belongs to Data Analyst (Phase 12). This phase's Technician Performance Reports page is Team Leader's own, narrower, `managedTechnicianIds`-scoped view — real, but deliberately not the company-wide version.

---

## 2. The rule that shapes every Team Leader page

> **Visibility, never a maintenance decision.**

`docs/detailed-specs/team-leader.md` is explicit and this phase holds the line exactly where the spec draws it: no `task.complete`, no `parts.issue`, no `finance.payment.record`, no `customer_decision.respond`, and critically **no `task.review`/`task.return_for_rework`** — QC pass/reject stays absent from this role's permission set entirely. This closes PROJECT_STATE.md's known issue #2 half of the way: `gate-evaluator.service.ts`'s two hardcoded-`true` gates (`review.team_review_passed`, `qc.passed`) were left that way specifically because "reaching a post-review state IS the evidence, since the router will not route there otherwise" — this phase does not change that reasoning or those gates. What it *does* provide, for the first time, is a real Team Leader who can see a job failed QC and flag it, without ever being able to cause the pass/reject decision itself. The gates stay a defensible, explicit placeholder; a future phase that builds a real review-decision record (not this one) is what finally replaces them honestly.

**Scope is `managedTechnicianIds`, not `branchScope`.** A Team Leader managing technicians across branches sees those technicians regardless of branch. `TeamMembership` (built in Phase 5's delegated Team Setup) is the source of truth for who's managed — no new scoping table.

---

## 3. Team Leader's four pages

- **Team Leader Home** — same triage spirit as Attention Center/Inventory Home, scoped to the managed roster. Cards: My Team, Active Work, Blocked Technicians, Waiting Parts, Waiting Customer, Rework/QC Issues (visible, not actionable), Recent Technician Activity. Zero managed technicians renders the honest empty state named in the spec, not a blank dashboard.
- **Technicians View** — roster with a details drawer, including the **internal supervision note** — explicitly the one place in the product where a note is deliberately hidden from the person it's about. Escalation to Branch Manager is a lightweight notification/note, never a state change.
- **Vehicles / Work Orders View** — every Work Order touched by a managed technician, same field vocabulary as Branch Manager's board, **no price/cost/payment figure anywhere in the response** — enforced the same way Customer Portal's restricted fields are enforced, absent from the API shape, never hidden client-side.
- **Technician Performance Reports** — tasks completed, active tasks, average task time, blockers by technician, rework/returned count, parts activity, technician comparison table — provably reachable only through the managed-technician scope. No finance figures, no inventory value, no customer private data, no company-wide numbers.

---

## 4. Owner Home

Every card is a link, never an action — the page tells the owner what's true and where to act, it never mutates data itself. Built this phase: Workshop status, Active branches/users, Open Work Orders, Waiting customer approvals/parts/payment pending, Low stock, Recent changes (last 5 audit rows).

**Deliberately omitted, named rather than faked:** Configuration warnings, Builder draft status, and Workflow health alerts all depend on diagnostic systems (a workflow-health check, builder draft-vs-published tracking) that do not exist yet anywhere in the codebase — building a card that always reads "no warnings" would be exactly the kind of silent stub `CLAUDE.md` treats as a defect. These three cards are absent from this phase's Owner Home, not present-and-empty, until the systems behind them are real.

---

## 5. Exit criteria

1. `StaffRole.TEAM_LEADER` has a real `default-role-permissions.ts` block matching section 2's forbidden list exactly — a test asserts none of the forbidden permission keys are granted.
2. All four Team Leader pages ship, scoped by `managedTechnicianIds`, proven by an integration test where a Team Leader managing technicians across two branches sees both and a technician not on their team, anywhere, is invisible.
3. Owner Home ships with the six cards named in section 4, each computed from real data, none of the three deferred cards present in any form.
4. A cross-system scenario walkthrough: a technician's task fails QC, the Team Leader sees it on Home and flags it to the Branch Manager without being able to change anything, the Branch Manager acts, and none of it required a permission this role was never supposed to have.

**Not in scope, named rather than dropped:** Organization & Access, Forms & Fields, Messages & Templates, Pricing & Financial Configuration, Reports & Analytics, Workflow Health (all six remaining Owner pages, including the Owner's Money page named in `PHASE_MAP.md`'s original Phase 10 entry — narrowed out of this pass because it is a substantial page belonging with the other Owner-page work, not squeezed in alongside a brand-new role); company-wide `TaskPerformanceRecord` reporting (Phase 12, Data Analyst); a real review-decision record replacing `gate-evaluator.service.ts`'s two hardcoded gates.

**Also owed from `PHASE_MAP.md`'s original Phase 10 entry, not started this pass:** exit-reason and rehire-eligibility on staff deactivation (found missing in Workshop 3 scenario 14, recurring in Workshop 5's fraud-investigation account-state findings). This is a `StaffUser` deactivation-flow change orthogonal to Team Leader/Owner Home and was re-planned out to keep this phase's scope coherent; it must land by Phase 19 (restricted-account state), where the same vocabulary would otherwise be built from scratch a second time.

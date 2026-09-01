# 07 — Role-by-Role Product Audit

Per page: **Real** = renders server data + actions write through verified endpoints · **Partial** = real with named gap · status counts reconciled against `docs/PAGE_INVENTORY.md` and our own two-sided reads. Route guard model: single `authGuard` per shell; no route-level role restriction (server 403s + page forbidden states are the boundary).

## Platform Super Admin
| Page | Route | Verdict | Notes / gaps |
|---|---|---|---|
| Workshop Creation | `/platform/workshops/new` | Real | memory-only draft; validate endpoint unused by UI |
| Workshops | `/platform/workshops` | Real | paged/sorted/filtered, drawer, freeze/reactivate w/ live impact preview, session revocation on freeze |
| Control Center — Governance | `/platform/control-center` | Real | role-permission locks (list/set/remove/history) + archive/reactivate; every action reason-gated & audited. Disputes/staff-restriction services have no routes (Report 08 §5) |
| Builder Control | `/platform/workshops/:id/capabilities` | Partial | capability preview/apply real; spec's theme/layout/role-experience/workflow-policy/permission-matrix/rollback absent |
| Platform Reports | `/platform/reports(/:id)` | Partial | Level 1 + Usage Overview only; five named sections owed |
| Live View | `/platform/live-view` | Real | read-only cross-tenant counts/events, 30s poll |

## Branch Manager — 7 pages
Attention `/branch/attention` (**Real read / dead actions**: row `act()` + watch `filterBy()` documented no-ops; `REVIEW_OVERRUN` primaryAction missing from web union type) · Intake `/branch/intake` (Real: search/debounce, localStorage draft 12h, ownership-conflict flow, booking POST) · Work Orders board (Real; MAX_ROWS=300 ambiguity) · Workspace `/:id` (Real: journey poll, review/QC advance, dossier w/ cost gating, unacknowledged-critical callout) · Approvals (Real incl. record-on-behalf drawer P-18) · Delivery (Real: holding reasons from real gates) · Team Setup (delegation-gated Real). **Plus orphaned** Take Payment `/branch/payments/:id` — fully built counter-payment screen, zero inbound links.

## Technician — 3 pages, all Real
Now (`/tech`) · My Work (`/tech/work`) · Work Card (`/tech/card/:id`): start/complete task, blockers, inspection QUICK/FULL (fields hardcoded `{}`), faults, decision raise, parts request/receive/used, finish-check→finish. 56px touch targets lint-enforced; vehicle-history real. Gaps inherited from Cycles C/D/E: no tasks exist unless seeded; no return leg.

## Inventory Manager — 6 pages, all Real
Home triage · Requests (approve/reject/issue capped by shelf qty) · Stock · Catalog+Item (cost gated `inventory.cost.view`; quantity deliberately absent from catalog writes) · Returns/Movements (accept/reject/clarify + filterable ledger) · Reports (velocity-based; comparison suppressed single-warehouse).

## Tenant Owner — 4 Real, 4 Partial
Home Real (six cards; three spec cards deliberately omitted-not-faked) · Organization & Access Real (staff invite/scope/lock, branches/warehouses/matrix, plan-limit 403s surface through error banner) · Teams Real (reused page via DI path override) · Forms & Fields **Partial** (authoring+validation real; nothing captures or reads values anywhere) · Messages **Partial** (authoring/publish real; no sender exists) · Pricing **Partial** (config+catalog real; "Who Can Handle Money" named-owed in-code `finance-configuration.service.ts:54–59`) · Reports **Partial** (five real tabs; per-role visibility control unbuilt) · Audit **Partial** (filters/diffs/cursor real; rollback absent; reader-locale timestamps not workshop-TZ; `from/to` supported but never sent) · Workflow Health Real (6th check honestly `notComputable[]`).

## Team Leader — 4 pages, all Real
Home (no-team state), Technicians+drawer (supervision notes; escalate never touches WO/task), Work Orders (read-only, money-free), Reports (all-time, no ranges). Scoping strictly `managedTechnicianIds`. **Security note:** TL default holds `workorders.review.decide`, and BM `advance` skips `workorders.branch.view` — a TL with empty branchScope (= tenant-wide convention) can decide review on any tenant job (Report 11 §3).

## Data Analyst — 7 pages, all Real
Home composes others' services · Operations/People/Inventory/Decisions/Feature Adoption (privacy enforced by select-shape, test-pinned) · Saved Views + per-page ExportAction → `GET /analytics/export/:category` blob download, plan-category gated, audited. Caveat: no date-range UI anywhere ⇒ exports = default window.

## Customer — 6 spec pages (+ My Decisions beyond spec), all Real
Portal Home (pending decisions lead) · My Assets · Current Service (real journey strips per open job; plain-language phrase, not spec's full strip) · Decision Page `/decide/:token` (token-as-credential, critical-ack modal, server-refused smuggled answers) · Invoice Status (own totals only) · Safe History (ownership-period scoped; prior owners structurally invisible). Sessions bypass the staff permission resolver by design (documented controller header); scope enforced by customerId-in-WHERE everywhere.

## Shared pages — all Real
Login (timing-equalized; multi-match 409 "which workshop?") · Register (code-resolved, frozen/suspended/archived excluded) · Invite Accept (one-time sha256 token) · Access Denied (unknown landing fallback) · Tenant Frozen (dead end by design) · Password Reset (non-enumerating, token consumed server-side; **no delivery channel exists**, so end-to-end unusable today).

## Cross-cutting page truths
- Empty/loading/error/forbidden states present nearly everywhere; money always strings.
- Every URL called by web resolves to a real API route (grep cross-check).
- Endpoints with **no web consumer**: BM notes GET/POST, TL vehicle-history, `/reporting/company`, tech finish-check (data embedded), analytics date params, audit date params.
- Zero TODO/FIXME comments in web tree.

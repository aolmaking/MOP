# 06 — Complete Workshop Operational Cycles

Legend: **WORKS** = every step reachable over HTTP from the UI, verified both sides · **PARTIAL** = chain breaks, break named · **DISCONNECTED** = layers exist with no bridge.

---

## Cycle A — Workshop creation
**Actor** Platform Super Admin · **UI** `/platform/workshops/new` (9 stages) · **API** `POST /platform/workshops` (+ unused validate endpoint) · **Service** `PlatformService.attemptCreateWorkshop` · **DB** Tenant→TenantConfiguration→TenantCapability*→WorkshopPolicy*→FinanceConfiguration→Account/StaffUser→RolePermission+RolePage(7 roles)→responsibility grants→Branch(es)/Warehouse(s)/access matrix→SpecializationDefinitions→PriceCatalogEntries→TenantConfigurationVersion v1→AuditLog(HIGH) in one `$transaction` · **Publish** = create; invite link handed to admin (no email).
**Verdict: WORKS.** Draft lost on refresh by design; specialization rows inert (Report 04); owner lands `/owner` after accept.

## Cycle B — Customer acquisition / intake
Public register (`POST /public/register`, code-only P-21, phone-claim race guarded) → login → Branch Manager intake search → `POST /branch-manager/intake` mega-tx (customer reuse w/ phone-match confirm P-80; asset reuse w/ ownership-transfer confirm; WO DRAFT→REGISTER; OperationEvent + audit + customer timeline) → REGISTERED.
**Verdict: WORKS.**

## Cycle C — Work order creation → assignment → progression  **⚠ BROKEN**
Intake WORKS (above). Then:
- Board/workspace render real data (`GET /branch-manager/work-orders[/:id]`).
- **No endpoint applies `START_INSPECTION`, `REQUEST_APPROVAL`, `APPROVE`, `START_WORK`** (grep-verified zero production callers; only integration specs drive them).
- **No endpoint creates tasks** (`TechnicianWorkService.createTask()` has no controller caller).
- `CustomerDecisionService.applyAnswers()` does not call lifecycle on approval.
- Therefore REGISTERED is terminal-in-practice via UI; FINISH from REGISTERED → 409.
**Missing layer:** four intent triggers + task creation surface (likely on BM workspace / tech work card).
**Demo masking:** `seed-demo.ts recordLifecycleHistory()/LIFECYCLE_PATHS` writes statuses+events directly.

## Cycle D — Technician execution  **PARTIAL**
Given a job IN_PROGRESS *with tasks* (i.e., seeded): startTask/completeTask (TIME_TRACKING enforced), blockers FOR UPDATE-locked (H1), inspection (fields hardcoded `{}` — forms unwired), faults (CRITICAL ⇒ fact feeding QC_MANDATORY RISK_FLAGGED_ONLY), decision raise+send one-press (secureToken), parts request/receive/used — all real HTTP. Finish: `finish-check` preview then FINISH with full gate checklist.
Breaks: (1) entry into IN_PROGRESS impossible live (Cycle C); (2) no task creation endpoint; (3) part **return leg has no technician endpoints** (`requestReturn/respondToClarification/markArrived` unconsumed) while Inventory's return queue awaits them — work card even renders "waitingOn YOU" for clarifications it cannot answer.

## Cycle E — Inventory  **PARTIAL (manager side complete)**
Request→approve (P-07 separation of duties)→issue (one tx: IssuedItem + StockService.record ISSUE w/ FOR UPDATE + before/afterQty + billable line snapshot + PART_RECEIVED move)→partial fulfilment derived→returns queue accept/reject/clarify with stock reversal at recorded warehouse and un-billing of returned quantity. Negative stock refused in service AND DB CHECKs. Ledger replayable.
Missing: transfers & supplier orders (enum/view-state residue only); technician-side return endpoints (above); `markArrived` unreachable.

## Cycle F — Customer decision  **PARTIAL**
Ask: tech raises priced recommendation → SENT instantly w/ token link (no draft state). Channels: token URL + authenticated portal + staff counter-record (P-18). Answer: expiry-checked, per-item matching, critical-ack enforced server-side regardless of client modal, E19 stale-ownership flagging HIGH. Consequence: approved items become chargeables (`chargeable-items.service.ts approvedDecisionItems`) absorbed into running invoice; finish gate counts unresolved requests.
Breaks: VIEWED never written (graph state dead); EXPIRED/CANCELLED never written (expiry computed on read only) ⇒ **an abandoned ask blocks that job's finish forever** — no cron sweeps it; rejection-without-critical-ack properly blocked.

## Cycle G — Pricing / services  **WORKS**
Owner sets effective-dated prices (`setPrice` versioning); wizard seeds catalog; tasks must reference live serviceKey or refuse; chargeable items resolve catalogue when unitPrice omitted (`price_not_in_catalog`); invoice lines snapshot locked prices.

## Cycle H — Finance  **WORKS (API chain)**
Running invoice per WO → pull-based absorption of done-service/part/approved-decision items (idempotent by source keys; stale lines deleted after returns) → discount authority (P-06: NONE/UNLIMITED/THRESHOLD vs Decimal amount-or-percent + spend-once matching DiscountRequest) → issuance (atomic `invoice_sequences` upsert H3-proven, locked snapshots, Billing document same tx) → payments (required idempotency key; replay-same-amount OK / different-amount 409; P2002 race recovery H5; FULL_ONLY policy refuses short pays) → settlement derives paid=sum−refunds; SETTLE_PAYMENT moves workflow outside money tx; refunds request/approve/reject with numbered credit notes netting settlement.
Caveats: overpayment reported not auto-handled; delivery held by gate unless policy flags allow; **UI note** — every endpoint above exists, but the only payment screen (`/branch/payments/:id`) is currently unreachable from any nav/row action (Report 07 · G11), so the human path for recording a payment is broken even though the API path is not.

## Cycle I — Delivery / completion  **WORKS (given an arrived job)**
Delivery board computes holding reasons from real intents+gates (`delivery.service.ts:101–122` — "no gates" ≠ pass bug fixed); release re-evaluates gates server-side (`payment.settled_or_policy_allows` Decimal compare or config flags; `invoice.issued` checks Invoice row — generic/synthetic billing documents satisfy it, see Report 13); DELIVER closes with closedAt + event. Post-close addenda governed by P-16.
Entry dependency: job must reach READY_FOR_DELIVERY/PAYMENT_PENDING, which requires Cycles C–H.

## Cycle J — Communication  **DISCONNECTED (authoring only)**
8 templates, immutable versions, publish blocked naming missing vars, preview with sample data. `currentBody()` built for a sender that doesn't exist. No email/SMS/WhatsApp anywhere (no transport dep in lockfile). Customer comms today = handing over URLs (invite, decision links).

## Cycle K — Reporting  **WORKS (read-only, range caveat)**
Owner five report families with from/to/branchId/groupBy used by UI; analytics seven categories + saved views (ownership-scoped) + CSV export double-gated by permission and plan category; workflow-health 5 computable integrity checks + acknowledge + bottleneck/SLA diagnostics from real OperationEvents; privacy rules code-verified (decisions analytics has no customer identifiers; people analytics no currency).
Caveats: analyst UI sends no date-range params despite API support (exports reflect default window); board caps at 300 rows with ambiguous `total`; SLA overrun uses `updatedAt` proxy (P-70 open).

---

## Summary table

| Cycle | Verdict |
|---|---|
| A Workshop creation | WORKS |
| B Intake | WORKS |
| C WO progression | **BROKEN** (strands at REGISTERED; no task creation) |
| D Technician execution | PARTIAL (needs C; missing return leg; forms unwired) |
| E Inventory | PARTIAL (manager-complete; transfers/supplier absent; tech return leg) |
| F Customer decision | PARTIAL (VIEWED/EXPIRED/CANCELLED unwritten; abandoned asks deadlock gate) |
| G Pricing/services | WORKS |
| H Finance | WORKS |
| I Delivery/completion | WORKS (entry-dependent) |
| J Communication | DISCONNECTED |
| K Reporting | WORKS |

# MOP — Feature Catalog

> **Document ID:** DOC-17
> **Purpose:** the same ground as doc 16, indexed the other way — *what does the system contain?* rather than *what does this page do?* Each feature is traced from business intent to test.
> **Authority:** REFERENCE, derived.
> **Scope:** every named product feature, built or planned.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 15 (pages), 16 (matrix), 19 (endpoints), 35 (journeys), 37 (gaps).

---

## The trace shape

Every feature below is traced through the same chain. A break anywhere in it is a defect, and the most damaging breaks are the ones that leave earlier links working:

```
PRODUCT INTENT → CAPABILITY → POLICY → ROLE/PERMISSION → PAGE
   → API → DOMAIN SERVICE → DATABASE → WORKFLOW → AUDIT → TEST → STATUS
```

Features are grouped by the system that owns them.

---

## F-1 · Governance & Control

### F-1.1 Workshop creation *(9 stages, one transaction)* ✅
**Intent.** Creating a workshop is the act of defining its operating model, not filling in eighteen fields.
**Chain.** Super Admin → `/platform/workshops/new` → `GET /platform/onboarding/blueprint`, `POST …/validate`, `POST /platform/workshops` → `OnboardingService` + `PlatformService` → writes `Tenant`, `TenantCapability`, `WorkshopPolicy`, `FinanceConfiguration`, branches, warehouses, `BranchWarehouseAccess`, `PriceCatalogEntry`, `SpecializationDefinition`, `RolePermission`, owner `Account` + invite, `TenantConfigurationVersion` v1 → audit `platform.workshop.created`.
**Key property.** The browser previews with **the same `validateDraft` the server refuses with**, so a preview cannot promise what creation will reject.

### F-1.2 Capability shaping ✅
`/platform/workshops/:id/capabilities` → preview → apply → audit `capability.changed`. The validator refuses a profile that would strand a work order. `[VERIFIED]` for every shipped profile.

### F-1.3 Tenant freeze / reactivate ✅
With an impact preview. Login against a frozen tenant returns `tenant_unavailable` → `/tenant-frozen`, a deliberate dead end with **no freeze reason surfaced**. Audit `platform.workshop.frozen`.

### F-1.4 Tenant archive / reactivate ✅
`TenantLifecycleService`, platform-only, audited.

### F-1.5 Role permission locks ✅
Set and remove, **both audited, both requiring a written reason**, with history. A lock short-circuits the resolver — no lower layer can override it.

### F-1.6 Plan entitlements and ceilings ✅
`Plan.{maxBranches,maxUsers,maxWarehouses,allowedCategories,allowedModules,allowedFeatures,allowedReports,allowedExports}`. `PlanLimitsService` asserts capacity as the **first** check in branch creation, warehouse creation and staff invite. `[VERIFIED]` by a real-Postgres suite: accepts the first, refuses the second, frees the seat on deactivation.
**Open question, not a gap:** per-workshop overrides narrower than the plan. A plan swap already expresses this end to end; a `ControlSetting` override waits for a real *"same plan, one exception"* need.

### F-1.7 Cross-tenant live view ✅
The only cross-tenant read in the product. **Counts and event kinds only, never payload.**

### F-1.8 Tenant relationships 🟡
`TenantStakeholder`, `TenantGroup`, `TenantGroupMember` exist and are tested. 18.A/D/E shipped; 18.B/C deferred. `grant`, `revoke`, `listFor`, `addMember`, `summary` have **no production caller** — a modelled subsystem with no surface.

### F-1.9 Builder Control's broader scope 🔴
Theme, page layouts, role experience, workflow-policy editing, permission matrix, config-version rollback. `TenantConfigurationVersion` snapshots exist; nothing reads them back.

---

## F-2 · Identity and Access

### F-2.1 Login, sessions, refresh, logout ✅
Versioned password hashes with **lazy rehash on login** (edge case E18), and timing-safe verification on the not-found path so enumeration is closed by timing as well as by wording.

### F-2.2 Invite and set password ✅
`POST /auth/invite/{describe,accept}`. **Closed a four-phase hole** — owners created by Add Workshop could not sign in at all. `[VERIFIED]` end to end against a running stack; the token is consumed on use.

### F-2.3 Password reset ✅
Non-enumerating request → describe → complete. **The raw token is never returned from the public API.** Email/SMS delivery remains a future channel adapter, not part of the reset mechanism.

### F-2.4 Customer self-registration ✅
The only self-registration path in the product. Resolves `Tenant.slug` or `customerRegistrationCode` case-insensitively, excluding frozen/suspended/archived tenants. Does not auto-login.

### F-2.5 The eleven-layer permission resolver ✅
Ordered array, actually iterated, deny-by-default, `locked` short-circuit, **pure layers over a per-request context** so ten keys cost what one costs. `GET /access/check` is the client's "may I?".

### F-2.6 Owner delegation ✅
`team_setup.delegate` — off by default. A delegated key is denied outright until its switch is on, **whatever the role template or user override says**.

---

## F-3 · Operations

| Feature | State | Notes |
|---|---|---|
| **F-3.1** Customer intake | ✅ | Search, branch choice, book in |
| **F-3.2** Work-order board with graph-derived lanes | ✅ | |
| **F-3.3** Work Order Workspace + dossier drawer | ✅ | Dossier resolves capabilities **as of the job's opened-at timestamp** |
| **F-3.4** Journey strip, shared by 3 roles | ✅ | One implementation in `domain/journey` |
| **F-3.5** Intent-based lifecycle transitions | ✅ | Single writer; `[VERIFIED]` |
| **F-3.6** Capability-aware Finish Gate with full checklist | ✅ | Every unsatisfied gate returned, not just the first |
| **F-3.7** Delivery Gate | ✅ | |
| **F-3.8** Inspection recording (quick / full / declined) | ✅ | `inspectionDeclined` stored as a **fact** |
| **F-3.9** Fault recording with severity | ✅ | Feeds `work_order.has_critical_fault` |
| **F-3.10** Blocker reporting | ✅ | |
| **F-3.11** **Blocker resolution** | ⚠️ | `resolveBlocker` implemented and tested; **no endpoint**. A blocked job cannot be finished |
| **F-3.12** **Task creation** | ⚠️ | `createTask` is the only writer of `Task`; **no endpoint**. Tasks exist only in the demo seed |
| **F-3.13** Task start / complete, time tracking | ✅ | All three `TIME_TRACKING` options `[VERIFIED]` |
| **F-3.14** **Technician reassignment** | ⚠️ | Permission exists; no endpoint |
| **F-3.15** Append-only work-order notes | ✅ | Governed by `POST_CLOSE_ADDENDA` |
| **F-3.16** Attention ranking with working-week awareness | ✅ | |
| **F-3.17** Vehicle history | ✅ | |
| **F-3.18** Asset ownership transfer | 🟡 | `AssetOwnershipHistory` model and the privacy rule are real; no page performs a transfer |

---

## F-4 · Inventory

| Feature | State | Notes |
|---|---|---|
| **F-4.1** Catalogue management, cost permission-gated | ✅ | |
| **F-4.2** Five-bucket stock balances | ✅ | Never-negative in service **and** DB constraint |
| **F-4.3** Immutable movement ledger + `replay()` | ✅ | A balance with no movement behind it is a defect |
| **F-4.4** Part request → approve / reject / unavailable | ✅ | Separation-of-duties enforced |
| **F-4.5** Issue with partial fulfilment | ✅ | |
| **F-4.6** Receive and use | ✅ | Counter hand-over edge included — no fabricated `ARRIVED` |
| **F-4.7** **Return request (technician side)** | ⚠️ | No endpoint |
| **F-4.8** Return accept / reject / clarify (manager side) | ✅ | Including the clarify↔reply loop's *ask* half |
| **F-4.9** **Clarification reply (technician side)** | ⚠️ | No endpoint |
| **F-4.10** Warehouse deactivation `BLOCK_UNTIL_ZERO` | ✅ | Audited |
| **F-4.11** Velocity-based stock risk | ✅ | Reused by three surfaces |
| **F-4.12** **Stock adjustment / reconciliation** | 🟡 | Permission + movement type exist; no page |
| **F-4.13** **Inter-warehouse transfers** | 🔴 | Model + status enum + permission; no graph states, no endpoint |
| **F-4.14** **Supplier orders** | 🔴 | Model + status enum + permission; no endpoint closes the loop |
| **F-4.15** Four unreachable part-request statuses | ⚠️ | `WAREHOUSE_REVIEWING`, `IN_TRANSIT`, `WAITING_TRANSFER`, `WAITING_SUPPLIER` — **read by three services, written by nothing** (G-INV-01) |

---

## F-5 · Finance Core

| Feature | State |
|---|---|
| **F-5.1** Effective-dated price catalogue, read by the money path | ✅ |
| **F-5.2** Chargeable items with provenance and frozen approved prices | ✅ |
| **F-5.3** Running invoice with line sources | ✅ |
| **F-5.4** Invoice issuance, gap-free numbering (`invoice_sequences` upsert in raw SQL), immutable snapshot | ✅ |
| **F-5.5** Payment with unique-constraint idempotency + a real conflict error | ✅ |
| **F-5.6** Discount request / approve / reject, enforced **at issuance** for that work order and amount | ✅ |
| **F-5.7** Refund request / approve / reject → credit note | ✅ |
| **F-5.8** Finance configuration written from policy answers | ✅ |
| **F-5.9** **Who Can Handle Money** | 🔴 |
| **F-5.10** **Customer-initiated payment** | 🔴 |
| **F-5.11** **Named halfway-rounding rule** | 🔴 (E15) |

---

## F-6 · Billing

| Feature | State |
|---|---|
| **F-6.1** Billing document behind the country-adapter seam | ✅ |
| **F-6.2** Compliance blocking **inside** the invoice transaction | ✅ |
| **F-6.3** Compliance surfaced on the platform workshops list and drawer | ✅ |
| **F-6.4** Credit / debit notes, gap-free numbering (`credit_note_sequences`) | ✅ |
| **F-6.5** **ZATCA / ETA country adapters** | 🔴 — **the largest compliance gap in the product**; every real country is compliance-blocked until one ships |
| **F-6.6** Clearance-status polling / debit-note generation | 🧪 — seam methods, no production caller |

---

## F-7 · People & Performance

| Feature | State |
|---|---|
| **F-7.1** Staff invite / scope / activate / lock, in one transaction | ✅ |
| **F-7.2** Branch and warehouse creation, branch↔warehouse matrix | ✅ |
| **F-7.3** Branch deactivation blocked while non-terminal work orders exist | ✅ — derived from `WORK_ORDER_GRAPH.terminal`, not a second status list |
| **F-7.4** Teams, leaders, membership; one component serving Owner and Branch Manager | ✅ |
| **F-7.5** Supervision notes, never shown to their subject | ✅ |
| **F-7.6** Managed-scope performance reports | ✅ |
| **F-7.7** Specialisation definitions, versioned; entries pin their version | ✅ authoring — 🔴 no page fills one in |
| **F-7.8** Position taxonomy with platform defaults + tenant override | ✅ model — 🔴 no consumer |
| **F-7.9** Credentials | ✅ model — 🔴 no consumer |
| **F-7.10** **Exit reason / rehire eligibility on deactivation** | 🔴 — named in Phase 10, pushed to Phase 19 |
| **F-7.11** **Flag an issue to the branch manager** | ⚠️ — permission exists, no endpoint |

---

## F-8 · Customer

| Feature | State |
|---|---|
| **F-8.1** Six portal pages | ✅ |
| **F-8.2** Public token decision link, token consumed | ✅ |
| **F-8.3** Server-side critical-rejection acknowledgement | ✅ |
| **F-8.4** Counter approval, attributed to staff unconditionally | ✅ |
| **F-8.5** Price visibility governed by policy, **absent when hidden** | ✅ |
| **F-8.6** Sanitised timeline and safe technical history | ✅ |
| **F-8.7** 8 message templates, immutable per version, publish-blocked on missing variables | ✅ |
| **F-8.8** **Message sending (any channel)** | 🔴 — no transport exists product-wide |
| **F-8.9** Journey freshness | ✅ — a deliberate 20-second poll, never optimistic |
| **F-8.9b** **Push realtime (WebSocket / SSE)** | 🔴 — polling is the chosen transport today |
| **F-8.10** Full lifecycle strip on Current Service | 🔴 |

---

## F-9 · Forms and Configuration

| Feature | State |
|---|---|
| **F-9.1** Custom-field authoring across 9 forms, with scope and flags | ✅ |
| **F-9.2** `validateValues()` — required-ness, SELECT membership, category scope | ✅ — proven against the spec's own worked example |
| **F-9.3** **Value capture on any consuming page** | 🔴 |

---

## F-10 · Insights

| Feature | State |
|---|---|
| **F-10.1** Owner reports: 5 tabs, one date-range contract | ✅ |
| **F-10.2** Time-in-status reconstructed from event history | ✅ — not a snapshot |
| **F-10.3** Workflow Health: 5 of 6 integrity checks | ✅ — the 6th declared **not computable**, not faked |
| **F-10.4** Bottlenecks, SLA buckets, rework-loop detection | ✅ |
| **F-10.5** 7 Data Analyst pages | ✅ |
| **F-10.6** Saved views, tenant + account scoped | ✅ |
| **F-10.7** Real CSV export, double-gated, audited | ✅ `[VERIFIED]` — real-HTTP integration test plus a manual run against the dev database |
| **F-10.8** **Date-range filter UI on analytical pages** | 🔴 — export therefore reflects the server default range |
| **F-10.9** Platform reports, Levels 1 and 2 Usage Overview | 🟡 |

---

## F-11 · Audit and Traceability

| Feature | State |
|---|---|
| **F-11.1** Single audit writer, lint-enforced | ✅ |
| **F-11.2** ~30 audit actions with actor type and risk level | ✅ |
| **F-11.3** Owner audit page with filters and inline diffs | ✅ |
| **F-11.4** 45-key domain event vocabulary | 🟡 — declared in one place, but **not type-enforced on the emit path**, and only 19 of 45 are actually emitted (G-EVT-01/02) |
| **F-11.5** `requestId` correlation between events and requests | ✅ |
| **F-11.6** **Rollback from the audit trail** | 🔴 |
| **F-11.7** Workshop-timezone timestamps | 🔴 — the session does not carry the timezone |
| **F-11.8** **Retention / archival** | 🔴 — `AuditLog` and `OperationEvent` grow without bound |

---

## F-12 · Platform runtime

| Feature | State |
|---|---|
| **F-12.1** Boot-time config validation | ✅ |
| **F-12.2** Rate limiting | ✅ |
| **F-12.3** Systematic money serialisation | ✅ — lint-enforced |
| **F-12.4** Per-request permission-context caching | ✅ |
| **F-12.5** Scheduler advisory lock | ✅ — a lock, deliberately not a separate worker |
| **F-12.6** i18n / RTL foundation: logical CSS, `dir`, bidi isolation | ✅ foundation — 🔴 **the translation pass itself was never done** |
| **F-12.7** Health endpoint | ✅ |
| **F-12.8** Polling transport (journey strip, Live View) | ✅ — one 20-second cadence, deliberately matched |
| **F-12.8b** **Push transport** | 🔴 |
| **F-12.9** **Separate worker process** | 💤 — deliberately deferred; the advisory lock covers today's need |

---

## Counts

| | Features |
|---|---|
| ✅ Integrated and tested | 62 |
| 🟡 Partial | 9 |
| ⚠️ Implemented, not reachable | 7 |
| 🔴 Planned | 27 |
| 🧪 / 💤 | 3 |

The ⚠️ row is the one to act on first. Six of the seven are finished, tested code that no human can reach — the cheapest gap class in the product to close, and the one this project has historically been worst at seeing.

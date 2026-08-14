# Implementation Audit — Full 53-Page Pass

> **What this is:** a complete, evidence-based classification of every page in the canonical 53-page inventory, done before choosing the next implementation chunk — not from documentation, from the actual repository (frontend component, backend controller/service, schema, permission/capability/policy dependency, tests).
>
> **What this is not:** an implementation pass. No production code changed to produce this document.
>
> **Rule this document exists to enforce:** page-count is not the metric. A page is not "done" because a route exists; a subsystem is not "done" because one page over it looks complete. See §4.

---

## 1. Status legend

| Symbol | Status | Meaning |
|---|---|---|
| ✅ | **Complete** | Implemented, wired, verified — real backend, real tests, real UI, no known gap against its own spec |
| 🟡 | **Partial** | Usable, but important functionality is missing (named explicitly per row) |
| 🔴 | **Missing** | Specified, not implemented, and not blocked by anything external — buildable now |
| 🔵 | **Blocked** | Specified, not implemented, and cannot be correctly built until a named dependency exists (subsystem, decision, infrastructure) |
| 🟣 | **Needs Redesign** | Built, but the architecture underneath it has since moved and the current implementation should not simply be extended |
| ⚪ | **Intentionally Deferred** | Explicitly deferred by a recorded decision, with a stated reason — not an oversight |

---

## 2. Full audit table

### Platform Super Admin — 2 ✅ / 2 🟡 / 1 🔴 / 1 🔵 (6 pages)

| Page | Status | Frontend | Backend/API | Schema deps | Capability/Policy/Permission deps | Tests | Missing pieces | Blocking dependency | Next action |
|---|:--:|---|---|---|---|---|---|---|---|
| Add Workshop Owner | ✅ | `platform/add-workshop/*` | `platform.controller.ts`/`platform.service.ts` | `Tenant`, `Plan`, `StaffUser`, invite token | `platform.workshop.create` | `platform.service.spec.ts`, `platform.controller.integration.spec.ts` | — | — | — |
| Workshops | ✅ | `platform/workshops/*` | `platform/workshops/*` | `Tenant`, freeze/reactivate | `platform.workshop.view` | `workshops-status-race.integration.spec.ts` | — | — | — |
| Control Center — Governance Controls | 🔴 | none (`/platform/control-center` dead link since Phase 2) | none — no controller/service for the governed flow (Impact Preview, double-confirm, rollback) at all | `ControlSetting` exists; no writer for `role_permission_lock` rows anywhere in `apps/api/src` | `platform.control_center.access` (unused) | none | Entire page: Tenant Status/Modules/Features/Roles/Access&Accounts/Limits/Emergency/Audit&Rollback controls, the governed-flow UI itself | Nothing external — genuinely buildable now. Its **Roles** category is itself the thing that unblocks 3 other rows below (§5) | Build as its own subsystem (see §5, cluster 1) |
| Control Center — Builder Control | 🟡 | `platform/capabilities/*` only | `capabilities/*` (capability shaping only) | `TenantConfiguration` (theme/layout/roleExperience/workflowPolicy fields exist, written empty at creation, read by nothing); `TenantConfigurationVersion` (0 references outside schema — no rollback service) | `platform.control_center.access` | `capability-change.integration.spec.ts` | Theme, Page Layouts, Role Experience, Workflow Policy, Permission Matrix editors; version history/rollback | `TenantConfigurationVersion` has no writer to roll back *to* | Scope as its own subsystem, not an extension of the capabilities page |
| Platform Reports | 🟡 | `platform/reports/*` | `platform/reports/*` | `AuditLog`, `Tenant`, `WorkOrder` etc. | `platform.reports.view` | `platform-reports.integration.spec.ts` | Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, Health & Risk sections | None — buildable now, same pattern as Level 1/2 already built | Extend existing service, not blocked |
| Workshop Live View | 🔵 | none (`/platform/live-view` dead link since Phase 2) | none | `PlatformLiveViewSession` model exists, unused | `platform.live_view.access` (unused) | none | Entire page — real-time session rendering, read-only impersonation | Realtime session/delivery mechanism does not exist anywhere in the platform (S-01c, `docs/phases/PHASE_21.md` §8.A/§15 — DEFERRED, no phase placement) | Do not start until S-01c is resolved |

### Branch Manager — 7 ✅ (7 pages)

| Page | Status | Frontend | Backend | Tests |
|---|:--:|---|---|---|
| Branch Home / Attention Center | ✅ | `branch-manager/attention-center` | `attention-queue.service.ts` | `attention-queue.integration.spec.ts` |
| Customer Intake | ✅ | `branch-manager/intake` | `intake.service.ts` (`operations/`), `intake-lookup.service.ts` | `intake.integration.spec.ts` (18 cases incl. this session's P-80 additions) |
| Work Orders | ✅ | `branch-manager/work-orders` | `work-order-board.service.ts` | `scenario-walkthrough.integration.spec.ts` |
| Work Order Workspace | ✅ | `branch-manager/work-orders` | `operations/work-order-lifecycle.service.ts` | `work-order-lifecycle.integration.spec.ts` |
| Approvals & Customer Decisions | ✅ | `branch-manager/approvals` | `approvals.service.ts` | covered via `decision.integration.spec.ts` |
| Delivery & Payments Status | ✅ | `branch-manager/approvals/delivery-page` | `delivery.service.ts` | covered via `scenario-walkthrough.integration.spec.ts` |
| Team Setup | ✅ | `branch-manager/team` | `team/team-setup.service.ts` | `team-setup.integration.spec.ts` |

No gaps found. Verified this pass: every directory, controller, and at least one integration spec exists and passes (84/84 backend suites green as of the last full run).

### Technician — 3 ✅ (3 pages)

| Page | Status | Frontend | Backend | Tests |
|---|:--:|---|---|---|
| Technician Home | ✅ | `technician/tech-now` | `technician-work-view.service.ts` (`activeJob`) | `technician-shift.integration.spec.ts` |
| My Work | ✅ | `technician/tech-my-work` | `technician-work-view.service.ts` (`myWork`) | same |
| Work Card | ✅ | `technician/tech-work-card` | `technician-work-view.service.ts` (`workCard`, `vehicleHistory` — added this session) | same + `asset-history.integration.spec.ts` |

### Inventory Manager — 6 ✅ (6 pages)

| Page | Status | Frontend | Backend | Tests |
|---|:--:|---|---|---|
| Inventory Home | ✅ | `inventory/inventory-home` | `inventory-home.service.ts` | `inventory-walkthrough.integration.spec.ts` |
| Technician Requests | ✅ | `inventory/inventory-requests` | `part-request.service.ts` | `part-request.integration.spec.ts` |
| Inventory POS / Catalog Control | ✅ | `inventory/inventory-catalog` | `catalog.service.ts` | `inventory-surfaces.integration.spec.ts` |
| Quantity Control & Stock Status | ✅ | `inventory/inventory-stock` | `stock.service.ts` | `stock.integration.spec.ts`, `partial-fulfilment.integration.spec.ts` |
| Returns / Movements | ✅ | `inventory/inventory-returns` | `stock.service.ts` (return flow) | covered |
| Reports & Stock Insights | ✅ | `inventory/inventory-reports` | `inventory-reports.service.ts` | reused directly by Reports & Analytics and Data Analyst this session — proven by 3 different consumers now |

No gaps found.

### Tenant Owner — 3 ✅ / 5 🟡 (8 pages)

| Page | Status | Frontend/Backend | Missing pieces | Blocking dependency | Next action |
|---|:--:|---|---|---|---|
| Owner Home | ✅ | `owner/owner-home-page` / `owner-home.service.ts` | — | — | — |
| Organization & Access | ✅ | `owner/organization/*` / `organization/*` | — | — | — |
| Forms & Fields | 🟡 | `owner/forms/*` / `forms/*` | Authoring contract complete (add/archive/restore, `validateValues()`); **no consuming page anywhere actually calls `validateValues()`** — Work Order Workspace, Customer Intake, and Tech Work Card (all ✅ "Complete" above) render only their fixed core fields, none render or capture a `CustomFieldDefinition` value | The 9 forms this page is meant to extend are the *existing, already-Complete* pages above — they were built before Forms & Fields and were never revisited to consume it. Not blocked by anything external; a real integration gap between two "Complete" pages | Wire `validateValues()` into at least one real consumer (Quick Inspection is the spec's own worked example) before calling this closed |
| Messages & Templates | ✅ | `owner/messages/*` / `messages/*` | Page itself is complete against its own spec (definition, versioning, publish). Downstream: no code anywhere actually *sends* a message (WhatsApp, Ask Customer panel) — that is a different, unbuilt feature, not part of this page's spec | — | — |
| Pricing & Financial Configuration | 🟡 | `owner/pricing/*` / `finance/finance-configuration.service.ts` | "Who Can Handle Money" (role-permission toggle for `finance.invoice.issue`/`finance.payment.record`) | Needs a `role_permission_lock` **writer** — does not exist anywhere (see Governance Controls — Roles, above) | Blocked until Governance Controls' Roles category ships |
| Reports & Analytics | 🟡 | `owner/reports/*` / `reports/*` | Per-role report-visibility control | Same missing writer as above | Same |
| Audit & Change History | 🟡 | `owner/audit-page` / `audit-query.service.ts` | Rollback action | Deep-links into Control Center categories that do not exist (Governance Controls — Audit & Rollback) | Blocked until Governance Controls ships |
| Workflow Health / Operations Integrity | 🟡 | `owner/workflow-health/*` / `workflow-health/*` | 1 of 6 spec'd integrity checks (Customer-Portal-policy-vs-module contradiction) explicitly not computable | `TenantConfiguration.workflowPolicy` has no real schema — same root cause as Builder Control's Workflow Policy tab being unbuilt | Resolves itself once Builder Control's Workflow Policy editor exists and gives `workflowPolicy` a real shape |

### Team Leader — 4 ✅ (4 pages)

All four (`team-leader-home`, `technicians-page`, `team-work-orders`, `team-reports`) verified against `team-leader.service.ts` + `team-leader.integration.spec.ts`, including this session's `vehicleHistory` addition. No gaps found.

### Data Analyst — 6 ✅ / 1 ⚪ (7 pages)

| Page | Status | Notes |
|---|:--:|---|
| Analytics Home | ✅ | Composes the other 4 services' own numbers |
| Operations Analytics | ✅ | |
| Technician & Team Analytics | ✅ | |
| Inventory Analytics | ✅ | |
| Customer Decision Analytics | ✅ | |
| Feature Adoption Analytics | ✅ | |
| Saved Views / Exports | ⚪ | Recorded as deferred when Data Analyst was built (`PAGE_INVENTORY.md`) — a distinct persistence + export mechanism. **New finding this pass:** the Export half is also 🔵-shaped — `analytics.export` is spec'd to be gated by Super Admin's "Allowed Exports" plan limit, and `Plan` has no such field anywhere in the schema (`maxBranches`/`maxUsers`/`maxWarehouses`/`allowedCategories`/`allowedModules`/`allowedFeatures`/`allowedReports` exist; `allowedExports` does not). Export specifically cannot be correctly built until Governance Controls' Limits & Entitlements category defines that field. Saved Views (no export) has no such blocker. |

### Customer Portal — 6 ✅ (6 pages)

All six (`portal-home`, `my-assets`, `current-service`, `decision-page`, `invoice-status`, `safe-history`) verified against `customer-portal.service.ts`/`decision.service.ts` + `customer-portal.integration.spec.ts`/`decision.integration.spec.ts`. No gaps found.

### Shared System Pages — 4 ✅ / 1 🔵 / 1 ⚪ (6 pages)

| Page | Status | Notes |
|---|:--:|---|
| Login / Identity Gateway | ✅ | |
| Register as Customer | ✅ | Includes this session's P-80 phone-claim/dedup work |
| Invite Accept / Set Password | ✅ | |
| Access Denied | ⚪ | Explicit documented decision (`PAGE_INVENTORY.md`): centralizing would redesign an established, working per-page `forbidden`-state convention across ~30 pages rather than fill a real gap — deliberate, not an oversight |
| Tenant Frozen / Workspace Unavailable | ✅ | |
| Password Reset | 🔵 | Canonical spec itself marks this a placeholder. No SMS/email delivery infrastructure exists anywhere in the product (same root cause as WhatsApp send, Ask Customer panel) |

---

## 3. Rollup — must sum to 53

| Status | Count |
|---|---:|
| ✅ Complete | **41** |
| 🟡 Partial | **7** |
| 🔴 Missing | **1** |
| 🔵 Blocked | **3** |
| 🟣 Needs Redesign | **0** |
| ⚪ Intentionally Deferred | **2** |
| **Total** | **53** |

Complete: 2(Platform)+7(BranchMgr)+3(Tech)+6(Inventory)+3(Owner)+4(TeamLeader)+6(DataAnalyst)+6(CustomerPortal)+4(Shared) = 41
Partial: 2(Platform: Builder Control, Platform Reports)+5(Owner) = 7
Missing: 1(Platform: Governance Controls)
Blocked: 1(Platform: Live View)+1(Owner-adjacent: Saved Views' Export half is folded into the ⚪ row, not double-counted)+1(Shared: Password Reset) — see note below
Deferred: 1(Data Analyst: Saved Views/Exports)+1(Shared: Access Denied) = 2

*(Note: Saved Views/Exports is counted once, as ⚪, since it was deferred by an explicit decision before this audit found the additional Export-side blocker — the blocker is recorded as a strengthening reason, not a reclassification, since the page owner's own stated intent is still "not now, on purpose.")*

---

## 4. Pages that look complete but are not, underneath

This is the finding this audit exists to surface (§4 of the brief). Two real cases found:

1. **Forms & Fields (✅-shaped authoring page) → Quick Inspection / Customer Intake / Work Order Workspace (✅ pages) → zero actual consumption.** All four pages independently pass their own tests and work correctly in isolation. But the *product feature* "Owner adds a custom field and it shows up on the technician's form" — the spec's own worked example — does not work end to end, because the three consuming pages were built before Forms & Fields existed and were never revisited. This is a page-boundary illusion: every page involved is individually "done," the feature is not.
2. **Messages & Templates (✅) → nothing sends a message.** Same shape: the authoring/publishing page is genuinely complete against its own spec, but the spec's larger promise ("the actual sending code must call the shared rendering service") has no sending code anywhere yet to make good on. Not a defect in Messages & Templates — a reminder that "the page is done" and "the feature the page enables is done" are different claims, and only the first one is true here.

Both are named explicitly rather than silently counted as full systems — see `docs/POLICY_DECISION_INVENTORY.md` for the general discipline this follows.

---

## 5. Architectural clusters — group before you build

### Cluster 1: The missing `role_permission_lock` writer

No code anywhere writes a platform-level permission lock, even though the *reader* (`PlatformControlLayer`, `permission-context.service.ts`) has existed and been tested since Phase 1. Three separate, otherwise-unrelated pages are blocked on this exact same missing piece:

```
Missing: ControlSetting role_permission_lock WRITER (a Governance Controls — Roles capability)
    ├── Governance Controls — Roles category (Platform Super Admin)
    ├── Pricing & Financial Configuration — "Who Can Handle Money" (Tenant Owner)
    └── Reports & Analytics — per-role report visibility (Tenant Owner)
```

**Implication:** do not build "Who Can Handle Money" and "report visibility control" as two separate small features later. Build the lock-writer once (naturally, as part of Governance Controls — Roles), and both Owner-side consumers become a few hours of UI each against an already-correct mechanism.

### Cluster 2: Governance Controls is the real next subsystem, not a page

```
Missing: Super Admin Control Center — Governance Controls (whole subsystem)
    ├── Tenant Status (Frozen/Suspended/Read-only/Archived transitions + rollback)
    ├── Modules / Features toggles (readers already exist and are tested — module-enabled/feature-enabled layers)
    ├── Roles (→ unblocks Cluster 1)
    ├── Limits & Entitlements (→ unblocks Saved Views/Exports' Export half, adds allowedExports to Plan)
    ├── Access & Accounts, Emergency
    └── Audit & Rollback (→ unblocks Owner's Audit & Change History rollback action)
```

Four other rows in this audit (Pricing, Reports, Saved Views/Exports, Owner Audit rollback) are one build away from closing *because* Governance Controls closes, not independently of it. This is the single highest-leverage unbuilt subsystem in the inventory by dependency count.

### Cluster 3: Builder Control's structured config

```
Missing: TenantConfiguration.workflowPolicy / theme / pageLayouts / roleExperience given a real shape + a writer + TenantConfigurationVersion rollback
    ├── Control Center — Builder Control (Platform Super Admin) — the page itself
    └── Workflow Health's 6th integrity check (Tenant Owner) — currently explicitly "not computable" for exactly this reason
```

### Cluster 4: Realtime placement (S-01c)

```
OPEN architectural decision (docs/phases/PHASE_21.md §8.A, §15): where does realtime delivery live in the phase plan?
    └── Workshop Live View (Platform Super Admin) — cannot be correctly built until this resolves
```

This is the only row in the whole inventory blocked by a genuine open *architectural* decision rather than a missing-but-buildable subsystem. Per the standing instruction, do not silently resolve it — it stays 🔵 until a deliberate decision is made.

---

## 6. What can be implemented immediately (no blocking dependency)

- **Control Center — Governance Controls** (🔴 Missing, not blocked by anything) — the highest-leverage single build per Cluster 2.
- **Platform Reports' remaining 5 sections** (Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, Health & Risk) — same pattern as the two sections already built, no new dependency.
- **Forms & Fields → real consumer wiring** — not a new page, a wiring pass connecting an already-complete authoring service to already-complete consuming pages.
- **Data Analyst's Saved Views** (the persistence half, not Export) — self-contained, no plan-limit dependency.

## 7. What should NOT be implemented yet

- **Workshop Live View** — blocked on an open architectural decision (S-01c). Building it now would mean silently resolving that decision through code, which is the one thing explicitly forbidden throughout this project.
- **Pricing's "Who Can Handle Money" / Reports' report-visibility control** in isolation — buildable in the trivial sense, but doing so before the shared lock-writer exists (Cluster 1) means building the same mechanism twice and then reconciling it, the exact pattern this project's own decision-inventory discipline exists to prevent.
- **Owner Audit's Rollback action** in isolation — it deep-links into Control Center pages that must exist first; building the button before the destination is a dead link with extra steps.

## 8. Contradictions between spec and current implementation

None found that aren't already named in `PAGE_INVENTORY.md`/`POLICY_DECISION_INVENTORY.md`. The closest candidate — Builder Control's spec describing a single "Fully Enabled / View Only / Draft Only / Brand Only / Publishing Locked / Fully Locked" state banner that the *current* capability-shaping-only implementation has no way to compute — is really an instance of Cluster 3 (the config has no shape yet), not a genuine spec/implementation conflict.

## 9. Redesign candidates

**None.** No page audited this pass has architecture that has since moved out from under it. Every 🟡/🔴/🔵 row is an *incompleteness*, not a *staleness* — the parts that exist are still built the way the current architecture would build them today.

---

## Summary answer to the brief's core question

**Governance Controls is what to build next.** It is the largest single unbuilt subsystem, it is not blocked by anything (unlike Live View), and closing it directly unblocks four other rows across two different roles (Pricing, Reports, Owner Audit rollback, Data Analyst Export) rather than leaving them as four separate future features that would each partially reinvent the same lock/version/rollback mechanism. Platform Reports' remaining sections and the Forms & Fields consumer-wiring gap are the next tier — real, buildable, unblocked, but lower-leverage than Governance Controls because nothing else depends on them.

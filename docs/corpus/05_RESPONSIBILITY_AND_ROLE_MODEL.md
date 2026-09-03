# MOP — Responsibility and Role Model

> **Document ID:** DOC-05
> **Purpose:** who the people in MOP are, what each is responsible for, and how role, permission, responsibility, capability and policy differ.
> **Authority:** DESCRIPTIVE.
> **Scope:** account types, the seven tenant-staff roles, the platform role, the customer, and the delegation mechanism.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `packages/database/prisma/schema.prisma` (`AccountType`, `StaffRole`, `Account`, `StaffUser`), `packages/shared/src/permissions/{default-role-permissions,delegated-permissions,permission-manifest}.ts`, `packages/shared/src/pages/page-registry.ts`, `docs/detailed-specs/*.md`.
> **Related:** 20 (the resolver), 12/13/14 (role workspaces), 03 §6 (responsibility at creation), 11 (customer).

---

## 1. The five words, disambiguated

These overlap in ordinary speech and must not overlap here.

| Word | Question | Decided by | Stored as |
|---|---|---|---|
| **Capability** | Does this kind of work exist in this workshop? | Platform Super Admin | `TenantCapability` |
| **Policy** | What rule does that work run under? | Super Admin at creation, governed change after | `WorkshopPolicy` |
| **Role** | What job does this person hold? | The workshop, when inviting staff | `StaffUser.role` |
| **Permission** | May this account perform this action? | Role template + owner override + eight other layers | `RolePermission`, `UserPermissionOverride` |
| **Responsibility** | Which role *covers* the work a capability creates, in this particular workshop? | Super Admin at creation, stage 6 | Real `RolePermission` rows |

**Responsibility is the one that is easy to miss**, and its absence caused a real, silent hole. See §6.

## 2. Account types

`[IMPLEMENTED]` — `AccountType` in the schema. An `Account` is the login; a `StaffUser` or a `Customer` is what that login *is* inside a tenant.

| Type | Who | Tenant scope |
|---|---|---|
| `PLATFORM` | Platform Super Admin | Cross-tenant, by definition |
| `TENANT_STAFF` | Everyone who works at a workshop | Exactly one tenant |
| `CUSTOMER` | The vehicle's owner | Exactly one tenant |
| `SYSTEM_AUTOMATION` | Scheduler / system actor | One tenant per action |

`AccountStatus`: `INVITED` · `ACTIVE` · `LOCKED` · `SUSPENDED` · `INACTIVE`. `AuthService.login` enforces this; the Owner's Organization & Access page writes both `Account.status` and the `StaffUser` mirror fields **in one transaction**, because two sources of "is this person allowed in" would eventually disagree.

## 3. Tenant status — the other axis on a login

`TenantStatus`: `ACTIVE` · `TRIAL` · `PENDING_SETUP` · `FROZEN` · `SUSPENDED` · `READ_ONLY` · `ARCHIVED`.

A valid credential against a frozen tenant does not produce an error page. It produces `tenant_unavailable`, which routes to `/tenant-frozen` — a deliberate dead end with no navigation, and **no freeze reason surfaced**, because the reason is a commercial matter between the platform and the owner, not something a technician should read.

## 4. The seven tenant-staff roles

Page sets below are `ROLE_PAGES` from `packages/shared/src/pages/page-registry.ts` — the canonical list `RolePage` rows are keyed against. Permission sets are `DEFAULT_ROLE_PERMISSIONS`, the platform baseline seeded as real rows for every new tenant.

---

### `TENANT_OWNER` — the workshop owner

**Purpose.** Owns the workshop's configuration within the shape Super Admin gave it, its money, its people and its record.

**Pages (8).** `owner.home` · `owner.organization-access` · `owner.forms-fields` · `owner.messages-templates` · `owner.pricing-financial-configuration` · `owner.reports-analytics` · `owner.audit-change-history` · `owner.workflow-health`

**Baseline permissions.** `dashboard.owner.view`, `workorders.branch.view`, `organization.{access,forms,messages}.manage`, `organization.workflow_health.view`, `finance.configuration.manage`, `finance.invoice.{view,issue}`, `finance.payment.record`, `finance.refund.{request,decide}`, `finance.discount.{request,decide}`, `notes.create`, `reports.owner.view`, `reports.company.view`, `audit.own_tenant.view`

**Authority.** Money: full. Approvals: decides refunds and discounts. Configuration: forms, messages, pricing, staff, branches, warehouses, teams. Operations: **read-only**.

**The read-only-operations subtlety.** `workorders.branch.view` guards only GET routes — attention, board, work-order detail, approvals, delivery. Every mutation on those pages is gated separately: recording a decision needs `customer_decision.record_on_behalf`, booking in needs `customer.intake.create`, reassigning needs `workorders.branch.reassign_technician` — **none of which the Owner holds by default**. The Owner sees the whole company and works none of it, which is what the spec asks for. Without `workorders.branch.view`, Owner Home's shortcuts into operations were dead links for the one person who owns the workshop.

**Forbidden by default.** Working a job, issuing parts, reviewing a technician's work.

---

### `TENANT_ADMIN` — the owner's deputy

**Pages.** Identical to `TENANT_OWNER`'s eight. `[UNKNOWN]`-adjacent and recorded honestly: the specs do not yet distinguish Admin from Owner, so the page registry mirrors Owner rather than guessing at a split.

**Baseline permissions.** Owner's set **minus every money-writing key**: no `finance.configuration.manage`, no `finance.invoice.issue`, no `finance.payment.record`, no refund or discount decision. Retains `finance.invoice.view`, the organization-management keys, reports and audit.

**The distinction that is real today:** Admin administers; Owner decides money.

---

### `BRANCH_MANAGER` — runs one branch's day

**Purpose.** The person who answers "what needs me?" for a branch: intake, the board, approvals, delivery, and the team when the owner has delegated it.

**Pages (7).** `branch_manager.home` (Attention Center) · `customer-intake` · `work-orders-board` · `work-order-workspace` · `approvals-customer-decisions` · `delivery-payments-status` · `team-setup`

**Baseline permissions.** `workorders.branch.{view,reassign_technician,manage_blockers,release_delivery}`, `workorders.qc.decide`, `workorders.review.decide`, `customer.intake.create`, `decisions.branch.view`, `customer_decision.record_on_behalf`, `notes.create`, `finance.invoice.view`, `finance.refund.request`, `finance.discount.request`, `team_setup.branch.manage`

**Explicitly denied in the template** (written as `false`, not merely absent, so the denial reads as deliberate): `finance.invoice.issue`, `finance.payment.record`, `finance.refund.decide`, `finance.discount.decide`. Issuing and recording money is Owner-only unless delegated. A branch manager may *request* a refund or a discount — they see the dispute — but deciding stays with the owner.

**Why this role holds both review and QC by default.** Team review belongs to the team leader, but a branch small enough to have no team leader still needs somebody able to pass it. **An enabled capability must never be orphaned by the absence of one specialised role** — the same principle the responsibility stage generalises (§6).

---

### `TECHNICIAN` — does the work

**Pages (3).** `technician.home` · `technician.my-work` · `technician.work-card`

**Baseline permissions.** `task.{view_assigned,finish_attempt,complete}`, `inspection.{quick,full}.create`, `inspection.codes.view`, `blocker.report`, `notes.create`, `customer_decision.{create,send}`, `inventory.request.create`

**Explicitly denied.** `finance.running_invoice.add_line` and `finance.discount.request` are written `false`. A technician adding a chargeable line, or proposing a goodwill discount, is not automatic — the owner delegates it deliberately.

**Never sees.** Cost, margin, another technician's supervision note, or anything about another technician's jobs.

Full workspace: doc 12.

---

### `INVENTORY_MANAGER` — controls the store

**Pages (6).** `inventory_manager.home` · `technician-requests` · `pos-catalog-control` · `quantity-control-stock-status` · `returns-movements` · `reports-stock-insights`

**Baseline permissions.** `inventory.home.view`, `inventory.requests.view`, `inventory.request.{create,approve,issue,reject,mark_unavailable}`, `inventory.transfer.create`, `inventory.supplier_order.create`, `inventory.catalog.manage`, `inventory.warehouse.manage`, `inventory.stock.{view,adjust}`, `inventory.movements.view`, `inventory.stock.return.{accept,reject,clarify}`, `reports.inventory.view`

**Explicitly denied.** `inventory.cost.view` is `false`, not absent. **Managing the catalogue does not imply seeing margin.** An owner grants that deliberately, and the catalogue page renders without a cost column until they do.

Full workspace: doc 13.

---

### `TEAM_LEADER` — supervises a group of technicians

**Pages (4).** `team_leader.home` · `technicians-view` · `vehicles-work-orders-view` · `technician-performance-reports`

**Baseline permissions.** `team.home.view`, `team.technicians.view`, `team.workorders.view`, `team.supervision_note.create`, `team.issue.flag_to_branch_manager`, `workorders.review.decide`, `reports.team.view`

**Scope.** Everything is scoped to `managedTechnicianIds`. A team leader sees their people and nobody else's.

**Two hard rules.**
1. **No money.** No price, cost or payment field appears anywhere in this role's response shapes — asserted by its own test, not by omission in a template.
2. **Rework and QC are a link, never an action.** The team leader sees that a job came back; deciding what to do about it is the branch manager's.

The supervision note (`SupervisionNote`) is internal and is **never shown to the technician it is about**.

---

### `DATA_ANALYST` — reads, never writes

**Pages (7).** `data_analyst.home` · `operations-analytics` · `technician-team-analytics` · `inventory-analytics` · `customer-decision-analytics` · `feature-adoption-analytics` · `saved-views-exports`

**Baseline permissions.** `reports.company.view`, `analytics.{home,operations,people,inventory,decisions,feature_adoption}.view`, `analytics.saved_views.manage`, `analytics.export`

**Hard rules, each enforced by its own test.**
- No payment or invoice figure anywhere in People Analytics' output shape.
- No customer-identifying field anywhere in Decision Analytics.
- Operations Analytics' delivery/payment funnel carries counts and durations only, **never a currency amount**.
- Inventory value is gated on `inventory.cost.view`, the same as the Inventory Manager's own catalogue.

Saved views persist **this analyst's own report configuration**, never operational data. Export is gated twice: `analytics.export` (locked outright when the plan's `allowedExports` is empty) and then the specific category against that same list.

---

## 5. The two roles that are not `StaffRole`

### Platform Super Admin

An `AccountType: PLATFORM` account, not a `StaffRole`. It is the only actor that legitimately crosses tenants, and everything it does goes through `PlatformGuard`.

**Pages (6).** Workshop Creation · Workshops · Control Center (Governance Controls) · Builder Control (capability shaping) · Platform Reports · Workshop Live View.

**Authority.** Creates workshops and their shape; freezes and reactivates tenants; locks role permissions; archives and reactivates tenants; reads the cross-tenant live view.

**The constraint that defines its design:** *no destructive action is possible without knowing, in advance and precisely, who it will affect.* Freeze carries an impact preview. Capability change carries an impact preview. Both are audited with a written reason.

**Live View is deliberately blind.** The only endpoint in the product that aggregates across tenants exposes **counts and event kinds only, never payload.**

### The Customer

An `AccountType: CUSTOMER` account, plus the token-link path that needs no account at all.

**Pages (6).** Portal Home · My Assets · Current Service · Decision Page (`/decide/:token`, public) · Invoice & Payment Status · Safe Technical History.

**Permissions.** `customer.portal.view`, `customer.asset.view_own`, `customer.service.view_own`, `customer.invoice.view_own`, `customer.history.view_safe`.

⚠️ **Recorded honestly:** the eleven-layer resolver has no real opinion about a `CUSTOMER` session. Portal access is checked directly on `session.accountType` / `enabledModules`, mirroring the public decision controller's own reasoning. This is a **known, documented deviation**, owed as a future permission-engine rework — see doc 37. It is written down rather than smoothed over because a reader who assumes the resolver covers customers will design the next customer feature wrongly.

Full surface and privacy rules: doc 11.

---

## 6. Responsibility — the hole that had no name

`[IMPLEMENTED]` `[INTEGRATED]` — `packages/shared/src/onboarding/responsibility.ts`.

Turning on `INVENTORY` gives a workshop part requests, issuing, returns and stock. Every one is gated behind an `inventory.*` permission that, in the platform baseline, **only `INVENTORY_MANAGER` holds**. `TENANT_OWNER` holds none of them.

So a one-bay workshop that enables Inventory and never hires a storekeeper gets a capability **nobody in the building can operate**: the technician raises a part request and there is no account on earth permitted to approve it. Nothing in the product refused that configuration, because nothing in the product asked the question.

Workshop-creation stage 6 asks it. Each question names:

- the **capability** that raises it,
- the **dedicated role** the baseline gives the work to,
- **why** it is being asked, in the operator's terms,
- the **fallback roles** that may legitimately hold it instead,
- the **default answer** — staff the dedicated role.

Two guard rails:

1. **It never invents a permission or a role.** Every key transferred is one the dedicated role already holds in `DEFAULT_ROLE_PERMISSIONS`, moved to a role the same map already treats as senior to it. Nothing new is granted to anyone.
2. **One question stands whether or not its capability is active.** `BRANCH_MANAGER` work — booking a vehicle in, recording a decision on the customer's behalf, reassigning a technician, releasing a delivery — is not multi-branch work. It is what running the one branch every tenant has means.

## 7. Delegation — the owner's own switch

`[IMPLEMENTED]` — `packages/shared/src/permissions/delegated-permissions.ts`, evaluated by `DelegationLayer`.

Most permissions answer "may this role do X". A delegated permission answers something **first**: *has the owner chosen to let anyone but themselves do X at all?*

This is neither a capability (the platform does not decide it) nor a role template (the owner decides it per workshop, not per role). The switch is a `TENANT`-scoped `ControlSetting` of type `delegation`.

| Permission | Delegation key | Denied reason |
|---|---|---|
| `team_setup.branch.manage` | `team_setup.delegate` | *Team management has not been delegated by the workshop owner* |

**All delegation switches are off by default.** A key present in this registry is denied outright until its switch is on — **whatever the role template or a user override says.** That is why `BRANCH_MANAGER` carries `team_setup.branch.manage: true` in the template and still cannot manage teams: the template says *this role would do this if allowed to*; the delegation layer says *whether anyone but the owner may at all*.

The UI consequence is deliberate: the Branch Manager's Team Setup rail entry is **absent, not locked**, until the owner delegates. A greyed-out control invites a support ticket; an absent one does not exist.

Delegation is derived from the registry, never from a hand-written list at each check.

## 8. The responsibility map, by business event

Who does what, when a car comes in. Roles in brackets are the fallback when the dedicated role does not exist in this workshop.

| Event | Actor |
|---|---|
| Book the vehicle in | Branch Manager |
| Inspect and record findings | Technician |
| Raise a decision for the customer | Technician (sent by Branch Manager) |
| Answer the decision | Customer — or Branch Manager on their behalf, under `PORTAL_COUNTER_APPROVAL` |
| Approve work | Customer's answer, applied by the lifecycle |
| Do the work | Technician |
| Request a part | Technician |
| Approve / issue / refuse a part | Inventory Manager *(Owner, via responsibility transfer)* |
| Accept a returned part | Inventory Manager — **only they can raise stock** |
| Report a blocker | Technician |
| Clear a blocker | Branch Manager |
| Review finished work | Team Leader *(Branch Manager)* |
| Pass or fail QC | Branch Manager |
| Add a chargeable line | Branch Manager / Owner *(Technician only if delegated)* |
| Approve a discount above threshold | Owner *(Branch Manager may request)* |
| Issue the invoice | Owner *(delegable)* |
| Take payment | Owner *(delegable)* |
| Release the vehicle | Branch Manager, subject to the Delivery Gate |
| Decide a refund | Owner |
| Change the workshop's shape | **Platform Super Admin only** |

## 9. Implementation status

| Element | Status |
|---|---|
| 7 `StaffRole`s with page sets and baseline permissions | ✅ `[VERIFIED]` |
| Explicit `false` entries documenting deliberate denials | ✅ `[IMPLEMENTED]` |
| Delegation registry + layer | ✅ `[INTEGRATED]` — one switch today (`team_setup.delegate`) |
| Responsibility questions at creation | ✅ `[INTEGRATED]` |
| Staff invite / scope / activate / lock, in one transaction | ✅ `[INTEGRATED]` — `/owner/organization` |
| Plan seat ceilings enforced on an ongoing basis | ✅ `[VERIFIED]` — `PlanLimitsService`, real-Postgres integration suite |
| `TENANT_ADMIN` distinguished from `TENANT_OWNER` in page sets | 🟡 `[UNKNOWN]` — mirrors Owner because the specs do not yet distinguish them |
| `CUSTOMER` sessions inside the permission resolver | 🟡 — checked on `session.accountType` instead; documented deviation, doc 37 |
| Exit reason / rehire eligibility on staff deactivation | 🔴 `[INTENDED]` — named in Phase 10, pushed to Phase 19 |
| "Who Can Handle Money" per-role money delegation surface | 🔴 `[INTENDED]` — needs the same platform-lock mechanism as Builder Control's permission matrix |

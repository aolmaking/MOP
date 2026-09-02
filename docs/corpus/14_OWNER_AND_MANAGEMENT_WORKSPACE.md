# MOP — Owner and Management Workspaces

> **Document ID:** DOC-14
> **Purpose:** the four management surfaces — Branch Manager, Team Leader, Tenant Owner, and Platform Super Admin — what each runs, and where the boundaries between them sit.
> **Authority:** DESCRIPTIVE.
> **Scope:** 7 + 4 + 8 + 6 = 25 pages and their endpoints.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `apps/api/src/experiences/{branch-manager,team-leader,owner}/`, `apps/api/src/control/platform/`, `apps/api/src/control/governance/`, `apps/web/src/app/experiences/{branch-manager,team-leader,owner,platform}/`, `docs/detailed-specs/`.
> **Related:** 05 (roles), 31 (reporting), 21 (audit), 02 (capability shaping).

---

## 1. The four altitudes

| Surface | Runs | Time horizon |
|---|---|---|
| **Branch Manager** | One branch's day | Hours |
| **Team Leader** | A group of technicians | Days |
| **Tenant Owner** | The workshop's configuration, money, people and record | Weeks |
| **Platform Super Admin** | The shape of every workshop, and the ability to switch one off | The account |

The dividing rule: **`experiences/` never writes directly.** A role surface calls the owning system's service. If a management page needs new business behaviour, that behaviour belongs in `systems/` or `control/`.

---

## 2. Branch Manager — 7 pages, all ✅

Shell: `/branch`, a rail. Default route `attention`.

| Page | Route | Job |
|---|---|---|
| **Attention Center** | `/branch/attention` | *What needs me?* — answered with no click, filter or memory of position |
| **Customer Intake** | `/branch/intake` | Book a vehicle in |
| **Work Orders board** | `/branch/work-orders` | Everything open, in lanes derived from the effective graph |
| **Work Order Workspace** | `/branch/work-orders/:id` | One job, in full |
| **Approvals & Customer Decisions** | `/branch/approvals` | What the customer has been asked, and what they answered |
| **Delivery & Payments Status** | `/branch/delivery` | What is ready to leave, and what is holding it |
| **Team Setup** | `/branch/team` | Delegation-gated |

### The Attention Center

`AttentionQueueService` ranks items rather than listing them. It reads the `WORKING_WEEK` policy through `workingHoursBetween`, so **a job left on Thursday evening at a Friday–Saturday-weekend workshop does not age over a weekend it was never worked.** Counts in the watch-list band are derived from the same items the list renders, so the two can never disagree.

### Delivery — where the Delivery Gate is felt

`GET /branch-manager/delivery` and `POST /branch-manager/work-orders/:id/deliver`. `invoice.issued` and `payment.settled_or_policy_allows` are evaluated; `DELIVERY_BLOCKED_UNTIL_PAID` decides whether an outstanding balance physically holds the vehicle. `/branch/payments/:id` reuses the Finance role's `TakePayment` component, reached from Delivery, because that is where the balance is what holds a car.

### Approvals, and recording on the customer's behalf

`POST /branch-manager/approvals/:requestId/record`, permission `customer_decision.record_on_behalf`, governed by `PORTAL_COUNTER_APPROVAL`. **Attribution to staff — never the customer — holds unconditionally.**

### Advance — review and QC

`POST /branch-manager/work-orders/:id/advance` picks the stage from the work order's own status: `READY_FOR_TEAM_REVIEW` → review (`workorders.review.decide`), otherwise QC (`workorders.qc.decide`). Two separate keys deliberately — team review is a supervisor reading a technician's work; QC is the workshop's last look. A shop running both must be able to give them to different people.

### Team Setup — the delegation pattern

The route always exists; the **rail entry is absent, not locked**, until the owner turns on `team_setup.delegate`. The page itself explains the situation when delegation is off, which is better than a 404 that looks like a bug. A greyed-out control invites a support ticket; an absent one does not exist.

### ⚠️ Two permissions with no endpoint

`workorders.branch.reassign_technician` and `workorders.branch.manage_blockers` are held by this role and **checked by nothing** — there is no reassignment route and no blocker-clearing route. `TechnicianWorkService.resolveBlocker` exists and is tested, with no door. Gaps G-OPS-01/02 in doc 37.

---

## 3. Team Leader — 4 pages, all ✅

Shell: `/team-leader`. All four shipped together — unlike Branch Manager's delegated Teams entry, nothing here arrives later.

| Page | Route | Job |
|---|---|---|
| **Home** | `/team-leader` | Five triage cards, scoped to `managedTechnicianIds` |
| **Technicians View** | `/team-leader/technicians` | Roster + details drawer |
| **Vehicles / Work Orders View** | `/team-leader/work-orders` | The team's jobs |
| **Technician Performance Reports** | `/team-leader/reports` | Managed scope only |

**Two hard rules, both enforced rather than intended.**

1. **No money anywhere.** No price, cost or payment field appears in this role's response shapes — asserted by its own test, not by omission in a template.
2. **Rework and QC are a link, never an action.** The team leader sees that a job came back; deciding what to do is the branch manager's.

The **supervision note** (`SupervisionNote`, `team.supervision_note.create`) is internal and is never shown to the technician it is about.

Company-wide performance reporting is the Data Analyst's surface, not this one.

---

## 4. Tenant Owner — 8 pages: 4 ✅, 4 🟡

Shell: `/owner`. Every Owner page has a real, working surface; four are missing one named piece each.

| Page | Route | State | What is real / what is missing |
|---|---|---|---|
| **Owner Home** | `/owner/home` | ✅ | Six cards: open work orders, waiting-customer, waiting-parts, waiting-payment, low stock, recent changes — all links |
| **Organization & Access** | `/owner/organization` | ✅ | **Staff** — invite (real `Account` + `StaffUser`, reusing the invite-token flow), scope edit, activate/deactivate, lock/unlock (writes `Account.status` *and* the `StaffUser` mirror in one transaction). **Branches** — create, deactivate (blocked while non-terminal work orders exist, using `WORK_ORDER_GRAPH.terminal` rather than a second hardcoded status list). **Warehouses** — create, plus the Branch↔Warehouse matrix. **Teams** — reuses Branch Manager's `TeamSetupPage` verbatim through a `TEAM_API_BASE_PATH` token override |
| **Messages & Templates** | `/owner/messages` | ✅ | All 8 templates, immutable per-version rows, variable toolbar, live preview, Publish blocked with the exact missing-variable name. ⚠️ No message-sending code exists anywhere in the product |
| **Workflow Health** | `/owner/workflow-health` | ✅ | 5 of the spec's 6 integrity checks, each a real computed query; the 6th is **explicitly listed as not computable, not faked** (it needs `TenantConfiguration.workflowPolicy`, still an empty unread placeholder). Plus bottleneck/SLA diagnostics, rework-loop detection via `detectStatusLoops`, and breached/at-risk/on-track/untracked SLA buckets |
| **Forms & Fields** | `/owner/forms` | 🟡 | The full authoring contract is real: add/archive/restore, category and role scope, customer-visible / reportable / required flags, and `validateValues()` proven against the spec's own worked example. **No consuming UI captures any form's values** — there is no inspection-recording page and no intake custom-field capture. This is the authoring half of the chain |
| **Pricing & Financial Configuration** | `/owner/pricing` | 🟡 | Service Catalog (effective-dated), Tax/VAT, Discounts & Deposits, Payment Methods, Invoice Settings, Delivery Payment Gate. **"Who Can Handle Money" deliberately not built** — it needs the same platform-lock mechanism as Builder Control's permission matrix, which is its own self-contained pass |
| **Reports & Analytics** | `/owner/reports` | 🟡 | Overview / Operations / Financial / Inventory / Customers, one shared date-range and branch contract. Real historical calculation where the data supports it; honest nulls where it does not. **Not built:** per-role report-visibility control (same platform-lock dependency), and Service/Staff as fully separate tabs (folded into Financial/Operations — a second axis was not justified by the data depth) |
| **Audit & Change History** | `/owner/audit` | 🟡 | Filterable, with inline diffs. **Rollback not built** — it deep-links to Control Center and Owner pages that do not exist yet. Timestamps use the reader's locale rather than the workshop's timezone, because the session does not carry it |

### The Owner's authority boundary

The Owner sees the whole company and works none of it. `workorders.branch.view` guards **GET routes only**; every mutation on those pages is gated separately by a key the Owner does not hold. That is deliberate, and it is why the Owner Home shortcuts into operations needed that one read permission to stop being dead links.

---

## 5. Platform Super Admin — 6 pages: 4 ✅, 2 🟡

Shell: `/platform`. `AccountType: PLATFORM`, gated by `PlatformGuard`.

`PlatformGuard` **deliberately does not go through the permission resolver**: every layer of that resolver defers when there is no `tenantId`, which is always true for a platform session. Per the spec, Platform Super Admin has unconditional control over every workshop, so the check is intentionally *are you a platform account, yes or no*. Consequence: the five `platform.*` permission keys are declared and seeded but **checked by nothing** — recorded in doc 37 as a design consequence, not a defect.

| Page | Route | State | Notes |
|---|---|---|---|
| **Workshop Creation** | `/platform/workshops/new` | ✅ | The nine-stage journey (doc 03 §7). Creation writes the workshop's actual shape in **one transaction**; every figure on screen is derived by `@mop/shared/onboarding` from the same registries the runtime uses, and the server refuses a draft with the **same `validateDraft` the browser previews with** |
| **Workshops** | `/platform/workshops` | ✅ | Server-side paged / sorted / filtered, details drawer, freeze and reactivate **with an impact preview**. Carries the Compliance badge from `FinanceConfiguration.compliantBlocked` |
| **Control Center — Governance Controls** | `/platform/control-center` | ✅ | Per-role permission locks (set/remove, **both audited, both requiring a written reason**) and tenant archive/reactivate |
| **Workshop Live View** | `/platform/live-view` | ✅ | Auto-refreshing. **The only cross-tenant read in the product**, deliberately confined to counts and event-key summaries — never payload |
| **Builder Control** | `/platform/workshops/:id/capabilities` | 🟡 | No page named "Builder Control" exists as such. The Capabilities page covers **capability shaping only** — turn subsystems on/off with a preview step. The spec's Builder Control is broader: theme, page layouts, role experience, workflow policy, permission matrix, config-version rollback. None of that is built |
| **Platform Reports** | `/platform/reports`, `/platform/reports/:id` | 🟡 | Level 1 (aggregate totals + per-workshop card grid) and Level 2's Usage Overview only. Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, and Health & Risk are **named as owed, not shipped as empty tabs** |

> **A historical correction worth keeping.** Two of this project's own archived audits claimed Governance Controls and Workshop Live View were unbuilt. A direct code read found both real and working. Treat any status claim in `docs/archive/` as stale until checked against the code.

### The Super Admin quality bar

> **No destructive action is possible without knowing, in advance and precisely, who it will affect.**

Freeze carries an impact preview. Capability change carries an impact preview. Permission locks require a written reason. All are audited.

### Plan ceilings

`Plan.maxBranches` / `maxUsers` / `maxWarehouses` are enforced **on an ongoing basis**, not only at creation. `PlanLimitsService` asserts capacity as the first check in `createBranch`, `createWarehouse` and `StaffService.invite`, throwing a real 403 that names the actual limit. Proven by a real-Postgres integration suite (accept the first, refuse the second, free the seat on deactivation).

**Per-workshop ceiling overrides are an open design question, not an omission.** Giving one workshop a different ceiling today means moving it onto a different `Plan` row, which already works end to end. A `ControlSetting`-based override would only be justified by a real product need for *"same plan, one exception"* that a plan swap cannot express — and no product surface asks for that yet.

---

## 6. Implementation status summary

| Surface | Pages | State |
|---|---|---|
| Branch Manager | 7 | ✅ 7 — with two orphaned permissions and a missing blocker-clearing route |
| Team Leader | 4 | ✅ 4 |
| Tenant Owner | 8 | ✅ 4, 🟡 4 |
| Platform Super Admin | 6 | ✅ 4, 🟡 2 |

The three named blockers that recur across these surfaces, all tracked in doc 37:

1. **The platform-lock mechanism** — needed by Pricing's *Who Can Handle Money*, Reports' per-role visibility, and Builder Control's permission matrix. One mechanism, three pages waiting on it.
2. **Config-version rollback** — `TenantConfigurationVersion` snapshots exist; Audit's rollback deep-links to pages that do not.
3. **Builder Control's broader scope** — theme, layouts, role experience, workflow-policy editing.

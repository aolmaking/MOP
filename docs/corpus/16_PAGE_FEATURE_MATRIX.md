# MOP — Page × Feature Matrix

> **Document ID:** DOC-16
> **Purpose:** one grid tying every page's features to the capability, policy, permission, endpoint and service behind them — so a gap is visible rather than discoverable.
> **Authority:** REFERENCE, derived. Every row was read from the route file, the controller and the registries; none was copied from a prior document.
> **Scope:** the features on all 53 built pages.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 15 (page catalog), 17 (the same content indexed by feature), 19 (endpoint catalog).

---

## How to read this

- **Capability** — the feature disappears entirely when it is off.
- **Policy** — the feature exists either way; the policy decides the rule it runs under.
- **Permission** — the key checked before the action is allowed. `—` means no key is checked at this point.
- **State** ✅ integrated and tested · 🟡 partial · ⚠️ implemented but not reachable · 🔴 planned.

A row with a permission and **no endpoint** is an orphaned permission. A row with an endpoint and **no page** is a system with no door. Both are defects under this project's standard, and both appear below.

---

## Platform Super Admin

| Page | Feature | Capability | Policy | Endpoint | Service | State |
|---|---|---|---|---|---|---|
| Workshop Creation | 9-stage draft, live validation | — | all relevant | `GET /platform/onboarding/blueprint`, `POST …/validate` | `OnboardingService` | ✅ |
| Workshop Creation | Create in one transaction | — | writes all answers | `POST /platform/workshops` | `PlatformService` | ✅ |
| Workshop Creation | Name / slug / owner-email availability | — | — | `GET /platform/workshops/{name,slug,owner-email}-availability` | `PlatformService` | ✅ |
| Workshops | Paged, sorted, filtered list | — | — | `GET /platform/workshops` | `WorkshopsService` | ✅ |
| Workshops | Details drawer + compliance warning | `BILLING` | `UNCOVERED_COUNTRY_BILLING` | `GET /platform/workshops/:id/details` | `WorkshopsService` | ✅ |
| Workshops | Freeze with impact preview | — | — | `GET …/freeze-impact-preview`, `POST …/freeze` | `WorkshopsService` | ✅ |
| Workshops | Reactivate | — | — | `POST /platform/workshops/:id/reactivate` | `WorkshopsService` | ✅ |
| Builder Control | Read current capability profile | — | — | `GET /platform/workshops/:id/capabilities` | `CapabilityResolutionService` | ✅ |
| Builder Control | Preview impact of a change | — | — | `POST …/capabilities/preview` | `CapabilityChangeService` | ✅ |
| Builder Control | Apply, audited | — | — | `POST …/capabilities/apply` | `CapabilityChangeService` | ✅ |
| Builder Control | Theme / layout / role experience / permission matrix / rollback | — | — | — | — | 🔴 |
| Control Center | Set / remove role permission lock (reason required) | — | — | `POST …/role-locks`, `POST …/role-locks/remove` | `RolePermissionLockService` | ✅ |
| Control Center | Lock history | — | — | `GET …/role-locks/history` | `RolePermissionLockService` | ✅ |
| Control Center | Archive / reactivate tenant | — | — | `POST …/archive`, `POST …/reactivate` | `TenantLifecycleService` | ✅ |
| Platform Reports | Aggregate + per-workshop cards | — | — | `GET /platform/reports` | `PlatformReportsService` | ✅ |
| Platform Reports | Usage Overview (Level 2) | — | — | `GET /platform/reports/:id/usage` | `PlatformReportsService` | ✅ |
| Platform Reports | Feature Usage · Builder Adoption · Operational Activity · Commercial Snapshot · Health & Risk | — | — | — | — | 🔴 |
| Live View | Cross-tenant counts + event kinds | — | — | `GET /platform/live-view` | `LiveViewService` | ✅ |

All platform endpoints are gated by `PlatformGuard`, not by the permission resolver. The five `platform.*` keys are therefore **declared and checked by nothing**.

---

## Branch Manager

| Page | Feature | Capability | Policy | Permission | Endpoint | State |
|---|---|---|---|---|---|---|
| Attention Center | Ranked queue + watch-list counts | — | `WORKING_WEEK` | `workorders.branch.view` | `GET /branch-manager/attention` | ✅ |
| Intake | Customer / asset search | — | — | `customer.intake.create` | `GET /branch-manager/intake/search` | ✅ |
| Intake | Branch picker | `MULTI_BRANCH` | — | — | `GET /branch-manager/intake/branches` | ✅ |
| Intake | Book in | — | `INSPECTION_REQUIRED` | `customer.intake.create` | `POST /branch-manager/intake` | ✅ |
| Work Orders | Board, lanes from the effective graph | — | `QC_MANDATORY`, `TECHNICIAN_DIRECT_SEND` | `workorders.branch.view` | `GET /branch-manager/work-orders` | ✅ |
| Workspace | Job detail | — | — | `workorders.branch.view` | `GET /branch-manager/work-orders/:id` | ✅ |
| Workspace | Journey strip | all (shapes the strip) | 4 routing policies | — | `GET …/:id/journey` | ✅ |
| Workspace | Dossier drawer, historical capability shape | — | — | — | `GET …/:id/dossier` | ✅ |
| Workspace | Notes, append-only | — | `POST_CLOSE_ADDENDA` | `notes.create` | `GET/POST …/:id/notes` | ✅ |
| Workspace | **Reassign technician** | — | — | `workorders.branch.reassign_technician` | **none** | ⚠️ orphaned permission |
| Workspace | **Clear a blocker** | — | — | `workorders.branch.manage_blockers` | **none** | ⚠️ `resolveBlocker` has no door |
| Approvals | Decision queue | `CUSTOMER_PORTAL` (channel) | `APPROVAL_REQUIRED_SCOPE` | `decisions.branch.view` *(unchecked)* | `GET /branch-manager/approvals` | ✅ |
| Approvals | Decision detail | — | `CUSTOMER_INVOICE_VISIBILITY` | — | `GET …/approvals/:requestId` | ✅ |
| Approvals | Record on the customer's behalf | — | `PORTAL_COUNTER_APPROVAL`, `APPROVAL_WEIGHT` | `customer_decision.record_on_behalf` | `POST …/approvals/:requestId/record` | ✅ |
| Delivery | Ready-to-leave queue | — | `DELIVERY_BLOCKED_UNTIL_PAID` | `workorders.branch.view` | `GET /branch-manager/delivery` | ✅ |
| Delivery | Release the vehicle (Delivery Gate) | `BILLING`, `FINANCE_CORE` | `DELIVERY_BLOCKED_UNTIL_PAID` | `workorders.branch.release_delivery` | `POST …/:id/deliver` | ✅ |
| Delivery → Payments | Take payment | `FINANCE_CORE` | `PARTIAL_PAYMENT` | `finance.payment.record` | `POST /finance/invoices/:id/payments` | ✅ |
| Board / Workspace | Advance — review or QC | `TEAM_REVIEW` / `QC` | `TECHNICIAN_DIRECT_SEND`, `QC_MANDATORY` | `workorders.review.decide` / `workorders.qc.decide` | `POST …/:id/advance` | ✅ |
| Team Setup | Create team, assign leader, move technician | `TEAMS` | — | `team_setup.branch.manage` **+ delegation `team_setup.delegate`** | `GET/POST /branch/teams`, `POST /branch/teams/:id/leader`, `POST /branch/teams/members` | ✅ |

---

## Technician

| Page | Feature | Capability | Policy | Permission | Endpoint | State |
|---|---|---|---|---|---|---|
| Now | Current job | — | — | `task.view_assigned` | `GET /technician/active` | ✅ |
| My Work | Assigned jobs | — | — | `task.view_assigned` | `GET /technician/my-work` | ✅ |
| Work Card | Full card | — | `TIME_TRACKING` | `task.view_assigned` | `GET /technician/work-orders/:id` | ✅ |
| Work Card | Journey strip | — | routing policies | — | `GET …/:id/journey` | ✅ |
| Work Card | Vehicle history | — | — | — | `GET …/:id/vehicle-history` | ✅ |
| Work Card | Start task | — | — | — | `POST /technician/tasks/:id/start` | ✅ |
| Work Card | Complete task (+ minutes) | — | `TIME_TRACKING` | `task.complete` | `POST /technician/tasks/:id/complete` | ✅ |
| Work Card | Report blocker | — | — | `blocker.report` | `POST /technician/tasks/:id/blocker` | ✅ |
| Work Card | **Resolve blocker** | — | — | — | **none** | ⚠️ |
| Work Card | Record inspection | `QUICK_INSPECTION` | `INSPECTION_REQUIRED` | `inspection.{quick,full}.create` | `POST …/:id/inspection` | ✅ |
| Work Card | Record fault | — | feeds `QC_MANDATORY`'s fact | — | `POST …/:id/faults` | ✅ |
| Work Card | Raise a customer decision | — | `APPROVAL_WEIGHT`, `APPROVAL_REQUIRED_SCOPE` | `customer_decision.create` | `POST …/:id/decisions` | ✅ |
| Work Card | Parts catalogue | `INVENTORY` | — | — | `GET /technician/parts-catalog` | ✅ |
| Work Card | Request a part | `INVENTORY` | `PARTS_SEPARATION_OF_DUTIES` | `inventory.request.create` | `POST …/:id/parts` | ✅ |
| Work Card | Receive a part | `INVENTORY` | — | — | `POST /technician/parts/:id/receive` | ✅ |
| Work Card | Mark a part used | `INVENTORY` | — | — | `POST /technician/parts/:id/used` | ✅ |
| Work Card | **Return an unused part** | `PART_RETURNS` | `RETURN_UNUSED_BEFORE_FINISH` | — | **none** | ⚠️ |
| Work Card | **Reply to a clarification** | `PART_RETURNS` | — | — | **none** | ⚠️ |
| Work Card | Finish checklist preview | — | `RETURN_UNUSED_BEFORE_FINISH` | — | `GET …/:id/finish-check` | ✅ |
| Work Card | Finish | `TEAM_REVIEW`, `QC`, `FINANCE_CORE` | `TECHNICIAN_DIRECT_SEND`, `QC_MANDATORY` | `task.finish_attempt` | `POST …/:id/finish` | ✅ |
| Work Card | **Create a task** | — | — | — | **none** | ⚠️ seed-only |
| Work Card | Fill a specialisation card / custom field | — | — | — | **none** | 🔴 |

---

## Inventory Manager

| Page | Feature | Capability | Policy | Permission | Endpoint | State |
|---|---|---|---|---|---|---|
| Home | 7 triage cards, per-warehouse | `INVENTORY` | — | `inventory.home.view` | `GET /inventory/home` | ✅ |
| Requests | Queue | `INVENTORY` | — | `inventory.requests.view` | `GET /inventory/requests` | ✅ |
| Requests | Approve | `INVENTORY` | `PARTS_SEPARATION_OF_DUTIES` | `inventory.request.approve` | `POST /inventory/requests/:id/approve` | ✅ |
| Requests | Reject | `INVENTORY` | — | `inventory.request.reject` | `POST …/reject` | ✅ |
| Requests | Mark unavailable | `INVENTORY` | — | `inventory.request.mark_unavailable` | `POST …/unavailable` | ✅ |
| Requests | Issue (partial supported) | `INVENTORY` | — | `inventory.request.issue` | `POST …/issue` | ✅ |
| Catalog | List / create / update | `INVENTORY` | — | `inventory.catalog.manage` | `GET/POST /inventory/catalog`, `POST …/:id` | ✅ |
| Catalog | Cost column | `INVENTORY` | — | `inventory.cost.view` | *(shapes the response)* | ✅ |
| Stock | Five-bucket balances | `INVENTORY` | — | `inventory.stock.view` *(unchecked)* | `GET /inventory/stock` | ✅ |
| Stock | Item detail | `INVENTORY` | — | — | `GET /inventory/items/:id` | ✅ |
| Stock | Deactivate / reactivate warehouse | `MULTI_WAREHOUSE` | — | `inventory.warehouse.manage` | `POST /inventory/warehouses/:id/{deactivate,reactivate}` | ✅ |
| Stock | **Adjustment / reconciliation** | `INVENTORY` | — | `inventory.stock.adjust` *(unchecked)* | **none** | 🟡 |
| Returns | Open queue | `PART_RETURNS` | — | — | `GET /inventory/returns` | ✅ |
| Returns | Accept | `PART_RETURNS` | — | `inventory.stock.return.accept` | `POST /inventory/returns/:id/accept` | ✅ |
| Returns | Reject | `PART_RETURNS` | — | `inventory.stock.return.reject` | `POST …/reject` | ✅ |
| Returns | Clarify | `PART_RETURNS` | — | `inventory.stock.return.clarify` | `POST …/clarify` | ✅ |
| Movements | Tenant-wide ledger | `INVENTORY` | — | `inventory.movements.view` | `GET /inventory/movements` | ✅ |
| Reports | Velocity stock risk | `INVENTORY` | — | `reports.inventory.view` | `GET /inventory/reports` | ✅ |
| — | **Transfers** | `MULTI_WAREHOUSE` | — | `inventory.transfer.create` | **none** | 🔴 |
| — | **Supplier orders** | `INVENTORY` | — | `inventory.supplier_order.create` | **none** | 🔴 |

---

## Tenant Owner

| Page | Feature | Capability | Policy | Permission | Endpoint | State |
|---|---|---|---|---|---|---|
| Home | Six cards | — | — | `dashboard.owner.view` | `GET /owner/home` | ✅ |
| Organization | Staff list / invite / scope / active / locked | — | — | `organization.access.manage` | `GET/POST /organization/staff`, `PATCH …/:id/{scope,active,locked}` | ✅ |
| Organization | Infrastructure, branches, warehouses, links | `MULTI_BRANCH`, `MULTI_WAREHOUSE` | — | `organization.access.manage` | `GET /organization/infrastructure`, `POST /organization/{branches,warehouses,branch-warehouse-links}`, `PATCH /organization/branches/:id/active` | ✅ |
| Organization | Teams tab (reused component) | `TEAMS` | — | `organization.access.manage` | `GET/POST /organization/teams`, `POST …/:id/leader`, `POST …/members` | ✅ |
| Messages | List / preview / publish | — | — | `organization.messages.manage` | `GET/POST /organization/messages`, `POST …/preview` | ✅ |
| Messages | **Send** | — | — | — | **none** | 🔴 |
| Forms | List / read / add field / archive | — | — | `organization.forms.manage` | `GET /organization/forms`, `GET …/:formKey`, `POST …/:formKey`, `PATCH …/fields/:id/archived` | ✅ |
| Forms | **Capture values** | — | — | — | **none** | 🔴 |
| Pricing | Read / update finance configuration | `FINANCE_CORE` | 4 money policies | `finance.configuration.manage` | `GET/POST /organization/finance-configuration` | ✅ |
| Pricing | Service catalogue, effective-dated | `FINANCE_CORE` | — | `finance.configuration.manage` | `GET/POST /organization/finance-configuration/catalog` | ✅ |
| Pricing | **Who Can Handle Money** | — | — | — | **none** | 🔴 |
| Reports | 5 tabs, one date-range contract | — | `WORKING_WEEK` | `reports.owner.view` | `GET /organization/reports/{overview,operations,financial,inventory,customers}` | ✅ |
| Reports | **Per-role visibility control** | — | — | — | **none** | 🔴 |
| Audit | Filterable, inline diffs | — | — | `audit.own_tenant.view` | `GET /audit` | ✅ |
| Audit | **Rollback** | — | — | — | **none** | 🔴 |
| Workflow Health | 5 of 6 integrity checks | — | — | `organization.workflow_health.view` | `GET /organization/workflow-health/issues` | ✅ |
| Workflow Health | 6th check (portal policy vs module) | — | — | — | *not computable — `TenantConfiguration.workflowPolicy` is an empty placeholder* | ⬜ named |
| Workflow Health | Acknowledge an issue | — | — | `organization.workflow_health.view` | `POST …/issues/:fingerprint/acknowledge` | ✅ |
| Workflow Health | Bottlenecks / SLA buckets / rework loops | — | `WORKING_WEEK` | `organization.workflow_health.view` | `GET …/bottlenecks` | ✅ |

---

## Team Leader

| Page | Feature | Capability | Permission | Endpoint | State |
|---|---|---|---|---|---|
| Home | Five triage cards, managed scope | `TEAMS` | `team.home.view` | `GET /team-leader/home` | ✅ |
| Technicians | Roster | `TEAMS` | `team.technicians.view` | `GET /team-leader/technicians` | ✅ |
| Technicians | Detail drawer + supervision note | `TEAMS` | `team.supervision_note.create` | `GET …/:id`, `POST …/:id/notes` | ✅ |
| Work Orders | Team's jobs — **no money field anywhere** | `TEAMS` | `team.workorders.view` | `GET /team-leader/work-orders` | ✅ |
| Work Orders | Vehicle history | — | `team.workorders.view` | `GET …/:id/vehicle-history` | ✅ |
| Reports | Managed-scope performance | `TEAMS` | `reports.team.view` | `GET /team-leader/reports` | ✅ |
| — | **Flag an issue to the branch manager** | `TEAMS` | `team.issue.flag_to_branch_manager` | **none** | ⚠️ orphaned permission |
| — | Review decision | `TEAM_REVIEW` | `workorders.review.decide` | `POST /branch-manager/work-orders/:id/advance` | ✅ |

---

## Data Analyst

| Page | Feature | Permission | Endpoint | State |
|---|---|---|---|---|
| Home | Composed tiles from all 5 services | `analytics.home.view` | `GET /analytics/home` | ✅ |
| Operations | Volume, status distribution, time-in-status, branch comparison, blockers, funnel | `analytics.operations.view` | `GET /analytics/operations` | ✅ |
| People | Per-technician, team throughput, diagnostic codes — **no money field** | `analytics.people.view` | `GET /analytics/people` | ✅ |
| Inventory | Reuses `InventoryReportsService`; value gated on `inventory.cost.view` | `analytics.inventory.view` | `GET /analytics/inventory` | ✅ |
| Decisions | Approval rates, response time, overdue, critical follow-up — **no identifying field** | `analytics.decisions.view` | `GET /analytics/decisions` | ✅ |
| Feature Adoption | Real counts; Custom Fields and Message Templates reported **not trackable yet** | `analytics.feature_adoption.view` | `GET /analytics/feature-adoption` | ✅ |
| Saved Views | List / get / create / rename / delete, tenant+account scoped | `analytics.saved_views.manage` | `GET/POST/PATCH/DELETE /analytics/saved-views[/:id]` | ✅ |
| All 5 | Export CSV, audited | `analytics.export` **+ `Plan.allowedExports` per category** | `GET /analytics/export/:category` | ✅ |
| All 5 | **Date-range filter UI** | — | *(export reflects the server default range)* | 🔴 |

---

## Customer

| Page | Feature | Capability | Policy | Endpoint | State |
|---|---|---|---|---|---|
| Portal Home | Pending decisions lead | `CUSTOMER_PORTAL` | — | `GET /customer-portal/home` | ✅ |
| My Assets | Card grid | `CUSTOMER_PORTAL` | — | `GET /customer-portal/assets` | ✅ |
| Current Service | One phrase per job | `CUSTOMER_PORTAL` | — | `GET /customer-portal/current-service` | 🟡 |
| Current Service | Full lifecycle strip | `CUSTOMER_PORTAL` | — | *(API exposes status only)* | 🔴 |
| Decisions | Pending list | `CUSTOMER_PORTAL` | `APPROVAL_WEIGHT` | `GET /customer-portal/decisions` | ✅ |
| Decisions | Respond (authenticated) | `CUSTOMER_PORTAL` | `APPROVAL_WEIGHT` | `POST /customer-portal/decisions/:requestId/respond` | ✅ |
| Decision Page | Read by token — **no auth** | — | `CUSTOMER_INVOICE_VISIBILITY` | `GET /public/decisions/:token` | ✅ |
| Decision Page | Respond by token, critical ack enforced | — | `APPROVAL_WEIGHT` | `POST /public/decisions/:token/respond` | ✅ |
| Invoices | Total / paid / balance as server strings | `FINANCE_CORE` | — | `GET /customer-portal/invoices` | ✅ |
| Safe History | Ownership-scoped | — | — | `GET /customer-portal/safe-history` | ✅ |
| Journey | Per-service journey | `CUSTOMER_PORTAL` | — | `GET /customer-portal/service/:workOrderId/journey` | ✅ |
| — | **Pay from the portal** | `FINANCE_CORE` | `PARTIAL_PAYMENT` | **none** | 🔴 |

All customer endpoints are checked on `session.accountType`, **not** through the permission resolver — the five `customer.*` keys are unconsumed.

---

## Shared

| Page | Feature | Endpoint | State |
|---|---|---|---|
| Login | Sign in; `tenant_unavailable` → `/tenant-frozen` | `POST /auth/login` | ✅ |
| — | Refresh / logout / me | `POST /auth/{refresh,logout}`, `GET /auth/me` | ✅ |
| Invite Accept | Describe + accept | `POST /auth/invite/{describe,accept}` | ✅ |
| Password Reset | Non-enumerating request, describe, complete | `POST /auth/password-reset/{request,describe,complete}` | ✅ |
| Register | Resolve workshop, create account + customer | `GET /public/register/workshop`, `POST /public/register` | ✅ |
| Any | "May I?" check | `GET /access/check` | ✅ |
| — | Health | `GET /health` | ✅ |

---

## Summary of matrix findings

| Finding | Count |
|---|---|
| ⚠️ Permission with no checking endpoint | 7 (`workorders.branch.reassign_technician`, `workorders.branch.manage_blockers`, `team.issue.flag_to_branch_manager`, `inventory.transfer.create`, `inventory.supplier_order.create`, `decisions.branch.view`, `inspection.codes.view`) |
| ⚠️ Service method with no endpoint | 6 (`createTask`, `resolveBlocker`, `requestReturn`, `respondToClarification`, `markArrived`, `resolveRejectedReturn`) |
| ⚠️ Permission checked by a different mechanism by design | 10 (5 `platform.*` via `PlatformGuard`, 5 `customer.*` via `accountType`) |
| 🔴 Feature specified with no implementation | 13 |
| 🟡 Feature partially implemented | 6 |

Each is carried in doc 37 with an id, an impact and a root cause.

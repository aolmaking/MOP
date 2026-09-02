# MOP — Page Catalog

> **Document ID:** DOC-15
> **Purpose:** every page in MOP — built or planned — with its id, route, role, dependencies and status.
> **Authority:** REFERENCE. **[`../PAGE_INVENTORY.md`](../PAGE_INVENTORY.md) remains the canonical tracker for page-completion status**; this document extends it with page ids, routes, capability/policy dependencies and planned-but-unspecified pages, and cites it for state.
> **Scope:** 53 spec'd pages + 8 planned.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`, cross-read against `apps/web/src/app/app.routes.ts`.
> **Source of truth:** `docs/detailed-specs/*.md` (`## PAGE:` headings), `packages/shared/src/pages/page-registry.ts` (`ROLE_PAGES`), `apps/web/src/app/app.routes.ts`.
> **Related:** 16 (page × feature matrix), 17 (feature catalog), 28 (state → page map).

---

## 1. How to read this

**Page id** is the `ROLE_PAGES` key where one exists — that is what `RolePage` rows are keyed against, and it is coarser than a permission key. Pages with no registry entry (public pages, the customer portal, sub-routes) carry a derived id in *italics*.

**State** uses `PAGE_INVENTORY.md`'s marks: ✅ complete · 🟡 partial · ⬜ not built · 🔴 planned (not in the 53).

**Spec count check:**
```
grep -c "^## PAGE:" docs/detailed-specs/*.md
branch-manager 7 · customer 6 · data-analyst 7 · inventory-manager 6
platform-super-admin 6 · shared-system-pages 6 · team-leader 4
technician 3 · tenant-owner 8                        = 53
```

**Totals today:** 47 ✅ · 6 🟡 · **0 ⬜**. No page in the 53-page spec is zero-implementation.

---

## 2. Platform Super Admin — 6

| # | Page id | Page | Route | State | Depends on |
|---|---|---|---|---|---|
| P-01 | *`platform.workshop-creation`* | Workshop Creation | `/platform/workshops/new` | ✅ | Capability registry · policy registry · specialisation packs · plans · `@mop/shared/onboarding` |
| P-02 | *`platform.workshops`* | Workshops | `/platform/workshops` | ✅ | `Tenant`, `Plan`, `FinanceConfiguration.compliantBlocked` |
| P-03 | *`platform.control-center`* | Control Center — Governance Controls | `/platform/control-center` | ✅ | `RolePermission` locks · tenant lifecycle |
| P-04 | *`platform.builder-control`* | Builder Control | `/platform/workshops/:id/capabilities` | 🟡 | Capability engine. **Broader scope unbuilt** (theme, layouts, role experience, workflow policy, permission matrix, version rollback) |
| P-05 | *`platform.reports`* | Platform Reports | `/platform/reports`, `/platform/reports/:id` | 🟡 | Level 1 + Level 2 Usage Overview only |
| P-06 | *`platform.live-view`* | Workshop Live View | `/platform/live-view` | ✅ | `PlatformLiveViewSession`. Counts and event kinds only |

---

## 3. Branch Manager — 7

Shell `/branch`, default `attention`.

| # | Page id | Page | Route | State | Capability / policy dependencies |
|---|---|---|---|---|---|
| B-01 | `branch_manager.home` | Branch Home / Attention Center | `/branch/attention` | ✅ | `WORKING_WEEK` |
| B-02 | `branch_manager.customer-intake` | Customer Intake | `/branch/intake` | ✅ | `INSPECTION_REQUIRED`; `MULTI_BRANCH` for branch choice |
| B-03 | `branch_manager.work-orders-board` | Work Orders | `/branch/work-orders` | ✅ | Lanes derived from the effective graph; `QC_MANDATORY`, `INSPECTION_REQUIRED` |
| B-04 | `branch_manager.work-order-workspace` | Work Order Workspace | `/branch/work-orders/:id` | ✅ | `POST_CLOSE_ADDENDA`, `DISCOUNT_AUTHORITY`, `DELIVERY_BLOCKED_UNTIL_PAID` |
| B-05 | `branch_manager.approvals-customer-decisions` | Approvals & Customer Decisions | `/branch/approvals` | ✅ | `PORTAL_COUNTER_APPROVAL`, `APPROVAL_WEIGHT`, `APPROVAL_REQUIRED_SCOPE`, `CUSTOMER_INVOICE_VISIBILITY` |
| B-06 | `branch_manager.delivery-payments-status` | Delivery & Payments Status | `/branch/delivery` | ✅ | `FINANCE_CORE`, `BILLING`; `DELIVERY_BLOCKED_UNTIL_PAID`, `PARTIAL_PAYMENT` |
| B-07 | `branch_manager.team-setup` | Team Setup | `/branch/team` | ✅ | `TEAMS`; **delegation-gated** on `team_setup.delegate` — rail entry absent, not locked |
| — | *(sub-route)* | Take Payment | `/branch/payments/:id` | ✅ | Reuses `experiences/finance/take-payment`. Reached from Delivery |

---

## 4. Technician — 3

Shell `/tech`, bottom nav, no sidebar.

| # | Page id | Page | Route | State | Dependencies |
|---|---|---|---|---|---|
| T-01 | `technician.home` | Technician Home ("Now") | `/tech` | ✅ | — |
| T-02 | `technician.my-work` | My Work | `/tech/work` | ✅ | — |
| T-03 | `technician.work-card` | Work Card | `/tech/card/:id` | ✅ | `INVENTORY`, `EXTERNAL_PARTS`, `QUICK_INSPECTION`; `TIME_TRACKING`, `QC_MANDATORY`, `TECHNICIAN_DIRECT_SEND`, `RETURN_UNUSED_BEFORE_FINISH`, `APPROVAL_REQUIRED_SCOPE` |

⚠️ Task creation, blocker resolution, part return and clarification reply have no endpoint behind these pages — doc 12 §7.

---

## 5. Inventory Manager — 6

Shell `/inventory`, rail, default `home`.

| # | Page id | Page | Route | State |
|---|---|---|---|---|
| I-01 | `inventory_manager.home` | Inventory Home | `/inventory/home` | ✅ |
| I-02 | `inventory_manager.technician-requests` | Technician Requests | `/inventory/requests` | ✅ |
| I-03 | `inventory_manager.pos-catalog-control` | POS / Catalog Control | `/inventory/catalog` | ✅ |
| I-04 | `inventory_manager.quantity-control-stock-status` | Quantity Control & Stock Status | `/inventory/stock` | ✅ |
| I-05 | `inventory_manager.returns-movements` | Returns / Movements | `/inventory/returns` | ✅ |
| I-06 | `inventory_manager.reports-stock-insights` | Reports & Stock Insights | `/inventory/reports` | ✅ |
| — | *(sub-route)* | Item detail | `/inventory/items/:id` | ✅ |

All require `INVENTORY`; I-05 requires `PART_RETURNS`; per-warehouse breakdowns require `MULTI_WAREHOUSE`. Cost figures require `inventory.cost.view`.

---

## 6. Tenant Owner — 8

Shell `/owner`, default `home`.

| # | Page id | Page | Route | State | Named missing piece |
|---|---|---|---|---|---|
| O-01 | `owner.home` | Owner Home | `/owner/home` | ✅ | — |
| O-02 | `owner.organization-access` | Organization & Access | `/owner/organization`, `/owner/organization/teams` | ✅ | — |
| O-03 | `owner.forms-fields` | Forms & Fields | `/owner/forms` | 🟡 | No consuming UI captures values |
| O-04 | `owner.messages-templates` | Messages & Templates | `/owner/messages` | ✅ | *(no sending code exists product-wide — a system gap, not a page gap)* |
| O-05 | `owner.pricing-financial-configuration` | Pricing & Financial Configuration | `/owner/pricing` | 🟡 | "Who Can Handle Money" |
| O-06 | `owner.reports-analytics` | Reports & Analytics | `/owner/reports` | 🟡 | Per-role report visibility; Service/Staff as separate tabs |
| O-07 | `owner.audit-change-history` | Audit & Change History | `/owner/audit` | 🟡 | Rollback; workshop-timezone timestamps |
| O-08 | `owner.workflow-health` | Workflow Health / Operations Integrity | `/owner/workflow-health` | ✅ | *(1 of 6 integrity checks explicitly not computable)* |

`TENANT_ADMIN` holds the same eight page ids — the specs do not yet distinguish the roles.

---

## 7. Team Leader — 4

Shell `/team-leader`. All require `TEAMS`; review actions require `TEAM_REVIEW`.

| # | Page id | Page | Route | State |
|---|---|---|---|---|
| L-01 | `team_leader.home` | Team Leader Home | `/team-leader` | ✅ |
| L-02 | `team_leader.technicians-view` | Technicians View | `/team-leader/technicians` | ✅ |
| L-03 | `team_leader.vehicles-work-orders-view` | Vehicles / Work Orders View | `/team-leader/work-orders` | ✅ |
| L-04 | `team_leader.technician-performance-reports` | Technician Performance Reports | `/team-leader/reports` | ✅ |

All scoped to `managedTechnicianIds`. No price, cost or payment field in any response shape — asserted by test.

---

## 8. Data Analyst — 7

Shell `/analyst`, rail, default `home`. Read-only role.

| # | Page id | Page | Route | State |
|---|---|---|---|---|
| A-01 | `data_analyst.home` | Analytics Home | `/analyst/home` | ✅ |
| A-02 | `data_analyst.operations-analytics` | Operations Analytics | `/analyst/operations` | ✅ |
| A-03 | `data_analyst.technician-team-analytics` | Technician & Team Analytics | `/analyst/people` | ✅ |
| A-04 | `data_analyst.inventory-analytics` | Inventory Analytics | `/analyst/inventory` | ✅ |
| A-05 | `data_analyst.customer-decision-analytics` | Customer Decision Analytics | `/analyst/decisions` | ✅ |
| A-06 | `data_analyst.feature-adoption-analytics` | Feature Adoption Analytics | `/analyst/feature-adoption` | ✅ |
| A-07 | `data_analyst.saved-views-exports` | Saved Views / Exports | `/analyst/saved-views` | ✅ |

Export is gated twice — `analytics.export`, then the category against `Plan.allowedExports`. Every export writes a `LOW`-risk `analytics.export.generated` audit row.

---

## 9. Customer Portal — 6

Shell `/customer`, bottom nav. `/decide/:token` is deliberately outside every shell and needs no login.

| # | Page id | Page | Route | State |
|---|---|---|---|---|
| C-01 | *`customer.portal-home`* | Customer Portal Home | `/customer` | ✅ |
| C-02 | *`customer.my-assets`* | My Assets | `/customer/assets` | ✅ |
| C-03 | *`customer.current-service`* | Current Service | `/customer/service` | ✅ |
| C-04 | *`customer.decision`* | Decision Page / Approvals | `/decide/:token` **(public)**, `/customer/decisions` | ✅ |
| C-05 | *`customer.invoice-status`* | Invoice & Payment Status | `/customer/invoices` | ✅ |
| C-06 | *`customer.safe-history`* | Safe Technical History | `/customer/history` | ✅ |

---

## 10. Shared system pages — 6

All public, all outside every role shell.

| # | Page id | Page | Route | State |
|---|---|---|---|---|
| S-01 | *`shared.login`* | Login / Identity Gateway | `/login` | ✅ |
| S-02 | *`shared.register`* | Register as Customer | `/register` | ✅ |
| S-03 | *`shared.invite-accept`* | Invite Accept / Set Password | `/invite/accept?token=` | ✅ |
| S-04 | *`shared.access-denied`* | Access Denied | `/access-denied` | ✅ |
| S-05 | *`shared.tenant-frozen`* | Tenant Frozen / Workspace Unavailable | `/tenant-frozen` | ✅ |
| S-06 | *`shared.password-reset`* | Password Reset | `/password-reset` | ✅ |

`/tenant-frozen` is a deliberate dead end: no navigation, exact spec copy, **and no freeze reason surfaced**. The fallback shell (`experiences/home/`) serves `placeholder-home` for any role whose own shell is not built; `**` redirects to `''`.

---

## 11. Planned pages — not in the 53

These are `[INTENDED]` or `[DESIGNED]` and have no route today. Listed so an agent does not "discover" them as missing.

| # | Page | For | Blocked by | Status |
|---|---|---|---|---|
| N-01 | Builder Control — Theme & Layout | Super Admin | Builder Control scope | 🔴 `[INTENDED]` |
| N-02 | Builder Control — Permission Matrix | Super Admin | The platform-lock mechanism | 🔴 `[INTENDED]` |
| N-03 | Builder Control — Config Version Rollback | Super Admin | `TenantConfigurationVersion` exists; no UI | 🔴 `[INTENDED]` |
| N-04 | Platform Reports — the 5 remaining sections | Super Admin | Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, Health & Risk. **Named as owed, deliberately not shipped as empty tabs** | 🔴 `[INTENDED]` |
| N-05 | Owner — Who Can Handle Money | Owner | The same platform-lock mechanism as N-02 | 🔴 `[INTENDED]` |
| N-06 | Inspection Recording | Technician | The consuming half of Forms & Fields and of specialisation | 🔴 `[INTENDED]` |
| N-07 | Stock Reconciliation / Adjustment | Inventory Manager | `inventory.stock.adjust` and the `ADJUSTMENT` movement exist | 🔴 `[INTENDED]` |
| N-08 | Warehouse Transfers | Inventory Manager | `InventoryTransfer` + `TransferStatus` exist; no graph states, no endpoint | 🔴 `[INTENDED]` |

---

## 12. Cross-cutting page rules

Each is a standing requirement from `UX_PRINCIPLES.md`, not per-page decoration.

1. **The six states.** Every page handles loading, empty, error, restricted, partial and full. **Empty is a valid and desirable state** — an Attention Center with nothing in it is a good day, not a broken screen.
2. **Absent, not empty.** A section with nothing meaningful to show does not render as a blank shell. Branch comparison is *absent* for a single-branch tenant; the warehouse comparison is *absent* for a single-warehouse scope.
3. **Absent, not locked.** A control the user may never reach is not rendered greyed out. Branch Manager's Team Setup rail entry is absent until delegated.
4. **Never leak by hiding.** Restricted data is missing from the response, not styled away.
5. **Scale shows in pagination, never in layout.** A list looks identical at 1 row and 100,000.
6. **No physical-direction CSS.** Arabic and RTL are primary; `tools/lint-directional-css.mjs` fails the build.
7. **Touch targets are enforced** by `tools/lint-touch-targets.mjs`.
8. **One shell per role**, not one shell branching on role — because a desk role and a gloved-hand role have opposite requirements.
9. **A business concept used by two roles lives in `domain/`.** The journey strip, the dossier drawer and the decisions UI each have one implementation and one presentation per role.

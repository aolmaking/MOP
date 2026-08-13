# Page Inventory

> **What this is:** every page the specification calls for, and whether it exists.
> **Why it exists:** it did not, and its absence let the build drift out of the spec without anyone seeing it. Phase 7 was declared complete having built three of its six pages, because "complete" was measured against what had been made rather than against what was required.
> **Source of truth:** [`detailed-specs/`](detailed-specs/) — one file per role, each page marked `## PAGE:`. Regenerate the count with:
> ```
> grep -c "^## PAGE:" docs/detailed-specs/*.md
> ```
> **Rule:** a phase may not be marked complete while any page it owns is ⬜.

---

## Totals

| | Count |
|---|---|
| Pages the spec requires | **53** |
| Built | **33** |
| Remaining | **20** |

Legend: ✅ built · 🟡 partial (exists but does not cover the spec's content) · ⬜ not built

---

## Platform Super Admin — 3 / 6

| Page | State | Route | Notes |
|---|:--:|---|---|
| Add Workshop Owner | ✅ | `/platform/workshops/new` | Phase 2 |
| Workshops | ✅ | `/platform/workshops` | Server-side paged/sorted/filtered, details drawer, freeze/reactivate with impact preview. The API existed since Phase 2 with no UI |
| Control Center — Governance Controls | ⬜ | — | Freeze/reactivate exist in the API; no page |
| Control Center — Builder Control | 🟡 | `/platform/workshops/:id/capabilities` | Capability shaping is built (5.F). The spec's Builder Control is broader |
| Platform Reports | ⬜ | — | |
| Workshop Live View | ⬜ | — | |

## Branch Manager — 7 / 7 ✅

| Page | State | Route | Notes |
|---|:--:|---|---|
| Branch Home / Attention Center | ✅ | `/branch/attention` | |
| Customer Intake | ✅ | `/branch/intake` | |
| Work Orders | ✅ | `/branch/work-orders` | |
| Work Order Workspace | ✅ | `/branch/work-orders/:id` | |
| Approvals & Customer Decisions | ✅ | `/branch/approvals` | |
| Delivery & Payments Status | ✅ | `/branch/delivery` | |
| Team Setup | ✅ | `/branch/team` | Delegation-gated. The rail entry is absent, not locked, until the owner turns on `team_setup.delegate` |

## Technician — 3 / 3 ✅

| Page | State | Route |
|---|:--:|---|
| Technician Home | ✅ | `/tech` |
| My Work | ✅ | `/tech/work` |
| Work Card | ✅ | `/tech/card/:id` |

## Inventory Manager — 6 / 6 ✅

| Page | State | Route | Notes |
|---|:--:|---|---|
| Inventory Home | ✅ | `/inventory/home` | Seven triage cards, per-warehouse breakdown on each. Now the role's landing page |
| Technician Requests | ✅ | `/inventory/requests` | |
| Inventory POS / Catalog Control | ✅ | `/inventory/catalog` | Paginated list + side-panel editor. Cost absent unless `inventory.cost.view`; quantity deliberately not settable here |
| Quantity Control & Stock Status | ✅ | `/inventory/stock` | |
| Returns / Movements | ✅ | `/inventory/returns` | Queue (accept/reject/clarify, with the clarify↔reply loop) + tenant-wide filterable ledger. Two real backend bugs found and fixed while building this: RETURN_REJECTED and RETURN_CLARIFICATION_REQUESTED existed in the enum with no workflow-graph edge reaching them, and PartReturnRequest was never written by requestReturn |
| Reports & Stock Insights | ✅ | `/inventory/reports` | Stock risk is velocity-based, per warehouse. Comparison section absent (not empty) for a single-warehouse scope |

## Tenant Owner — 2 / 8

| Page | State | Notes |
|---|:--:|---|
| Owner Home | ✅ | `/owner/home`. Six cards per `PHASE_10.md` §4: open work orders, waiting-customer, waiting-parts, waiting-payment, low stock (all links), recent changes. Built in a later pass than Phase 10's own commit — see `PHASE_10.md` §6 |
| Organization & Access | ⬜ | Roles, permissions, staff. The permission engine is built; nothing drives it |
| Forms & Fields | ⬜ | |
| Messages & Templates | ⬜ | |
| Pricing & Financial Configuration | ⬜ | `FinanceConfiguration` exists in the schema, unreachable |
| Reports & Analytics | ⬜ | |
| Audit & Change History | 🟡 | `/owner/audit` — filterable, with inline diffs. **Rollback not built**: it deep-links to Control Center and Owner pages that do not exist yet. Timestamps use the reader's locale, not the workshop's timezone (the session does not carry it) |
| Workflow Health / Operations Integrity | ⬜ | |

## Team Leader — 4 / 4 ✅

| Page | State | Route | Notes |
|---|:--:|---|---|
| Team Leader Home | ✅ | `/team-leader` | Five triage cards scoped to `managedTechnicianIds`; rework/QC is a link, never an action |
| Technicians View | ✅ | `/team-leader/technicians` | Roster + details drawer with the internal supervision note, never shown to the technician it's about |
| Vehicles / Work Orders View | ✅ | `/team-leader/work-orders` | No price/cost/payment field anywhere in the response shape |
| Technician Performance Reports | ✅ | `/team-leader/reports` | Managed-scope only; company-wide version is Phase 12 |

## Data Analyst — 0 / 7

| Page | State |
|---|:--:|
| Analytics Home | ⬜ |
| Operations Analytics | ⬜ |
| Technician & Team Analytics | ⬜ |
| Inventory Analytics | ⬜ |
| Customer Decision Analytics | ⬜ |
| Feature Adoption Analytics | ⬜ |
| Saved Views / Exports | ⬜ |

## Customer Portal — 6 / 6 ✅

| Page | State | Route | Notes |
|---|:--:|---|---|
| Customer Portal Home | ✅ | `/customer` | Pending decisions lead the screen when nonzero, per the spec's own note that this is usually why the portal was opened at all |
| My Assets | ✅ | `/customer/assets` | Card grid, not a table — most customers own exactly one asset |
| Current Service | ✅ | `/customer/service` | One plain-language phrase per open job in place of a full lifecycle strip — `CustomerPortalService.currentService()` exposes status only, not per-stage detail; see `PHASE_11.md` §5 |
| Decision Page / Approvals | ✅ | `/decide/:token` | **The public token path**, closed earlier in this arc. `CustomerDecisionRequest.secureToken` is consumed, critical-rejection acknowledgement enforced server-side |
| Invoice & Payment Status | ✅ | `/customer/invoices` | `total`/`paid`/`balance` rendered as the exact strings the server sends |
| Safe Technical History | ✅ | `/customer/history` | Entries labelled by plate/VIN cross-referenced from the customer's own asset list, never a raw asset id |

## Shared System Pages — 2 / 6

| Page | State | Route | Notes |
|---|:--:|---|---|
| Login / Identity Gateway | ✅ | `/login` | |
| Register as Customer | ⬜ | — | `Tenant.customerRegistrationCode` exists for this |
| Invite Accept / Set Password | ✅ | `/invite/accept?token=` | Closed the four-phase hole: owners created by Add Workshop can now sign in. Verified end to end against the running stack |
| Access Denied | ⬜ | — | Currently a per-page state rather than a page |
| Tenant Frozen / Workspace Unavailable | ⬜ | — | Login already refuses frozen tenants; there is no page explaining it |
| Password Reset | ⬜ | — | Spec marks it a placeholder |

---

## What this audit found that nothing else had

**All three are now closed.** They were not "a later phase has not run yet" — they were finished, tested systems that no human could reach:

1. ~~**Invite Accept.**~~ ✅ **Fixed.** Verified end to end against the running stack: a workshop created through the platform API had an owner who got a 401, and after redeeming the invite signs in as `TENANT_OWNER`. The token is consumed on use.
2. ~~**The customer Decision Page.**~~ ✅ **Fixed.** Walked end to end against the running stack: read with no auth, an unacknowledged safety rejection refused, a smuggled price field refused, then answered — and the job left the manager's Approvals queue.
3. ~~**Audit & Change History.**~~ ✅ **Fixed.** Read live as a seeded owner: 8 real rows including this session's own capability changes and customer decisions, every filter working, a manager without the permission refused with 403, and tenant isolation asserted in the query.

These are the priority, ahead of any new role: they are finished systems with no door.

**A fourth one, found the same way, one phase later.** Phase 10's own commit built `TeamLeaderController`/`TeamLeaderService` (all four endpoints, tested) and `OwnerHomeController`/`OwnerHomeService` (tested) — but no web page anywhere called either. `PROJECT_STATE.md` and `PHASE_MAP.md` still marked the phase "✅ complete." This file itself was not wrong — it had simply not been touched since Phase 7 closed, and still correctly read "Team Leader — 0/4" until this pass fixed both the pages and the progress tables that had drifted past it. See `docs/phases/PHASE_10.md` §6.

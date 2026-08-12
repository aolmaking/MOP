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
| Built | **18** |
| Remaining | **35** |

Legend: ✅ built · 🟡 partial (exists but does not cover the spec's content) · ⬜ not built

---

## Platform Super Admin — 2 / 6

| Page | State | Route | Notes |
|---|:--:|---|---|
| Add Workshop Owner | ✅ | `/platform/workshops/new` | Phase 2 |
| Workshops | ⬜ | — | The list. `app.routes.ts` has carried a comment admitting the rail link 404s since Phase 2 |
| Control Center — Governance Controls | ⬜ | — | Freeze/reactivate exist in the API; no page |
| Control Center — Builder Control | 🟡 | `/platform/workshops/:id/capabilities` | Capability shaping is built (5.F). The spec's Builder Control is broader |
| Platform Reports | ⬜ | — | |
| Workshop Live View | ⬜ | — | |

## Branch Manager — 6 / 7

| Page | State | Route | Notes |
|---|:--:|---|---|
| Branch Home / Attention Center | ✅ | `/branch/attention` | |
| Customer Intake | ✅ | `/branch/intake` | |
| Work Orders | ✅ | `/branch/work-orders` | |
| Work Order Workspace | ✅ | `/branch/work-orders/:id` | |
| Approvals & Customer Decisions | ✅ | `/branch/approvals` | |
| Delivery & Payments Status | ✅ | `/branch/delivery` | |
| Team Setup | ⬜ | — | Deliberately deferred in PHASE_5.md §3 as "optional seventh, shown only when the owner delegates it". Still owed |

## Technician — 3 / 3 ✅

| Page | State | Route |
|---|:--:|---|
| Technician Home | ✅ | `/tech` |
| My Work | ✅ | `/tech/work` |
| Work Card | ✅ | `/tech/card/:id` |

## Inventory Manager — 3 / 6

| Page | State | Route | Notes |
|---|:--:|---|---|
| Inventory Home | ⬜ | — | The spec's card-based home. `/inventory` currently redirects straight to Requests |
| Technician Requests | ✅ | `/inventory/requests` | |
| Inventory POS / Catalog Control | ⬜ | — | Item create/edit, pricing, POS visibility. No catalog management exists at all |
| Quantity Control & Stock Status | ✅ | `/inventory/stock` | |
| Returns / Movements | 🟡 | `/inventory/items/:id` | The ledger is built and readable. The spec's *actions* — accept/reject a return, request clarification — have no page |
| Reports & Stock Insights | ⬜ | — | |

## Tenant Owner — 1 / 8

| Page | State | Notes |
|---|:--:|---|
| Owner Home | ⬜ | Phase 10. `OwnerShell` now exists, with History as its only rail item |
| Organization & Access | ⬜ | Roles, permissions, staff. The permission engine is built; nothing drives it |
| Forms & Fields | ⬜ | |
| Messages & Templates | ⬜ | |
| Pricing & Financial Configuration | ⬜ | `FinanceConfiguration` exists in the schema, unreachable |
| Reports & Analytics | ⬜ | |
| Audit & Change History | 🟡 | `/owner/audit` — filterable, with inline diffs. **Rollback not built**: it deep-links to Control Center and Owner pages that do not exist yet. Timestamps use the reader's locale, not the workshop's timezone (the session does not carry it) |
| Workflow Health / Operations Integrity | ⬜ | |

## Team Leader — 0 / 4

| Page | State |
|---|:--:|
| Team Leader Home | ⬜ |
| Technicians View | ⬜ |
| Vehicles / Work Orders View | ⬜ |
| Technician Performance Reports | ⬜ |

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

## Customer Portal — 1 / 6

| Page | State | Notes |
|---|:--:|---|
| Customer Portal Home | ⬜ | |
| My Assets | ⬜ | |
| Current Service | ⬜ | |
| Decision Page / Approvals | ⬜ | **The public token path.** `CustomerDecisionRequest.secureToken` exists and nothing consumes it — the customer cannot actually approve anything today |
| Invoice & Payment Status | ⬜ | |
| Safe Technical History | ⬜ | `SafeTechnicalHistory` + `CustomerSafeProjectionService` are built and unreachable |

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

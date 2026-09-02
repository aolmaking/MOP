# MOP — Reporting and Analytics

> **Document ID:** DOC-31
> **Purpose:** every reporting surface, every metric, and the records each number traces to.
> **Authority:** DESCRIPTIVE.
> **Scope:** `apps/api/src/insights/**` — analytics, analyst-reporting, owner-reports, workflow-health — plus Team Leader and Inventory reports.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 21 (traceability), 14 (Owner surfaces), 05 (what each role may see).

---

## 1. The governing rule

> **No number without lineage.** Every metric must trace to the records or movements that produced it.

Three consequences visible in the shipped product, each a deliberate refusal to fabricate:

- Financial reports return **`profit: null`** when a part line never recorded a cost — not zero, not an estimate.
- `topServicesByRevenue` is **explicitly grouped by invoice-line text**, and says so, because no stable `serviceId` exists on an invoice line.
- Feature Adoption reports Custom Fields and Message Templates as **not trackable yet**, because no consuming form captures values and no message-sending code exists.

A fourth, in Workflow Health: one of the spec's six integrity checks is declared **not computable** rather than faked, because it needs `TenantConfiguration.workflowPolicy`, which is still an empty unread placeholder.

## 2. Derived, not snapshotted

The event ledger being real is what makes honest reporting possible.

| Derivation | Source | Utility |
|---|---|---|
| Time in each status | `work_order.status_changed` history | `lifecycle-duration.util.ts` |
| Rework loops | A status re-entered after already being left | `detectStatusLoops` |
| Stock velocity | `StockMovement` | `InventoryReportsService` |
| Working-hours ageing | `WORKING_WEEK` + country weekend days | `workingHoursBetween` |
| Historical workshop shape | Time-ranged `TenantCapability` | `resolveAsOf()` |

**`averageTimeInStatus` reconstructs per-status duration from event history, not from a snapshot column.** A job that sat in `WAITING_PARTS` for two days and was then reopened contributes both intervals.

### Shared utilities, not reimplementations

| Utility | Used by |
|---|---|
| `lifecycle-duration.util.ts` | Owner Reports · Workflow Health · Analyst Operations |
| `date-range.util.ts` | All five Owner report tabs |
| `InventoryReportsService` | Inventory Manager · Owner Reports · Analyst Inventory |
| `csv.util.ts` | All five analyst exports |

Three surfaces sharing one velocity implementation is why *stock risk* means the same thing to a storekeeper, an owner and an analyst.

## 3. The five reporting surfaces

| Surface | Role | Scope | State |
|---|---|---|---|
| **Owner Reports & Analytics** | Owner | Company-wide | 🟡 |
| **Data Analyst** (7 pages) | Analyst | Company-wide, read-only, money-free | ✅ |
| **Team Leader Reports** | Team Leader | `managedTechnicianIds` only | ✅ |
| **Inventory Reports** | Inventory Manager | Warehouse scope | ✅ |
| **Platform Reports** | Super Admin | Cross-tenant | 🟡 |
| **Workflow Health** | Owner | Company-wide integrity | ✅ |

## 4. Owner Reports & Analytics — `/owner/reports`

Five tabs sharing **one** date-range and branch query contract (`date-range.util.ts`), so a filter means the same thing everywhere.

| Tab | Endpoint | Notable |
|---|---|---|
| Overview | `GET /organization/reports/overview` | |
| Operations | `…/operations` | Real `averageTimeInStatus` from event history |
| Financial | `…/financial` | `profit: null` where cost is unrecorded; services grouped by line text |
| Inventory | `…/inventory` | Reuses `InventoryReportsService` |
| Customers | `…/customers` | |

**Not built this pass, with reasons recorded:**
- **Per-role report visibility** — needs the same platform-lock mechanism as Pricing's *Who Can Handle Money* and Builder Control's permission matrix. One mechanism, three pages waiting.
- **Service and Staff as fully separate tabs** — folded into Financial and Operations. A full second axis was not justified by data depth beyond what is already there.

## 5. Data Analyst — 7 pages

| Page | Endpoint | Contains |
|---|---|---|
| Home | `/analytics/home` | **Composes** the other five services' own headline numbers rather than recomputing them, so a tile can never drift from the page it summarises |
| Operations | `/analytics/operations` | Volume over time (created vs. completed), status distribution, time-in-status, branch comparison, blocker analysis, delivery/payment funnel |
| People | `/analytics/people` | Per-technician stats, team throughput, diagnostic-code activity |
| Inventory | `/analytics/inventory` | Velocity risk; branch scope resolved to warehouse scope via `BranchWarehouseAccess` |
| Decisions | `/analytics/decisions` | Approval/rejection rates by importance, response time, overdue rate, critical-rejection follow-up outcome, link-open rate |
| Feature Adoption | `/analytics/feature-adoption` | Quick/Full Inspection usage, decision-request volume |
| Saved Views / Exports | `/analytics/saved-views` | Per-analyst configurations |

### The privacy rules, each enforced by its own test

- **People Analytics carries no payment or invoice figure anywhere in its output shape.**
- **Decision Analytics carries no customer-identifying field.**
- **The delivery/payment funnel carries counts and durations only — never a currency amount.**
- **Inventory value is gated on `inventory.cost.view`**, the same as the Inventory Manager's own catalogue.

These are asserted at the **response shape**, not by omission in a component. Hiding in the browser is not hiding.

### Saved views
Per-analyst named configurations with a source page and created date; Open / Rename / Delete, plus *Save This View* on each analytical page. Ownership always resolves from the **session's own tenant and account**, never from the request body. They persist **report configuration, never operational data**.

### Export
`GET /analytics/export/:category` re-runs **the same `build()` call the page itself renders** — not a second query that could drift — and streams a real CSV.

Gated twice: `analytics.export` (locked outright when the plan's `allowedExports` is empty), then the specific category against that same list. Every export writes a `LOW`-risk `analytics.export.generated` audit row.

`[VERIFIED]` by a real-HTTP integration test (success + audit row, plan-category-denied, plan-empty, unauthenticated), a unit test for the CSV serialiser, and a manual run against the real dev database as the seeded analyst.

⚠️ **No analytical page has a date-range filter UI yet**, so an export reflects the server's default range. The page's own honest phrasing is *"exactly the currently-shown default range"*.

## 6. Team Leader Reports

`GET /team-leader/reports`, permission `reports.team.view`. Scoped to `managedTechnicianIds`.

**No price, cost or payment field anywhere in the response shape** — asserted by its own test. Company-wide technician performance is the Data Analyst's surface, not this one.

## 7. Inventory Reports

`GET /inventory/reports`, permission `reports.inventory.view`.

Stock risk is **velocity-based, per warehouse** — not a static threshold comparison. An item with a threshold of 10 and no movement in a year is not at risk; one with a threshold of 4 consumed daily is.

For a single-warehouse tenant the comparison section is **absent, not empty**.

## 8. Workflow Health — `/owner/workflow-health`

Two facets, both real.

**Integrity checks — 5 of the spec's 6**, each a real computed query:

| Check | Finds |
|---|---|
| Part arrival unconfirmed | An issued part nobody confirmed receiving |
| Customer responded but not reflected | An answer that did not move the job |
| Return pending review | A return sitting in the manager's queue |
| Team leader missing report access | A supervisory role that cannot see its own reports |
| Work-order / task status conflict | The two disagreeing |
| Orphaned status change | **A status change with no `OperationEvent` behind it — the ledger auditing itself** |

The 6th, *Customer-Portal-policy-vs-module contradiction*, is **explicitly listed as not computable** because `TenantConfiguration.workflowPolicy` is an empty, unread JSON placeholder.

**Bottleneck and SLA diagnostics:** dwell time attributed to a waiting-cause taxonomy (people / inventory / approval / payment / quality), rework-loop detection, and breached / at-risk / on-track / **untracked** SLA buckets. *Untracked* is a real bucket, not a rounding of *on-track* — `expectedDurationMinutes: null` means no SLA is tracked, not zero minutes allowed.

`POST /organization/workflow-health/issues/:fingerprint/acknowledge` records that an operator has seen a finding, fingerprint-keyed so the same issue does not re-nag.

## 9. Platform Reports

`GET /platform/reports` — Level 1 aggregate totals plus a per-workshop card grid.
`GET /platform/reports/:id/usage` — Level 2, **Usage Overview only**.

🔴 Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, and Health & Risk are **named as owed, not shipped as empty tabs.**

## 10. Metric lineage reference

| Metric | Traces to |
|---|---|
| Open work orders | `WorkOrder.status` ∉ terminal |
| Average time in status | `OperationEvent` `work_order.status_changed` |
| Rework rate | `detectStatusLoops` over the same history |
| SLA breach | `expectedDurationMinutes` vs. `workingHoursBetween` |
| Waiting-cause attribution | Dwell time per status, mapped to a taxonomy |
| Revenue | `Invoice` + `InvoiceLine` |
| Outstanding | `invoice.total − Σ completed Payment` |
| Profit | Revenue − recorded cost, **`null` if any cost is unrecorded** |
| Top services | `InvoiceLine` grouped by **text** — no stable `serviceId` |
| Stock velocity | `StockMovement` over a window |
| Low / critical stock | `WarehouseStockBalance` vs. thresholds |
| Inventory value | `availableQty × cost` — **needs `inventory.cost.view`** |
| Decision approval rate | `CustomerDecisionItem.decision` by `SeverityLevel` |
| Decision response time | `customer_decision.sent` → `.responded` |
| Link-open rate | `CustomerDecisionStatus` `SENT` → `VIEWED` |
| Technician throughput | `Task` completions + `WorkOrderAssignment` |
| Feature adoption | Real counts per feature; **absent where nothing records it** |

## 11. Implementation status

| Element | Status |
|---|---|
| Owner Reports, 5 tabs, one date-range contract | 🟡 |
| Durations reconstructed from event history | ✅ |
| Honest nulls where data does not support a figure | ✅ |
| 7 Data Analyst pages | ✅ |
| Privacy shape rules, each test-asserted | ✅ |
| Saved views, session-scoped ownership | ✅ |
| Real CSV export, double-gated, audited | ✅ `[VERIFIED]` |
| Team Leader reports, managed scope, money-free | ✅ |
| Inventory velocity risk, reused by 3 surfaces | ✅ |
| Workflow Health: 5 checks + bottlenecks + SLA buckets | ✅ |
| **Date-range filter UI on analytical pages** | 🔴 |
| **Per-role report visibility** | 🔴 — blocked on the platform-lock mechanism |
| **Platform Reports' 5 remaining sections** | 🔴 |
| **6th integrity check** | ⬜ named not-computable — blocked on `workflowPolicy` |
| **Stable `serviceId` on invoice lines** | 🔴 — would make *top services* exact |
| **Scheduled / emailed reports** | 🔴 — needs the message transport |

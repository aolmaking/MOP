# MOP — Audit and Traceability Model

> **Document ID:** DOC-21
> **Purpose:** what MOP records, why, and how any number or state in the product traces back to the records that produced it.
> **Authority:** ARCHITECTURAL.
> **Scope:** `AuditLog`, `OperationEvent`, and the derived-history utilities.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `apps/api/src/audit/audit.service.ts`, `apps/api/src/systems/operations/operation-events.service.ts`, `packages/shared/src/contracts/events.ts`, `tools/lint-audit-boundary.mjs`.
> **Related:** 08 §7 (the event pipeline), 31 (metric lineage), 22 (invariants).

---

## 1. The standing rule

> **Every important business result must be traceable to the records or movements that produced it.**

A number with no lineage is not reported. That is why Feature Adoption Analytics says Custom Fields and Message Templates are *not trackable yet* rather than showing a count, and why financial reports return `profit: null` when a part line never recorded a cost.

## 2. Two ledgers, two jobs

| | `AuditLog` | `OperationEvent` |
|---|---|---|
| **Answers** | *Who decided this, and what did it look like before?* | *What happened, and what else must change because of it?* |
| **Written by** | `AuditService` **only** | `OperationEventsService` **only** |
| **Enforced by** | `tools/lint-audit-boundary.mjs` — the build fails | ⚠️ A declared list of 45 keys — **not enforced on the emit path** (G-EVT-01) |
| **Shape** | actor, target, action, before, after, reason, risk | key, tenant, actor, payload, timestamp |
| **Read by** | The Owner's Audit & Change History page | Reports, workflow health, customer timeline, analytics |

They are deliberately separate. Audit answers accountability questions; events drive propagation. Merging them would mean every propagation event carried an accountability shape it does not have, and every accountability record implied a fan-out it does not cause.

## 3. `AuditLog`

```
tenantId?   actorId   actorType   actorName
targetType  targetId  action
before?     after?    reason?     riskLevel   createdAt
```

Indexed on `(tenantId, createdAt)` and `(targetType, targetId)` — the two questions the page actually asks: *what changed here recently*, and *what has ever happened to this record*.

`tenantId` is nullable because **platform actions are real audit events with no tenant of their own.**

`actorName` is denormalised on purpose. An audit row must stay readable after the account is deactivated, renamed, or removed from the workshop — a join that resolves to nothing is not an audit trail.

`AuditActorType`: `SYSTEM` · `PLATFORM` · `TENANT_STAFF` · `CUSTOMER`.
`AuditRiskLevel` is on every row, so a reviewer can find the consequential changes without reading every routine one.

**One writer, one shape.** *"Which fields did we actually capture"* is never a question that depends on which module happened to write the row. `record()` accepts a caller's transaction, so the change and its audit row commit together — an audited action that succeeded while its audit row failed would be worse than no audit at all.

### The actions recorded today (~30)

| Area | Actions |
|---|---|
| Platform | `platform.workshop.created` · `platform.workshop.frozen` |
| Governance | `governance.role_permission_lock.set` · `…removed` · `governance.staff.restricted` · `governance.staff.restriction_lifted` |
| Capability & policy | `capability.changed` · `policy.changed` · `policy.expired` |
| People | `staff.created` · `staff.invited` · `staff.scope_updated` · `team.created` · `team.leader_assigned` · `team.member_assigned` |
| Structure | `branch.created` · `warehouse.created` · `warehouse.deactivated` · `warehouse.reactivated` |
| Operations | `work_order.created` · `workorder.status.changed` |
| Customer | `customer_decision.responded` |
| Finance | `finance.invoice.issued` · `finance_configuration.updated` · `price_catalog.set` |
| Configuration | `custom_field.added` · `message_template.published` |
| Insights | `analytics.export.generated` *(LOW risk)* |

`policy.expired` is worth noting: **closing a time-ranged row is itself an audited event**, not a side effect of writing the new one.

## 4. `OperationEvent` — the propagation ledger

*Every significant action emits one row here before fanning out to workflow status, notifications, audit, and the customer-safe projection.*

`OPERATION_EVENT_KEYS` declares **45 keys**, grouped by emitting system:

| System | Events |
|---|---|
| **Operations** (12) | `work_order.created` · `work_order.status_changed` · `technician.assigned` · `inspection.saved` · `fault.created` · `blocker.reported` · `blocker.resolved` · `task.finish_attempted` · `task.finish_blocked` · `task.completed` · `task.sent_to_review` · `asset.ownership_transferred` |
| **Customer decisions** (4) | `customer_decision.{requested,sent,responded,expired}` |
| **Inventory** (9) | `part.{requested,issued,arrived_confirmed,used,unavailable,return_requested,return_accepted,return_rejected}` · `stock.movement_recorded` |
| **Finance Core** (7) | `chargeable_item.{added,removed}` · `running_balance.updated` · `invoice_candidate.created` · `payment.recorded` · `refund.{requested,approved}` |
| **Billing** (8) | `invoice.{issued,document_generated,cleared,clearance_failed,rejected,cancelled}` · `credit_note.issued` · `debit_note.issued` |
| **Governance** (6) | `capability.changed` · `permission.changed` · `platform_control.changed` · `workshop.frozen` · `workshop.reactivated` |

Declared as one list so that *"which events exist"* has one written answer instead of being discovered by grepping for emit calls — which is how the previous implementation ended up with modules that quietly bypassed the pipeline altogether.

### ⚠️ Two findings the declaration does not currently deliver

**G-EVT-01 — the union is decorative on the emit path.** `EmitOperationEventInput.eventKey` is typed `string`. `OperationEventKey` is imported only by `contracts.spec.ts`. A typo is **not** a compile error, and four undeclared keys are emitted today: `task.started`, `task.blocked`, `task.return_for_rework`, `customer_decision.recorded`.

**G-EVT-02 — 26 of the 45 declared keys are never referenced in production code.** Some are honest vocabulary ahead of unbuilt features (billing clearance, debit notes). Others belong to flows that **are** built and simply do not emit: `stock.movement_recorded`, `chargeable_item.added`/`.removed`, `running_balance.updated`, `refund.requested`/`.approved`, `credit_note.issued`, `part.return_requested`/`.return_accepted`/`.return_rejected`, `workshop.frozen`/`.reactivated`, `permission.changed`, `platform_control.changed`. Those flows change state without emitting the event that would fan it out — a partial hole in the truth-propagation guarantee, not a missing feature.

### The envelope

```ts
DomainEventEnvelope {
  key, tenantId, emittedBy, actorId, actorType, occurredAt, requestId?, payload
}
```

- **`emittedBy`** is one of the six owning systems, so an event emitted by the wrong system is visible rather than plausible.
- **`requestId`** correlates an event with the HTTP request that caused it. This is what makes *"reconstruct what happened"* tractable rather than archaeological: one request id gathers every projection a single press produced.

## 5. Derived history — the reason this pays off

Because the event ledger is real, several things are **reconstructed** rather than snapshotted:

| Derivation | How |
|---|---|
| Time in each status | `lifecycle-duration.util.ts` reconstructs per-status duration from `work_order.status_changed` history — **not** a stored duration column |
| Rework loops | `detectStatusLoops` — a status re-entered after already being left |
| Orphaned status changes | A Workflow Health integrity check: a status change with no `OperationEvent` behind it. **The ledger auditing itself** |
| Historical workshop shape | `CapabilityResolutionService.resolveAsOf()` at the job's opened-at timestamp |
| Stock balance proof | `StockService.replay()` — replaying the movements must reproduce the balance |

`lifecycle-duration.util.ts` is reused by Owner Reports, Workflow Health and Data Analyst Operations rather than reimplemented three times.

## 6. The immutable-record family

Nothing in this family is ever mutated. Superseded, closed, or appended to — never rewritten.

| Record | Discipline |
|---|---|
| `AuditLog` | Insert only |
| `OperationEvent` | Insert only |
| `StockMovement` | Insert only; corrections are new movements |
| `Invoice` / `InvoiceLine` | Immutable once issued; only a `CreditNote` follows |
| `WorkOrderNote` | **Append-only — no update or delete path exists** |
| `TenantCapability` | Time-ranged; a change closes and opens |
| `WorkshopPolicy` | Time-ranged |
| `PriceCatalogEntry` | Effective-dated |
| `MessageTemplate` | Immutable per version |
| `SpecializationEntry` | Pins `definitionVersion` |
| `AssetOwnershipHistory` | One open row; closed rows persist |

`tools/lint-no-hard-delete.mjs` enforces the absence of hard deletes. A `ControlSetting` hard-delete was a real bug (H10).

## 7. What the Owner can see

`/owner/audit`, permission `audit.own_tenant.view`, tenant-isolation asserted **in the query** rather than in the controller.

Filterable, with **inline diffs** from `before` / `after`. Verified live as a seeded owner: 8 real rows including that session's own capability changes and customer decisions, every filter working, and a manager without the permission refused with 403.

**Two named gaps:**
- **Rollback is not built.** It would deep-link to Control Center and Owner pages that do not exist yet.
- **Timestamps use the reader's locale, not the workshop's timezone** — the session does not carry it. For a workshop trading in one timezone and an owner reading from another, that is a real ambiguity, recorded rather than papered over.

## 8. What audit is not

- **Not a change feed for the UI.** That is `OperationEvent`.
- **Not a security log.** Login attempts, session revocation and rate limiting are runtime concerns (doc 33).
- **Not a substitute for the domain record.** *Who approved this discount* is answered by `DiscountRequest`, which is a first-class record. Audit says who changed it and what it looked like before.

## 9. Implementation status

| Element | Status |
|---|---|
| Single audit writer, lint-enforced | ✅ `[VERIFIED]` |
| Uniform audit shape incl. before/after/reason/risk | ✅ `[IMPLEMENTED]` |
| Transaction-aware audit writes | ✅ `[IMPLEMENTED]` |
| ~30 audit actions across every system | ✅ `[IMPLEMENTED]` |
| 45-key event vocabulary declared in one place | ✅ `[IMPLEMENTED]` |
| **Type enforcement of that vocabulary on the emit path** | ⚠️ G-EVT-01 — `eventKey: string`; 4 undeclared keys emitted today |
| **Declared keys actually emitted** | ⚠️ G-EVT-02 — 19 of 45; several built flows emit nothing |
| `requestId` correlation | ✅ `[IMPLEMENTED]` |
| Reconstructed durations, loops, historical shape | ✅ `[INTEGRATED]` |
| Orphaned-status-change integrity check | ✅ `[INTEGRATED]` |
| Owner audit page with filters and diffs | ✅ `[VERIFIED]` |
| Export audited (`analytics.export.generated`) | ✅ `[VERIFIED]` |
| **Rollback from the audit trail** | 🔴 `[INTENDED]` |
| **Workshop-timezone timestamps** | 🔴 `[INTENDED]` |
| **Audit retention / archival policy** | 🔴 `[INTENDED]` — nothing prunes `AuditLog` or `OperationEvent`; a busy tenant grows both without bound |
| Audit coverage of the unreachable commands | ⚠️ — `staff.restricted` / `restriction_lifted` are wired to a service with no endpoint |

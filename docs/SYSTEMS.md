# The Systems Inside MOP — Boundaries and Contracts

> **Scope:** MOP is not one application with many pages. It is several full systems running simultaneously against one shared operational spine. This document names them, draws their boundaries, and defines how they are allowed to talk to each other.
> **Status:** design. ⚠️ §1's decomposition needs product-owner confirmation — see the open question at the end of that section.
> **Date:** 2026-08-08.

---

## 1. The systems

Each of these is a product in its own right. Each has its own domain language, its own reports, its own specialist user, and could plausibly be sold alone. What makes MOP valuable is that they share one spine.

### 1. Operations
The spine. Customer and asset intake, work orders, tasks, inspections, faults, diagnostic codes, blockers, the lifecycle state machine, and the Finish Gate.

*Owns:* `WorkOrder`, `Task`, `Inspection`, `Fault`, `TaskBlocker`, `Asset`, `Customer`, `AssetOwnershipHistory`
*Specialist user:* Branch Manager · *Executor:* Technician

### 2. Inventory
A complete warehouse management system. Catalog, SKUs, multi-warehouse stock, thresholds, the part-request lifecycle, issue/arrival/use/return, the movement ledger, transfers, supplier orders.

*Owns:* `InventoryItem`, `WarehouseStockBalance`, `PartRequest`, `IssuedItem`, `PartReturnRequest`, `StockMovement`, `InventoryTransfer`, `SupplierOrder`
*Specialist user:* Inventory Manager

### 3. Finance
Pricing catalog, quotations, the live running invoice, final invoicing, payment ledger, discounts, refunds, credit notes, tax, and financial reporting.

*Owns:* `PriceCatalogEntry`, `Quotation`, `RunningInvoice`, `Invoice`, `Payment`, `DiscountRequest`, `RefundRequest`, `CreditNote`, `FinanceConfiguration`, `InvoiceSequence`
*Specialist user:* Owner · *Operator:* Branch Manager

### 4. People & Performance
Staff, roles, scoping (branch/warehouse/category/team), teams and membership history, supervision, and technician performance measurement.

*Owns:* `StaffUser`, `Team`, `TeamMembership`, `WorkOrderAssignment`, `TaskAssignment`
*Specialist users:* Team Leader, Owner

### 5. Governance & Control
The platform's control plane. Tenant lifecycle, capability shaping and smart delete, the permission matrix, configuration and publishing, entitlements and limits, and the audit trail.

*Owns:* `Tenant`, `Plan`, `ControlSetting`, `TenantConfiguration`, `RolePermission`, `UserPermissionOverride`, `AuditLog`, `PlatformLiveViewSession`
*Specialist user:* Platform Super Admin

### Cross-cutting — shared infrastructure, not separate systems

**Customer Engagement** — the portal, decision requests, notifications, the customer-safe projection layer, and the customer timeline. Not a sixth system because it owns no business process of its own; it is the *outward face* of the other five.

**Reporting & Analytics** — reads from all five, owns none. Its correctness depends entirely on the five below it being correct.

**History** — not a system and deliberately not a table. History is the audit trail plus the time-ranged records (`AssetOwnershipHistory`, `TeamMembership`, `PriceCatalogEntry`, and the forthcoming `TenantCapability`). A separate "history system" that duplicates state is how history and reality drift apart.

### ⚠️ Open question for the product owner

The brief says *"about 5 systems."* The five above are my reading, mapped to the original words:

| Original wording | Mapped to |
|---|---|
| "the inventory and inventory manager" | **Inventory** |
| "the financial system … on the workshop owner page" | **Finance** |
| "the bills system … very sensitive" | **Finance** (invoicing is inside it) |
| "an employee performance reporting system" | **People & Performance** |
| "the history page contains each detail of each detail" | **Cross-cutting — History** |
| *(implied throughout)* | **Operations**, **Governance & Control** |

**The one real fork: is Billing/Invoices a separate system from Financial, or one system?** Splitting them means invoicing owns document generation, numbering, legal compliance and e-invoicing, while Finance owns pricing, margin and reporting — a defensible split, especially given e-invoicing mandates (§4). Keeping them together is simpler. This affects module boundaries and team ownership, so it should be settled before Phase 3.

## 2. The rule that keeps them separate

> **Systems communicate through domain events and explicit contracts. A system never reads or writes another system's tables directly.**

Finance must not query `Task`. Inventory must not update `WorkOrder.status`. When Finance needs to know that work was approved, it receives an event carrying what it needs.

Without this rule, five systems become one large mud ball with five names, and every change to the work-order table breaks invoicing. With it, each system can be reasoned about, tested, and eventually scaled or extracted independently.

`OperationEventsService` is the enforcement point and already exists. The discipline to add is that **cross-system reads go through a published contract** — a typed query interface a system exposes to others — rather than a convenient join.

## 3. The contracts

The interactions that actually matter. Each is a place where two systems must agree, and therefore a place where bugs are expensive.

| From → To | Event / contract | Why it is delicate |
|---|---|---|
| Operations → Finance | `customer_decision.responded` (approved items) | Approved prices **lock** here. Late or duplicated delivery means billing something the customer never agreed to |
| Operations → Inventory | `part.requested` | Carries work order, task, branch, category — Inventory needs the branch to pick a warehouse |
| Inventory → Operations | `part.issued` / `arrived` / `unavailable` | Drives `WAITING_PARTS` and the Finish Gate. **The contract that breaks if Inventory is smart-deleted** — see `CAPABILITY_MODEL.md` §5 |
| Inventory → Finance | `part.used` (selling price, quantity) | The only path from a physical part to a billable line. Price comes from the catalog **at approval time**, never re-read later |
| Operations → People | `task.completed`, `blocker.reported` | Feeds performance metrics. Must carry duration and blocker attribution or the metric is unfair to the technician |
| Finance → Operations | `invoice.issued`, `payment.recorded` | Releases the delivery gate |
| All → Governance | every audited action | Lint-enforced: only the audit module may write `AuditLog` |
| Governance → All | capability change applied | Every system must reroute per its removal policy, in one transaction |
| All → Customer Engagement | any customer-visible event | Passes through customer-safe projection. **Never** raw internal text |

## 4. Going global

The brief is explicit that this will travel. That has specific consequences beyond translation.

**Language and direction.** Arabic is a primary working language, and there is currently **no i18n or RTL provision anywhere in the codebase**. See `UX_PRINCIPLES.md` §6 — the trap is bidirectional text, where a Latin plate number inside an Arabic sentence renders backwards without explicit isolation. A plate number shown backwards on a work order is an operational error, not a cosmetic one.

**Money.** One currency per tenant (`Tenant.currency`, already modelled). Money is never summed across tenants; platform revenue reports per-currency or converts with a stored rate and a stated as-of date.

**Tax is a pluggable policy, not a field.** VAT, GST, sales tax, and no-tax jurisdictions differ in rate, rounding, inclusive vs. exclusive pricing, and what is exempt. The rate applied must be **snapshotted onto the invoice**, so a five-year-old invoice re-renders correctly after the law changes.

**Invoice compliance is a capability, and a serious one.** Several target markets mandate government e-invoicing — Egypt's ETA and Saudi Arabia's ZATCA both require submitting invoices to a state portal in a prescribed format, often with digital signatures and QR codes, with legally-mandated numbering rules. This is not a formatting preference; in those markets an invoice that has not been cleared is not a valid invoice.

The implication for the architecture: **invoice document generation must be a pluggable, per-country adapter behind a stable interface**, decided before Finance is built, not after. It is also the strongest argument for splitting Billing from Finance in §1's open question.

**Data residency.** GDPR, Saudi PDPL, and similar regimes may require a tenant's data to stay in-region. The schema's pervasive `tenantId` makes per-tenant extraction feasible; regional deployment should stay possible and not be designed away.

## 5. What this means for build order

Roles are how users experience MOP. **Systems are how it is built.** The rebuild's phases are grouped by role, and that carries a real risk: one part-unavailable scenario touches Operations, Inventory, Finance, People, and Customer Engagement at once. Building role-by-role is exactly how the previous attempt produced pages that each worked alone and did not connect.

The mitigation, and it is not optional:

1. **Contracts before pages.** The events and interfaces in §3 are defined and typed before the roles that trigger them are built.
2. **Every phase closes with a cross-system scenario walkthrough**, not a page checklist.
3. **The scenario catalogue is organised by scenario, not by role**, so a scenario's owner is responsible for it working across every system it touches.

---

**Related:** [`CAPABILITY_MODEL.md`](./CAPABILITY_MODEL.md) · [`VISION.md`](./VISION.md) · [`DATABASE_STRATEGY.md`](./DATABASE_STRATEGY.md)

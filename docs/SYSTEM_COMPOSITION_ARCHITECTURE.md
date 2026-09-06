# MOP Platform — Structural Workshop Decision Inventory & System Composition Architecture

**Document Type:** Architectural Blueprint & Dependency Inventory  
**Status:** Authoritative  
**Milestone:** Sprint 3 Closure -> Sprint 4 (Layer 3A: System Composition Engine)  
**Date:** 2026-09-05  

---

## 1. Guiding Architectural Thesis

> **In a modular workshop platform, removing an operational component must never simply mean hiding its UI page or disabling an endpoint. The entire system must dynamically reorganize around its absence.**

When a workshop chooses not to maintain an internal parts stockroom, parts do not cease to be needed for vehicle repair:
- The responsibility to source parts migrates to the Branch Manager or Technician.
- The workflow transforms from an internal multi-step stock requisition into a direct spot-buy receipt.
- The gates adapt from tracking stock returns to verifying external purchase costs and supplier references.
- The application surfaces relocate into the manager's work-order workspace.
- The reporting metrics adapt from stock valuation/dead-stock into job-level parts margins and vendor lead times.

Removing something from a workshop must trigger **responsibility migration**, **surface migration**, **workflow transformation**, and **gate substitution**.

---

## 2. Structural Workshop Decision Inventory

Following a forensic reality audit across all systems, roles, gates, workflows, and pages, **12 Structural Decisions** govern the composition of workshop operating models:

### SD-01: Facility Scale & Site Topology (`MULTI_BRANCH`)
- **Enabled:** Multi-site organization with `Branch` entity selector, branch managers, branch-scoped staff, branch-scoped work orders, and multi-branch comparison analytics (`reports.branch_comparison`).
- **Absent:** Single workshop site. The concept of "Branch" is completely transparent. Branch selector disappears. Branch comparison reports disappear.
- **Responsibility Migration:** Branch management duties (intake, assignment, dispatch, delivery release) migrate directly to `TENANT_OWNER` or a unified `WORKSHOP_MANAGER`.
- **Surface Migration:** Organization settings `/owner/organization` collapses Branch CRUD into a single "Site Profile" tab. Top nav branch selector disappears.

### SD-02: Parts Fulfillment Engine (`INVENTORY_HOLDING`)
- **Enabled:** Physical stockroom with `Warehouse`, `WarehouseStockBalance`, `StockMovement`, catalog management, minimum reorder thresholds, formal requisition workflow (`PartRequest`: `REQUESTED -> APPROVED -> ISSUED -> ARRIVED -> RECEIVED_BY_TECHNICIAN -> USED`), return workflow (`PartReturnRequest`), dedicated `INVENTORY_MANAGER` role, `/inventory/*` shell and 6 pages, stock health reports.
- **Absent:** Zero stock held. No storekeeper. Parts are procured per-job via spot-buy (`EXTERNAL_PURCHASE`) from local distributors or supplied by customer (`CUSTOMER_SUPPLIED`).
- **Role Reorganization:** `INVENTORY_MANAGER` role and `/inventory/*` shell are removed.
- **Responsibility Migration:** Sourcing parts and recording vendor delivery migrates to `BRANCH_MANAGER` (or `SERVICE_ADVISOR` / `OWNER` / `TECHNICIAN`).
- **Workflow Transformation:** `PART_REQUEST_GRAPH` deactivated. `WAITING_PARTS` transforms from "Waiting for internal stock issue" to "Waiting for external supplier delivery". Parts recorded directly as `WorkOrderPartLine`.
- **Gate Transformation:** Gates `parts.received_used_or_returned` and `parts.no_pending_return` dropped; substituted with `parts.external_resolved`.
- **Surface Migration:** Direct Procurement Widget migrates into `BranchManagerWorkOrderWorkspace` (`/branch/work-orders/:id`). Lightweight external part button appears in `TechWorkCard`.
- **Reporting Facts:** Inventory valuation and dead-stock reports replaced by Job-Level Parts Margin & Supplier Lead Time Analytics.

### SD-03: Multi-Warehouse Network Topology (`MULTI_WAREHOUSE`)
- **Enabled:** Distributed internal warehouses, stock transfers (`InventoryTransfer`: `REQUESTED -> IN_TRANSIT -> RECEIVED`), warehouse access matrix (`BranchWarehouseAccess`), per-warehouse stock valuation.
- **Absent:** Exactly one stock warehouse per site. Stock transfer workflows disabled.
- **Surface Migration:** Warehouse selector in `/inventory/stock` disappears. Flat stock quantities displayed.

### SD-04: Technical Diagnostic & Inspection Gate (`TECHNICAL_INSPECTION_GATE`)
- **Enabled:** Mandatory diagnostic inspection before repair authorization. Work order transitions `REGISTERED -> UNDER_INSPECTION`. Technicians record checklist items, faults, and measurement forms. Gate `inspection_completed` strictly guards entry to `APPROVED_FOR_WORK`.
- **Absent:** Express service model (e.g. quick lube, battery replacement, tire puncture, car detailing). Direct authorized booking.
- **Workflow Transformation:** State `UNDER_INSPECTION` removed from active path. Work orders transition directly `REGISTERED -> APPROVED_FOR_WORK -> IN_PROGRESS`.
- **Gate Transformation:** Gate `inspection_completed` dropped or auto-satisfied upon booking intake.
- **Surface Migration:** Inspection recording tab in `TechWorkCard` disabled. Service tasks generated directly from customer-selected service packages.

### SD-05: Supervisory Hierarchy & Team Structure (`TEAMS_STRUCTURE`)
- **Enabled:** Technicians belong to `Team`s. `TEAM_LEADER` role, managed technician scoping, private `SupervisionNote`s, team dispatch, `/team-leader/*` shell and 4 pages, team throughput reports.
- **Absent:** Flat technician floor reporting directly to site management. Role `TEAM_LEADER` and `/team-leader/*` shell removed.
- **Responsibility Migration:** Technician assignment, workload balance, and shift monitoring migrate to `BRANCH_MANAGER`.
- **Surface Migration:** Technician roster migrates into `/branch/team` (or an "Operations Floor" tab in `BranchShell`).

### SD-06: Peer Quality & Workmanship Review (`TEAM_REVIEW`)
- **Enabled:** Work order transitions `IN_PROGRESS -> READY_FOR_TEAM_REVIEW`. Lead technician inspects workmanship and approves (`REVIEW_PASSED`) or returns for rework (`REVIEW_REJECTED`). Gate `review.team_review_passed`.
- **Absent:** Direct handover to QC or Delivery (`IN_PROGRESS -> READY_FOR_QC` or `READY_FOR_DELIVERY`). State `READY_FOR_TEAM_REVIEW` and gate `review.team_review_passed` removed.

### SD-07: Independent Quality Control Inspection (`INDEPENDENT_QC`)
- **Enabled:** Independent QC inspector evaluates repairs against test criteria. States `READY_FOR_QC`, `QC_FAILED`. Rework loops (`QC_FAILED -> IN_PROGRESS`). Gate `qc.passed`.
- **Absent:** Technician self-certifies or Branch Manager signs off at delivery. States `READY_FOR_QC` and `QC_FAILED` removed from lifecycle.
- **Responsibility Migration:** Road test and final release verification migrate to `BRANCH_MANAGER` at delivery handover.
- **Gate Transformation:** Gate `qc.passed` dropped.
- **Surface Migration:** Replaced by lightweight "Vehicle Release Checklist" on `/branch/delivery`.

### SD-08: Customer Engagement & Authorization Channel (`CUSTOMER_PORTAL`)
- **Enabled:** Digital customer portal `/customer/*`, public interactive token link `/decide/:token`, WhatsApp authorization, digital signature capture, and safety warning acknowledgements.
- **Absent:** Physical counter interaction or phone authorization only. `/customer/*` shell and `/decide/:token` disabled.
- **Responsibility Migration:** Capturing customer consent migrates to `BRANCH_MANAGER` / Counter Staff.
- **Workflow Transformation:** Decision requests transition directly `PENDING -> RESOLVED` upon counter recording.
- **Surface Migration:** Interactive "Physical Counter Approval & Signature Pad" appears inside `/branch/approvals`.

### SD-09: Financial Accounting & Settlement Engine (`FINANCE_CORE`)
- **Enabled:** Full internal financial ledger (`RunningInvoice`, `Invoice`, `Payment`, `DiscountRequest`, `RefundRequest`, `PriceCatalogEntry`, accounts receivable tracking, `/branch/payments/:id`).
- **Absent / Externalized:** External accounting software (QuickBooks, Xero, ERP) owns financials. State `PAYMENT_PENDING` removed. Transition bypasses directly `IN_PROGRESS -> READY_FOR_DELIVERY`.
- **Gate Transformation:** Gate `payment.settled_or_policy_allows` dropped.
- **Surface Migration:** Payment modal `/branch/payments/:id` removed. Delivery page `/branch/delivery` replaces balance collection form with an "External Voucher / Receipt #" input.

### SD-10: Regulatory Fiscal Billing & Tax Clearance (`REGULATORY_BILLING`)
- **Enabled:** Legal `BillingDocument`, cryptographic QR codes (ZATCA), electronic clearance, credit note sequences. Gate `invoice.issued`.
- **Absent / Externalized:** Commercial receipts or external fiscal hardware. Gate `invoice.issued` dropped or satisfied by external invoice reference string.

### SD-11: Front-Office Service Advisory Specialization (`SERVICE_ADVISORY_DESK`)
- **Enabled:** Dedicated Front-Office Service Advisor / Reception desk for customer greeting, walk-around inspections, and quote generation before technician assignment.
- **Absent:** Technician-led mobile check-in (e.g. mobile van or lean 2-bay shop).
- **Surface Migration:** Intake page `/branch/intake` migrates as a streamlined "Quick Check-in" card into `TechnicianShell` (`/tech`).

### SD-12: Operational Business Intelligence Surface (`ANALYTICS_SURFACE`)
- **Enabled:** Dedicated `DATA_ANALYST` role, `/analyst/*` shell with 7 dedicated pages, custom saved views, scheduled CSV exports.
- **Absent:** Role `DATA_ANALYST` and `/analyst/*` shell removed.
- **Surface Migration:** Operational health, technician efficiency, and margin tiles migrate directly into `OwnerHome` (`/owner/home`) and `BranchAttentionCenter` (`/branch/attention`).

---

## 3. Four-Tier Classification Matrix

| Key | Classification | Mechanics |
| :--- | :--- | :--- |
| `MULTI_BRANCH` | **STRUCTURAL DECISION** | Modifies organization hierarchy, branch scopes, and site roles |
| `INVENTORY` | **STRUCTURAL DECISION** | Modifies roles (`INVENTORY_MANAGER`), surfaces, and `PART_REQUEST_GRAPH` |
| `MULTI_WAREHOUSE` | **STRUCTURAL DECISION** | Modifies transfer workflows and warehouse access topology |
| `TECHNICAL_INSPECTION` | **STRUCTURAL DECISION** | Modifies work order diagnostic state and authorization gate |
| `TEAMS` | **STRUCTURAL DECISION** | Modifies supervisory roles (`TEAM_LEADER`), teams, and `/team-leader/*` |
| `TEAM_REVIEW` | **STRUCTURAL DECISION** | Modifies work order review state and peer sign-off |
| `QC` | **STRUCTURAL DECISION** | Modifies work order QC states, rework loops, and inspection gates |
| `CUSTOMER_PORTAL` | **STRUCTURAL DECISION** | Modifies digital approval lifecycles and customer portal surfaces |
| `FINANCE_CORE` | **STRUCTURAL DECISION** | Modifies payment pending state, settlement gates, and invoicing mode |
| `BILLING` | **STRUCTURAL DECISION** | Modifies legal tax billing documents and tax clearance lifecycles |
| `SERVICE_ADVISORY` | **STRUCTURAL DECISION** | Modifies reception desk separation vs floor check-in |
| `ANALYTICS_STUDIO` | **STRUCTURAL DECISION** | Modifies dedicated analyst role vs embedded management metrics |
| `DELIVERY_BLOCKED_UNTIL_PAID` | **OPERATIONAL POLICY** | Adjusts blocking condition of existing delivery gate (`ALWAYS`, `NEVER`, `OVERRIDE`) |
| `APPROVAL_REQUIRED_SCOPE` | **OPERATIONAL POLICY** | Governs trigger condition for findings approval (`ALL_WORK`, `BEYOND_INITIAL_SCOPE`) |
| `DECISION_WEIGHT` | **OPERATIONAL POLICY** | Governs visual weight of customer decision items (`SINGLE_WEIGHT`, `TWO_TIER`) |
| `QC_MANDATORY` | **OPERATIONAL POLICY** | Governs whether all jobs or only risk-flagged jobs enter QC (`MANDATORY_ALWAYS`, `RISK_FLAGGED`) |
| `DIRECT_PART_PURCHASE` | **OPERATIONAL POLICY** | Governs when spot buys are permitted (`NEVER`, `ONLY_IF_OUT_OF_STOCK`, `ALWAYS`) |
| `CUSTOMER_SUPPLIED_PARTS` | **OPERATIONAL POLICY** | Governs whether customer parts are accepted, refused, or waiver-conditioned |
| `TECHNICIAN_DIRECT_SEND` | **OPERATIONAL POLICY** | Governs whether technician can bypass review when `TEAM_REVIEW` is enabled |
| `RETURN_UNUSED_BEFORE_FINISH` | **OPERATIONAL POLICY** | Governs whether unused parts block finish or trigger warning |
| `maxBranches`, `maxWarehouses` | **COMMERCIAL ENTITLEMENT** | Subscription plan quotas enforced at provisioning |
| `allowedCategories` | **COMMERCIAL ENTITLEMENT** | Permitted vehicle categories (`CARS`, `MOTORCYCLES`, etc.) |
| `allowedExports` | **COMMERCIAL ENTITLEMENT** | Permitted analytical CSV export categories |
| `SpecializationDefinition` | **DOMAIN DEFINITION** | Technical service cards, inspection forms, measurement units |
| `CustomFieldDefinition` | **DOMAIN DEFINITION** | Workshop-authored form field schemas |
| `PriceCatalogEntry` | **DOMAIN DEFINITION** | Price master records for standard labor and parts |

---

## 4. Discovered Responsibility & Surface Migrations

```
+-------------------------------------------------------------------------------------------------------------+
| Absent Role / Component     | Destination Host Role         | Migrated Surface & Functionality              |
+-------------------------------------------------------------------------------------------------------------+
| Storekeeper (No Inventory)  | Branch Manager / Owner        | WorkOrderWorkspace: Direct Procurement Panel |
| Team Leader (No Teams)      | Branch Manager                | BranchShell: Operations Floor & Roster        |
| QC Inspector (No QC)        | Branch Manager                | DeliveryPage: Vehicle Release Checklist       |
| Customer Portal (No Portal) | Counter Staff / Reception     | ApprovalsPage: Counter Decision & Signature   |
| Branch Manager (Solo Shop)  | Tenant Owner (Sole Operator)  | OwnerShell: Operations & Workspace Rail       |
| Data Analyst (No Analyst)   | Tenant Owner / Branch Manager | OwnerHome / AttentionCenter: Pulse Widgets    |
+-------------------------------------------------------------------------------------------------------------+
```

---

## 5. Architectural Gaps in Current Codebase

1. **Responsibility Surface Disconnect:** `grantsForResponsibilities()` adds `RolePermission` entries for fallback roles, but never updates `RolePage` or `ROLE_PAGES`. An owner covering the storekeeper's duties gets database permissions but zero inventory UI surfaces.
2. **Workflow Graph Reachability Deadlock:** In `WORK_ORDER_GRAPH`, if `TEAM_REVIEW`, `QC`, and `FINANCE_CORE` are disabled, `IN_PROGRESS` has no outgoing edges. Vehicles are trapped in an uncompletable state.
3. **Static Role Shell Architecture:** Angular routes in `app.routes.ts` are divided into 8 rigid, mutually exclusive shells with hardcoded navigation arrays, preventing dynamic hosting of migrated responsibilities.
4. **Inspection-First Dogma:** Gate `inspection_completed` is declared as an unconditional core gate, forcing quick-lube and tire-fitment workshops through irrelevant diagnostic inspections.
5. **Rigid Analytical Domains:** Analytical dashboards have hardcoded tabs that render empty queries when optional subsystems (inventory, customer portal) are absent.
6. **Silent 403 Sourcing Deadlocks:** Disabling `INVENTORY` causes `PartRequestService` to throw 403, but no unified direct external part procurement flow (`provenance = 'EXTERNAL_PURCHASE'`) exists in technician/manager views.

---

## 6. System Composition Engine (ASOP) & Implementation Roadmap

The **System Composition Engine** resolves a workshop's operating model at runtime via five core protocols:
1. `WorkflowGraphSynthesizer`: Dynamically rewires lifecycle graphs to guarantee acyclic terminal reachability.
2. `GateCompositionResolver`: Drops, keeps, or substitutes gate checks based on active capabilities.
3. `ResponsibilityHarmonizer`: Maps orphaned duties to senior/peer fallback roles and provisions required authorities.
4. `DynamicNavigationResolver`: Generates dynamic shell navigation trees and mounts migrated operational surfaces.
5. `AnalyticsCompositionAdapter`: Reconfigures reporting dashboards to active operational facts.

### Phased Roadmap:
- **Sprint 4 (Layer 3A):** Graph Reachability, Gate Substitution & Responsibility Surface Mapping.
- **Sprint 5 (Layer 3B):** Adaptive Shell Navigation & Surface Migration Components.
- **Sprint 6 (Layer 3C):** Express Service Model & Adaptive Operational Intelligence.

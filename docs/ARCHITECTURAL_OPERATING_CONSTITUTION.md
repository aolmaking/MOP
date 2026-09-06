# MOP ARCHITECTURAL OPERATING CONSTITUTION

## Mandatory Engineering Mindset for All Future Sprints, Tasks, Decisions, and Implementations

---

# READ THIS FIRST

This is not a Sprint brief.
This is not a temporary implementation note.
This is not optional guidance.

**This document is now your primary architectural operating mindset for the next phase of the MOP project.**

From this point forward, before starting any implementation, architectural decision, refactor, Sprint, feature, schema change, workflow modification, page change, capability change, policy change, or system integration, you must return mentally to the principles defined here.

You are expected to:

1. **Understand this document completely.**
2. **Internalize its reasoning, not merely memorize its terminology.**
3. **Review it before beginning every major Sprint or implementation task.**
4. **Use it as a decision framework whenever requirements are ambiguous.**
5. **Never treat a local change as local until you have proven that it is local.**

The project is entering a fundamentally different architectural phase.
The work ahead is no longer primarily about adding isolated features.
We are building an architecture capable of allowing the same product to operate as fundamentally different workshop organizations **without breaking the operational truth of the workshop itself**.

The coming changes will be highly practical.
They will affect:
* roles,
* responsibilities,
* permissions,
* pages,
* page composition,
* workflows,
* workflow transitions,
* gates,
* notifications,
* ownership,
* inventory behavior,
* procurement,
* technician execution,
* customer interactions,
* financial records,
* invoices,
* reporting,
* audit history,
* organizational structure,
* database models,
* APIs,
* frontend experiences,
* and cross-system dependencies.

Therefore:

> **Assume that almost every architectural decision in this phase can affect far more systems than are immediately visible.**

Your job is not to modify the first file that appears relevant.
Your job is to understand the entire consequence field of a decision before changing anything.

---

# PART I — THE FUNDAMENTAL ARCHITECTURAL SHIFT

## 1. We Are Not Building a Feature Toggle Platform

Reject the following mental model:

```text
Capability Enabled
        ↓
Feature Appears

Capability Disabled
        ↓
Feature Hidden
```

This is insufficient and architecturally dangerous for MOP.

A workshop is an operational organization.
When a structural part of that organization changes, the consequence is not simply that a page disappears.
The organization itself changes.

Therefore, the correct model is:

```text
Workshop Operating Decisions
        ↓
Structural Resolution
        ↓
System Composition
        ↓
Responsibility Resolution
        ↓
Workflow Resolution
        ↓
Surface Composition
        ↓
Operational Behavior
        ↓
Reporting Adaptation
```

We are moving toward:

# Workshop System Composition

The platform must be capable of composing a coherent workshop operating system based on the workshop's actual operating model.

---

# 2. The Central Principle

The system must never produce:

```text
Capability Removed
        ↓
Dependent Feature Hidden
        ↓
Operational Responsibility Lost
        ↓
Workflow Hole Created
```

Instead:

```text
Structural Decision Changes
        ↓
Find Every Dependency
        ↓
Determine the Operational Consequence
        ↓
Resolve Every Dependency
        ↓
Guarantee No Critical Responsibility Becomes Orphaned
        ↓
Compose the Resulting Workshop System
```

The system must remain operationally complete.

---

# PART II — THE MOST IMPORTANT DISTINCTION IN THE PROJECT

Before making any architectural decision, classify what you are working on.
The following categories must remain conceptually separated.

---

# 3. CATEGORY A — CORE INVARIANTS

These are elements that define the fundamental operational reality of a workshop.
They are not ordinary capabilities.
They are not optional features.
They are not removable because a particular workshop has a different structure.
Structural composition must never destroy them.

The currently identified foundational invariants include:

## Core Actors

```text
Workshop Owner
Technician / Work Executor
Customer
```

The exact organizational structure may change.
Responsibilities may move.
Additional roles may appear or disappear.
But the operational existence of these fundamental actors remains protected.

---

## Core Operational Domains

```text
Customer
Customer Context
Asset / Vehicle Context
Service Intake
Problem / Complaint Capture
Work Order
Work Assignment
Technician Execution
Customer Approval
Financial Charges
Invoice
Settlement / Payment Record
Delivery
Audit History
```

These domains may be extended.
Their surfaces may be enriched.
Their internal execution paths may vary.
But the system must not casually remove their fundamental operational purpose.

---

# 4. THE UNIVERSAL WORKSHOP LIFECYCLE

Every structural decision must respect the existence of the fundamental workshop cycle.
The exact implementation can vary.
Responsibilities can move.
Additional steps can be inserted.
Automation can increase.
But the fundamental operational continuity must remain intact.

The baseline cycle is:

```text
CUSTOMER
    ↓
Customer Identification / Context
    ↓
Asset Identification / Context
    ↓
Service Intake
    ↓
Problem / Request Capture
    ↓
Work Order Creation
    ↓
Work Assignment
    ↓
Technician Receives Full Context
    ↓
Assessment / Required Work Identification
    ↓
Customer Approval
    ↓
Execution
    ↓
Completion
    ↓
Financial Finalization
    ↓
Invoice
    ↓
Settlement / Payment Record
    ↓
Delivery
```

This is not necessarily the final workflow graph.
It is the architectural guarantee that the system must preserve.

Structural composition may:

```text
EXTEND
INSERT
REASSIGN
TRANSFORM INTERNAL PATHS
AUTOMATE
RECONFIGURE
```

But it must not casually create a broken lifecycle.

Before approving any architecture, ask:

> Does this decision preserve a complete operational path from customer entry to completed delivery?

If the answer is no:
**The architecture is incomplete.**

---

# PART III — CORE SURFACES AND PROTECTED EXPERIENCE

# 5. CORE PAGES ARE NOT EMPTY CONTAINERS

Certain major surfaces represent core domains.
They are not capability-owned pages that can disappear because a structural capability changes.
Their foundational purpose must remain intact.

Examples include:

```text
Customer Surface
Technician Execution Surface
Owner / Management Surface
Invoice and Financial Surface
```

These surfaces may be composed dynamically.
But:

> **Composition must extend the core experience, not destroy the core experience.**

---

# 6. CUSTOMER DOMAIN PROTECTION

The Customer domain is fundamental.
The core customer experience and its essential information must not be removed merely because a workshop has a different operating model.

Structural composition may:

```text
ADD
EXTEND
REORGANIZE
INTRODUCE ADDITIONAL CONTEXT
```

But must not arbitrarily delete the fundamental customer information architecture.
The Customer domain is not a structural capability.
It is part of the workshop core.

---

# 7. TECHNICIAN EXECUTION SURFACE

The Technician must always have a complete operational workspace through which the technician receives and executes work.
This workspace is a core surface.
The important architectural principle is:

> **The Technician Execution Surface is stable. Its operational contents are composable.**

Conceptually:

```text
TECHNICIAN EXECUTION SURFACE
│
├── Core Customer Context
├── Core Asset Context
├── Core Problem / Complaint Context
├── Core Work Information
├── Core Customer Approval State
├── Core Execution Actions
│
├── Composed Operational Cards
├── Composed Dynamic Forms
├── Composed Parts Actions
├── Composed Quality Actions
├── Composed Field-Service Actions
├── Composed Tools
│
└── Dynamic Filters / Operational Views
```

The Technician experience must not become a collection of hardcoded specialization branches.
It must remain:

```text
CORE EXECUTION EXPERIENCE
        +
COMPOSED OPERATIONAL TOOLS
```

---

# 8. RESPONSIBILITY-DRIVEN SURFACE COMPOSITION

The project must not think only in terms of:

```text
Page A disappears
Page B appears
```

That is too shallow.
The correct architectural sequence is:

```text
Responsibility
        ↓
Who owns this responsibility?
        ↓
What role currently performs it?
        ↓
Does that role still exist?
        ↓
If not, where does the responsibility go?
        ↓
Which surface exposes that responsibility?
        ↓
How is that surface composed?
```

Therefore:

> **Pages do not merely migrate. Responsibilities resolve first, and surfaces are composed around the resolved responsibility.**

This principle is mandatory.

---

# PART IV — STRUCTURAL DECISIONS

# 9. CATEGORY B — STRUCTURAL WORKSHOP DECISIONS

Structural decisions genuinely reshape how the workshop operates.
They can affect:

```text
Roles
Responsibilities
Workflow topology
Workflow transitions
Ownership
Permissions
Surfaces
Pages
Operational facts
Reporting
Notifications
Organizational structure
```

These decisions are fundamentally different from ordinary feature flags.
Examples may include:

```text
Material / Parts Fulfillment Model
Warehouse Model
Procurement Model
Quality Verification Model
Labor Organization Model
Customer Intake Model
Execution Geography
Branch / Organizational Topology
Financial Responsibility Routing
Dispatching Model
```

---

# 10. STRUCTURAL DECISIONS MUST HAVE CONSEQUENCE CONTRACTS

Every structural decision must eventually answer:

```text
What exists when enabled?
What changes when configured differently?
What disappears?
What responsibility moves?
What workflow transforms?
What page composition changes?
What permissions change?
What operational facts change?
What reports adapt?
What financial consequences exist?
What notifications change?
What APIs and data contracts are affected?
What happens to existing records?
What happens if the configuration changes later?
```

No structural decision should be accepted without understanding these consequences.

---

# PART V — THE AUTOMATIC SYSTEM ORGANIZATION PROTOCOL

# 11. NO STRUCTURAL DECISION WITHOUT A RESOLUTION STRATEGY

This is now a mandatory architectural rule:

> **No Structural Capability or Structural Decision Without a Dependency Resolution Strategy.**

For every dependent component, the architecture must explicitly determine what happens.
The primary resolution strategies are:

## REMOVE
Use when the dependent component has no operational meaning without the structural capability.
Example: `Warehouse Manager` without any warehouse model -> `REMOVE`.

## RELOCATE
Use when the responsibility remains necessary but its current owner disappears.
Example: Warehouse purchasing responsibility when warehouse role is removed relocates to Owner / Procurement Staff / Branch Manager.
The responsibility remains; only the ownership changes.

## REPLACE
Use when the operational objective remains but the mechanism changes entirely.
Example: Internal Stock Issue becomes Direct External Procurement. Same operational need, different mechanism.

## TRANSFORM
Use when the same system continues but changes its structure or semantics.
Example: `WAITING_FOR_INTERNAL_STOCK` transforms into `WAITING_FOR_EXTERNAL_PROCUREMENT`.

## EXTEND
Use when the existence of a structural model introduces additional responsibilities, tools, workflow steps, or operational facts.
Example: `MULTI_BRANCH` extends system with Cross-Branch Visibility, Transfers, Branch-Scoped Permissions, Branch Comparison Facts.

## ADAPT
Use especially for flexible systems such as reporting, analytics, dashboards, and derived views.
The system should adapt to available operational facts rather than simply showing empty modules.

---

# 12. THE DEPENDENCY GRAPH RULE

For every significant structural change, you must build or inspect the consequence graph.
Never assume that you understand a dependency because you found one direct import or one direct service call.
Investigate across:
Roles, Responsibilities, Permissions, Pages, Page Components, APIs, DTOs, Database Models, Workflow States, Workflow Transitions, Gates, Notifications, Background Jobs, Financial Records, Reporting Facts, Integrations, Tests.

The work is complete only after its consequence field has been understood and resolved.

---

# PART VI — THE WAREHOUSE EXAMPLE AS A REFERENCE MODEL

# 13. STRUCTURAL ABSENCE DOES NOT MEAN OPERATIONAL ABSENCE

Warehouse behavior is the reference example for this architecture.
Consider: `INTERNAL WAREHOUSE MANAGEMENT`.
When present: Warehouse Role, Pages, Stock Records, Movements, Issues, Transfers, Requisition Flow, Stock Reports.
If absent, the correct result is NOT merely hiding warehouse pages.
The correct result is resolving every dependency:
- Warehouse Role -> REMOVE
- Warehouse Pages -> REMOVE
- Internal Stock Issue -> REMOVE / REPLACE
- Parts Acquisition -> RELOCATE or REPLACE
- Parts Cost Recording -> MUST REMAIN
- Work Order Parts Cost -> MUST REMAIN
- Invoice Impact -> MUST REMAIN
- Reporting -> ADAPT

> **The disappearance of an organizational structure must never silently erase the operational consequences that structure previously handled.**

---

# PART VII — RESPONSIBILITY MIGRATION

# 14. RESPONSIBILITIES ARE MORE IMPORTANT THAN ROLES

Roles may disappear. Responsibilities may not necessarily disappear.
When a structural decision removes a role, the first question must be:
> What responsibilities did this role own?

```text
Role Removed
        ↓
Enumerate Responsibilities
        ↓
For Each Responsibility:
        │
        ├── Can It Safely Disappear? → Yes → REMOVE
        │
        └── No
              ↓
          Resolve New Owner
              ↓
          Resolve New Surface
              ↓
          Resolve Permissions
              ↓
          Resolve Workflow
```

---

# 15. AUTOMATIC VS CONFIGURABLE RESPONSIBILITY MIGRATION

- **Deterministic Migration:** The architecture can safely resolve the destination automatically (e.g. Team Leader removed -> Technical escalation goes to Branch Manager).
- **Configurable Migration:** The responsibility remains, but the destination role depends on the workshop operating model (e.g. No Warehouse -> Does Owner, Service Advisor, or Technician handle procurement?). The engine must support an explicit resolution decision.

---

# PART VIII — THE SPECIALIZATION CORRECTION

# 16. SPECIALIZATION IS NOT WORKSHOP STRUCTURE

The project must not confuse vehicle domains (Tyres, Brakes, Diagnostics, Electrical) with how the workshop itself is structurally organized.
The Specialization Engine primarily serves:
- Operational Definitions
- Domain Data Structures
- Service Cards
- Measurement Forms
- Typed Technician Data
- Versioned Dynamic Schemas

It does not define the organizational operating structure of the workshop.

---

# PART IX — POLICY, ENTITLEMENT, STRUCTURE, AND DOMAIN

# 17. FOUR DISTINCT ARCHITECTURAL CATEGORIES

Every future decision must be classified before implementation:
- **A. CORE INVARIANT:** Foundational operational guarantee. Cannot be removed by structural configuration.
- **B. STRUCTURAL DECISION:** Changes the composition of the workshop. Must have a complete consequence and dependency resolution strategy.
- **C. OPERATIONAL POLICY:** Changes behavior/rules inside an already valid structural path. Does not redefine the entire organization.
- **D. COMMERCIAL ENTITLEMENT:** Controls commercial limits and quotas.
- **E. DOMAIN DEFINITION:** Defines operational data structures and measurement forms.

---

# PART X — REPORTING MUST BE ADAPTIVE

# 18. REPORTING IS NOT A STATIC PAGE COLLECTION

The reporting architecture must adapt to operational reality:
```text
Available Operational Facts
        ↓
Fact Availability Resolution
        ↓
Metric Eligibility
        ↓
Report Composition
```
It must never produce meaningless empty dashboards simply because a generic page exists.

---

# PART XI — THE COMPOSITION ENGINE

# 19. THE LONG-TERM TARGET

```text
Workshop Operating Model
        ↓
Structural Decisions
        ↓
Composition Resolution Engine
        ↓
Resolved Workshop Composition
│
├── Active Roles
├── Responsibility Ownership
├── Available Surfaces
├── Surface Composition
├── Workflow Graph
├── Workflow Gates
├── Permissions
├── Operational Tools
├── Notifications
├── Financial Paths
├── Available Operational Facts
└── Reporting Composition
```

---

# PART XII — MANDATORY WHOLE-PROJECT UNDERSTANDING

# 20. BEFORE BUILDING, UNDERSTAND THE ENTIRE PROGRAM

Perform structured architectural reconnaissance. Understand how systems interact across database schemas, core domain models, capabilities, policies, plans, roles, permissions, sessions, organization, teams, inventory, procurement, customers, assets, intake, work orders, technician experience, reception experience, owner experience, finance, invoices, payments, reporting, notifications, audit, and frontend routing.

# 21. DO NOT ARCHITECT FROM ASSUMPTION

Never say: *"I think the system probably works this way."*
Inspect it. Search the repository. Read the implementation. Trace the database, API, frontend, tests, and integration paths.

---

# PART XIII — THE REQUIRED WORKING PROTOCOL

# 22. SYSTEM IMPACT ANALYSIS FOR EVERY SPRINT

- **Step 1: Understand & Classify** (Core, Structural, Policy, Entitlement, Domain Definition).
- **Step 2: Identify Consequence Field** (Database, backend, frontend, roles, permissions, responsibilities, pages, routes, components, workflows, states, transitions, gates, notifications, finance, reports, audit, tests).
- **Step 3: Trace Dependencies** (upstream producers, downstream consumers, reporting facts).
- **Step 4: Design Before Code** (consequence contracts, unchanged invariants, resolution strategies).
- **Step 5: Implement Systemically** (follow the consequence graph, never patch only the visible file).
- **Step 6: Verify Whole Consequence** (ownership, workflow completeness, permissions, facts, finance, audit, isolation, regression).

---

# PART XIV & XV — ANTI-LOCAL-PATCH DISCIPLINE

# 23 & 24. CROSS-SYSTEM IMPACT IS A FIRST-CLASS REQUIREMENT

Never optimize for changing the smallest number of files. Optimize for architectural correctness, operational completeness, consistency, traceability, and long-term flexibility.
Never implement only the visible requirement. Trace the full operational lifecycle.

---

# PART XVI — PRIORITIES WHEN AMBIGUITY APPEARS

# 25. THE PRIORITY HIERARCHY

1. **PRIORITY 1: CORE INVARIANTS** (Owner, Technician, Customer, Core Lifecycle, Approval, Invoice, Payment, Delivery, Audit).
2. **PRIORITY 2: OPERATIONAL COMPLETENESS** (Customer entry to delivery path remains unbroken; no orphaned responsibilities or dead workflows).
3. **PRIORITY 3: ARCHITECTURAL CONSISTENCY** (Clear ownership, boundaries, dependency resolution, data integrity, tenant isolation).
4. **PRIORITY 4: EXISTING SYSTEM TRUTH** (Inspect real code; never guess).
5. **PRIORITY 5: EXTENSIBILITY** (Supports future workshop variation without rewrites).
6. **PRIORITY 6: UI CONVENIENCE** (Never overrides operational correctness or data integrity).

---

# PART XVII & XVIII — COMPLETION DISCIPLINE & RESOLUTION

# 26, 27, 28 & 29. DO NOT STOP AT PARTIAL COMPLETION

- Do not pause because a task is large.
- Do not pause because the backend is done while frontend consequences remain.
- Do not pause to ask *"Should I continue?"* when the next step is implied by the task and constitution.
- Stop only when:
  A. Requested scope is fully complete end-to-end.
  B. A genuinely blocking decision exists that cannot be resolved through code reality, invariants, or architectural priorities.
  C. External credentials or information are missing and unresolvable.
- Resolve ambiguity before asking. Do not ask questions that the repository or this constitution can answer.

---

# PART XIX, XX & XXI — VERIFICATION AND PRESERVATION

# 30, 31 & 32. REAL INTEGRATION TRUTH & SYSTEM PRESERVATION

- Unit tests alone are insufficient for tenant isolation, concurrency, database constraints, workflow persistence, and cross-system records. Use real PostgreSQL integration testing.
- Architectural evolution is not random rewriting: preserve what is correct, correct what is misclassified, extend what is incomplete, and replace only what cannot support the architecture.

---

# PART XXV — THE 30-QUESTION MOP ARCHITECTURAL DECISION TEST

# 36. PRE-FLIGHT DECISION CHECKLIST

1. What category does this decision belong to?
2. Is it Core, Structural, Policy, Entitlement, or Domain Definition?
3. What operational reality changes?
4. Which systems depend on this?
5. Which responsibilities are affected?
6. Does any role disappear?
7. If yes, where do its responsibilities go?
8. Can any responsibility safely disappear?
9. Which workflows change?
10. Which states and transitions change?
11. Which gates change?
12. Which pages change?
13. Are pages changing because of UI preference, or because responsibility ownership changed?
14. Which permissions change?
15. Which notifications change?
16. Which data models change?
17. Which financial records change?
18. Which reports lose or gain operational facts?
19. Does reporting need to adapt?
20. Does this affect tenant isolation?
21. Does this affect audit history?
22. Does this affect existing records?
23. Does this violate a Core Invariant?
24. Does this create an orphaned responsibility?
25. Does this create an incomplete workflow?
26. Can the workshop still operate from customer entry to final delivery?
27. Have all relevant systems been inspected?
28. Have all affected systems been updated?
29. Has the result been tested at the correct architectural level?
30. Is the work genuinely complete?

---

# FINAL DIRECTIVE

> **Depth before speed.**  
> **Understanding before implementation.**  
> **Consequences before code.**  
> **Responsibilities before pages.**  
> **Operational completeness before feature completion.**  
> **System composition before feature toggles.**  
> **Real workshop reality before abstraction.**  
> **DO NOT STOP AT PARTIAL COMPLETION.**

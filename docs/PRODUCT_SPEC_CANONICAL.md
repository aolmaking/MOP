# MOP — Maintenance Operations Platform: Canonical Product Specification

> **Source:** Pasted verbatim by the product owner via chat on 2026-08-07.
> **Status:** ⚠️ TRUNCATED — the source message hit a 50,000-character limit and cuts off mid-sentence inside "ACCEPTANCE TEST — FULL BUSINESS FLOW", at step 18 ("Technician marks used."). Everything after that point (remaining acceptance-test steps, and any sections that may have followed) was never received. **This document should be extended once the rest of the spec is provided** — do not treat the Acceptance Test section as complete.
> **Purpose:** This is the authoritative business/product specification for MOP, distinct from the various `v*-*.md` build-log docs and `*_REPORT.md` self-audit docs elsewhere in this folder, which describe what was built/checked at a point in time. Where those docs conflict with this one, this spec is the source of truth for *intent*; the other docs describe *current implementation state* (see `GAP_ANALYSIS_CANONICAL_SPEC.md` once produced for the diff between the two).

---

You are building MOP: Maintenance Operations Platform.

MOP is a multi-tenant SaaS platform for managing maintenance/service workshops.

This is not a single workshop website.
This is one platform that manages many different workshops/companies.

Each workshop is a separate tenant.
Each tenant has its own:
- owner
- staff
- customers
- branches
- warehouses
- assets
- work orders
- inventory
- invoices
- reports
- permissions
- workflows
- UI customization
- branding/theme
- page layouts
- message templates
- pricing rules

The same application opens different pages depending on who logs in.

A Platform Super Admin logs in and sees platform-level pages.
A workshop owner logs in and sees only their workshop.
A technician logs in and sees only technician pages for their assigned work.
A customer logs in and sees only their own assets/service/invoices.
No user should see data from another workshop or another role.

## CORE PRODUCT IDEA

MOP manages the full maintenance cycle:

1. Customer / asset intake
2. Work Order creation
3. Technician assignment
4. Quick Inspection / Full Inspection
5. Faults / diagnostic codes / findings
6. Services, parts, and labor recommendation
7. Customer approval
8. Parts request and inventory issue
9. Technician execution
10. Used parts / returned parts
11. Finish gate
12. Team review / QC if enabled
13. Final invoice
14. Payment
15. Delivery
16. Reports and audit

The system must not be a set of disconnected pages.
Every action must update the correct role pages, reports, timelines, invoice, inventory, audit, and workflow status.

## MULTI-TENANT RULE

Every tenant/workshop is isolated.

Every tenant-owned record must include tenant_id:
- users
- customers
- assets
- work orders
- tasks
- inventory items
- warehouses
- stock balances
- part requests
- invoices
- payments
- reports
- builder configuration
- permission configuration
- audit logs

A user from Workshop A must never see Workshop B data.

Do not filter tenant data only on the frontend.
Tenant isolation must exist in the data/query/action layer.

## LOGIN AND AUTH MODEL

MOP has these account types:

1. Platform Account
Used by Platform Super Admin.
Not tied to one workshop.

2. Tenant Staff Account
Used by:
- Tenant Owner
- Tenant Admin
- Branch Manager
- Technician
- Inventory Manager
- Team Leader
- Data Analyst

3. Customer Account
Used by workshop customers.

4. System Automation Identity
No login UI. Used for system-generated events.

Public registration is CUSTOMER ONLY.

Customer registration must resolve a workshop context by:
- workshop code
- invite link
- branch QR/link
- workshop-specific portal URL

No floating customer account without a workshop.

Owner registration is not public.
Owner is created only by Platform Super Admin from Add Workshop Owner page.

Staff registration is not public.
Staff is created only by Tenant Owner / Tenant Admin from Organization & Access.

Platform users are separate from tenant staff.

## SESSION CONTEXT

After login, the app must resolve:

- account type
- tenant_id if applicable
- role
- branch scope
- warehouse scope
- category scope
- team scope
- managed technician scope if Team Leader
- effective permissions
- enabled modules
- enabled features
- tenant status
- platform controls
- builder/theme configuration
- role experience configuration

The user must then be redirected to the correct landing page.

Landing pages:
- Platform Super Admin → Platform Workshops / Platform Home
- Tenant Owner / Tenant Admin → Owner Home
- Branch Manager → Branch Home / Attention Center
- Technician → Technician Home
- Inventory Manager → Inventory Home
- Team Leader → Team Leader Home
- Data Analyst → Analytics Home
- Customer → Customer Portal

No fake role switcher.
No manual role dropdown for real login.

## EFFECTIVE PERMISSION RESOLVER

Every route, action, and data request must use an effective permission resolver.

Permission order:

1. Platform Super Admin Control
2. Tenant Entitlement / Plan
3. Tenant Status
4. Module Enabled
5. Feature Enabled
6. Owner Configuration
7. Role Permission Template
8. User Override
9. User Scope
10. Workflow Status
11. Record-Level Rule

Lower layers cannot override higher layers.

If Super Admin disables Inventory, Owner cannot re-enable it.
If tenant is frozen, no staff/customer action is allowed.
If user is outside branch scope, they cannot see that branch data.
If customer owns only one asset, they cannot see another customer asset.

Do not only hide buttons.
Every action must be guarded.

## OPERATING CATEGORIES

MOP supports different workshop categories:

1. Cars
Primary identifier: Plate Number
Secondary identifier: VIN / Chassis
Examples:
- oil service
- brake service
- battery
- tires
- AC
- computer diagnostics

2. Motorcycles
Primary identifier: Plate Number
Secondary: Chassis / Engine Number
Examples:
- chain/sprocket
- oil
- brake
- spark plug
- clutch
- quick checklist

3. Heavy / Agricultural Equipment
Primary identifier: Serial Number / Equipment ID
Important fields:
- hour meter
- site
- fleet
- operator
- safety lockout
- hydraulic systems
- field service

Category selection is not a public pre-login choice.
The system resolves category from tenant settings, asset, assigned task, or user scope.

## CORE WORK ORDER LIFECYCLE

Work Order statuses:

- Draft
- Registered
- Under Inspection
- Awaiting Customer Approval
- Approved for Work
- In Progress
- Waiting Parts
- Waiting Customer
- Blocked
- Ready for Team Review
- Ready for QC
- QC Failed
- Ready for Delivery
- Payment Pending
- Closed
- Cancelled

One Work Order = one asset.

If the same issue returns after closure, create a new linked Work Order.
Do not reopen old closed Work Orders silently.

## PLATFORM SUPER ADMIN ROLE

The Platform Super Admin owns the MOP platform.
They manage the workshops that bought/subscribe to MOP.

They do not operate inside the workshop as technician/cashier/inventory manager by default.

Super Admin pages:

1. Workshops
2. Add Workshop Owner
3. Platform Reports
4. Workshop Live View
5. Super Admin Control Center

### PAGE: Workshops

Purpose:
Show all workshops/companies using MOP.

Content:
- Workshop name
- Owner name
- Owner email/phone
- Status: Active / Trial / Pending Setup / Frozen / Suspended / Read-only / Archived
- Plan/package
- Branch count
- User count
- Active Work Orders count
- Last activity
- Subscription/payment status
- Builder customization status
- Health status

Actions:
- Open Details
- Open Reports
- Open Live View
- Open Control Center
- Freeze Workshop
- Reactivate Workshop

Workshop details drawer:
- workshop basic info
- owner info
- plan info
- branches
- users summary
- enabled modules
- last login
- recent activity
- recent platform controls
- subscription snapshot
- health warnings

Freeze/reactivate must require reason and audit.

### PAGE: Add Workshop Owner

Purpose:
Create a new workshop tenant and its owner.

Fields:
- Workshop / Company Name
- Owner Full Name
- Owner Email
- Owner Phone
- Country
- City
- Business Type
- Initial Operating Category
- Initial Plan / Package
- Allowed Branches
- Allowed Users
- Allowed Warehouses
- Starter Builder Template
- Enable Demo Data
- Initial Status: Active / Trial / Pending Setup

On submit:
- create tenant/workshop
- create owner account
- assign Tenant Owner role
- assign default owner permissions
- apply plan
- enable allowed modules/features
- apply starter builder template
- create default role templates
- create default permission matrix
- create platform audit event
- add workshop to Workshops page
- add workshop to Platform Reports
- add workshop to Live View

Do not allow partial creation.
Either all related records are created or none.

### PAGE: Platform Reports

Purpose:
Show platform-level business reports about workshops using MOP.

This is not the workshop's internal daily report page.

First-level workshop cards:
- Workshop name
- Usage score
- Feature adoption
- Last activity
- Subscription status
- Health risk
- Builder adoption
- Active users

Detailed reports:

**A. Usage Overview**
- active users
- daily/weekly active users
- owner last login
- staff last activity
- customer portal usage

**B. Feature Usage**
- technician work card usage
- customer decision requests
- inventory requests
- parts used/returned
- quick inspection usage
- quick service usage
- builder usage
- reports usage
- team leader usage
- finance usage

**C. Builder Adoption**
- theme customized
- pages customized
- forms customized
- messages customized
- last publish
- rollback count
- validation failures
- high-risk changes

**D. Operational Activity**
- work orders created/completed
- active tasks
- waiting customer
- waiting parts
- blockers
- inventory movements
- payments recorded
- invoices issued

**E. Commercial Snapshot**
- plan
- subscription status
- paid/unpaid
- renewal date
- overdue amount placeholder
- MRR/revenue placeholder

**F. Health & Risk**
- owner inactivity
- low staff usage
- failed logins
- builder validation errors
- payment risk
- frozen/suspension history
- low feature adoption

Platform reports should be aggregated by default.
Do not expose unnecessary customer private data.

### PAGE: Workshop Live View

Purpose:
Let Platform Super Admin open any workshop and see the current actual pages with that workshop's design/configuration.

Live View must use:
- selected tenant_id
- selected role/persona
- tenant builder config
- tenant theme
- tenant permissions
- enabled modules/features
- current data or demo data

Role views:
- Owner / Tenant Admin
- Branch Manager
- Technician
- Inventory Manager
- Team Leader
- Customer Portal
- Data Analyst

Important:
Live View is read-only by default.
It is not impersonation.
It is not normal login.
It must not mutate tenant data.

Banner:
"Platform Live View — Read-only"

If an action is clicked:
"This action is disabled in Platform Live View."

Log every live view session:
- platform admin
- workshop
- role viewed
- persona/user viewed
- start time
- end time
- mode = read_only

### PAGE: Super Admin Control Center

Purpose:
Highest-level platform control plane.

Flow:
Select Target
→ Choose Control
→ Impact Preview
→ Confirm with Reason
→ Apply
→ Audit
→ Rollback if possible

Layout:

Top:
- Target selector
- selected workshop status
- current plan
- current risk
- last control change

Left nav:
- Overview
- Tenant Status
- Modules
- Features
- Roles
- Builder
- Access & Accounts
- Limits & Entitlements
- Reports
- Finance
- Emergency
- Audit & Rollback

Right panel — Impact Preview:
- affected users
- affected roles
- affected pages
- affected modules
- can tenant override?
- risk level
- rollback available?

**Controls:**

Tenant Status:
- Active
- Trial
- Pending Setup
- Frozen
- Suspended
- Read-only
- Archived

Freeze Workshop:
- blocks owner login
- blocks staff login
- blocks customer portal
- blocks decision links
- revokes sessions
- preserves data
- keeps Platform Live View available read-only
- creates audit event

Module Control:
- Customer Portal
- Technician Workspace
- Inventory Management
- Branch Management
- Team Leader Module
- Workshop Builder
- Reports
- Finance
- Multi-Branch
- Multi-Warehouse

Feature Control:
- Quick Inspection
- Quick Service
- Computer Codes
- Customer Decision Requests
- WhatsApp Decision Links
- Critical Warning Acknowledgement
- Part Request Lifecycle
- Return Unused
- Builder Publishing
- Custom Fields
- Message Templates
- Report Export
- Finance Payments
- Refunds

Role Control:
- Tenant Owner
- Tenant Admin
- Branch Manager
- Technician
- Inventory Manager
- Team Leader
- Customer
- Data Analyst

Role states:
- Enabled
- Disabled
- Read-only
- Login Locked
- Actions Limited

Builder Control:
- Fully Enabled
- View Only
- Draft Only
- Brand Only
- Publishing Locked
- Fully Locked

Access & Accounts:
- Lock Owner Account
- Unlock Owner Account
- Change Workshop Owner
- Revoke All Sessions
- Suspend All Staff
- Restore Staff Access
- Disable Customer Portal Access
- Reset Invite placeholder

Limits & Entitlements:
- Max Branches
- Max Users
- Max Warehouses
- Allowed Categories
- Allowed Modules
- Allowed Reports
- Allowed Builder Features
- Allowed Exports
- Allowed Finance Features

Reports Control:
- Enable/disable reports
- advanced reports
- exports
- financial reports
- inventory value reports
- user performance reports
- lock report permissions

Finance Control:
- enable/disable finance
- invoice generation
- payment recording
- refunds
- financial reports
- payment methods
- force finance read-only

Emergency:
- Freeze Workshop Immediately
- Force Logout All Users
- Disable Customer Portal
- Disable Decision Links
- Lock Builder Publishing
- Set Workshop Read-only
- Suspend Staff
- Lock Owner
- Disable External Access

High-risk actions require:
- reason
- double confirmation
- impact preview
- audit
- rollback path

Super Admin cannot silently:
- complete technician tasks
- mark parts used
- issue stock
- approve customer decisions
- record customer payments
- edit invoices silently
- change customer service history
- delete operational records

## TENANT OWNER / TENANT ADMIN ROLE

The Owner owns one workshop tenant inside MOP.
Owner can fully control their workshop within platform limits.

Owner pages:

1. Owner Home
2. Organization & Access
3. Configuration & Permissions
4. Workshop Builder
5. Page Builder
6. Role Experience Studio
7. Workflow & Feature Studio
8. Forms & Fields
9. Messages & Templates
10. Pricing & Financial Configuration
11. Reports & Analytics
12. Audit & Change History
13. Publish Center / Impact Preview

### PAGE: Owner Home

Purpose:
High-level control and health view of the workshop.

Show:
- workshop status
- active branches
- active users
- open Work Orders
- waiting customer approvals
- waiting parts
- payment pending
- low stock
- configuration warnings
- builder draft status
- workflow health alerts
- recent changes

Cards should link to relevant pages.

### PAGE: Organization & Access

Purpose:
Manage people, branches, warehouses, and teams.

Owner can:
- add staff
- invite staff
- assign role
- assign branch scope
- assign warehouse scope
- assign category scope
- assign team scope
- create branch
- create warehouse
- link branch to warehouse
- create teams
- assign technicians to team leader
- activate/deactivate users
- lock users

Effects:
- new Technician appears in assignment flows
- Branch Manager scope filters branch pages
- Inventory Manager scope filters warehouses
- Team Leader scope filters managed technicians
- reports respect scopes

Validation:
- Inventory Manager must have at least one warehouse scope
- Branch Manager must have branch scope
- Team Leader must have managed team/technicians
- Technician must have branch/category scope if required

### PAGE: Configuration & Permissions

Purpose:
Control who can see/do what.

Tabs:
- Role Templates
- User Permissions
- Permission Matrix
- Scope Rules
- Locked by Platform
- Change History

Permission groups:
- Authentication & Access
- Customers
- Assets
- Work Orders
- Technician Tasks
- Inspection
- Customer Decisions
- Inventory
- Parts Lifecycle
- Branch Management
- Team Leader Supervision
- Reports
- Builder
- Configuration
- Finance
- Payments
- Audit

Cell states:
- Allowed
- Denied
- Inherited
- Locked by Platform
- Locked by Plan
- Not Available

Every permission change must affect:
- navigation
- routes
- buttons
- action guards
- data returned
- reports
- exports
- audit

Example:
If Owner disables customer_decision.send for Technician:
- Send button disappears/disabled in Technician Work Card
- action guard blocks direct send
- request can require Branch Manager review
- audit event created

Example:
If Owner allows Branch Manager to record payment:
- Record Payment button appears
- payment.record action guard allows it
- Customer Portal payment status updates
- Owner finance reports update

Example:
If Owner hides prices from Technicians:
- Technician Work Order POS shows "Price hidden by workshop settings"
- Customer can still see approved selling prices if enabled
- internal cost never appears

### PAGE: Workshop Builder

Purpose:
Customize workshop identity and visual theme.

Owner can customize:
- logo
- brand colors
- primary accent
- card style
- border radius
- font style
- density
- status colors
- customer portal theme
- staff theme

Use design tokens:
- tenant.theme.primaryColor
- tenant.theme.radius
- tenant.theme.density
- tenant.theme.statusColors
- tenant.theme.logo

Theme changes must apply to:
- Technician pages
- Branch Manager pages
- Inventory pages
- Team Leader pages
- Customer Portal
- Owner pages
- Reports

### PAGE: Page Builder

Purpose:
Customize actual pages using safe sections/blocks.

Owner can:
- reorder sections
- hide optional sections
- restore hidden sections
- rename section titles
- choose compact/expanded layout
- add allowed blocks
- reset page
- preview as role

Customizable pages:
- Technician Home
- Technician Work Card
- Branch Manager Home
- Work Order Workspace
- Inventory Home
- Team Leader Home
- Customer Portal Home
- Owner Dashboard
- Reports pages

Owner cannot:
- delete safety-critical sections
- remove Finish Gate
- remove Critical Warning Acknowledgement
- remove Payment Gate
- bypass permissions
- show internal blocks to customer
- inject raw HTML/JS/CSS
- access platform-locked blocks

Use a safe registry for blocks:
- allowedPages
- allowedRoles
- requiredPermissions
- requiredFeatures
- customerSafe
- internalOnly
- safetyCritical
- removable
- reorderable

### PAGE: Role Experience Studio

Purpose:
Customize each role's experience.

Owner can set:
- default landing page
- simple/advanced mode
- visible shortcuts
- navigation density
- card style
- optional widgets
- role labels

Examples:

Technician Simple Mode:
- Home
- My Work
- Work Card

Customer Minimal Mode:
- My Service
- Decisions
- Invoice
- History

Role Experience cannot override permissions.

### PAGE: Workflow & Feature Studio

Purpose:
Configure operational workflow policies.

Owner can configure:
- Quick Inspection enabled/disabled
- Quick Service enabled/disabled
- customer approval required rules
- critical rejection warning required
- Team Leader review required
- QC required
- time tracking optional/required/off
- return unused required before finish
- delivery blocked until payment
- technician can send customer request directly or needs Branch Manager review
- discount approval thresholds

Effects must apply to:
- Technician Work Card
- Branch Manager Attention Center
- Team Leader views
- Customer Portal
- Reports
- Finish Gate
- Delivery Gate

Example:
If Team Leader Review is enabled:
- Technician Finish sends task to Ready for Team Review
- Team Leader sees review queue
- Branch Manager sees status
- reports track review time

### PAGE: Forms & Fields

Purpose:
Customize forms safely.

Forms:
- Customer Intake
- Asset Registration
- Quick Inspection
- Full Inspection
- Part Request
- Return Unused
- Customer Decision Request
- Work Order
- Invoice notes

Field types:
- text
- number
- select
- checkbox
- date
- textarea
- image/file placeholder

Core fields cannot be deleted.
Custom fields can be archived, not hard deleted.
Historical values must remain available.

Field visibility:
- staff only
- customer visible
- reportable
- required/optional
- category-specific
- role-specific

Example:
Owner adds "Battery Voltage" to Quick Inspection:
- field appears in Technician form
- value is stored in Work Order history
- visible to Team Leader if allowed
- appears in reports if marked reportable
- not shown to customer unless customer-visible

### PAGE: Messages & Templates

Purpose:
Customize customer-facing and staff messages.

Owner can customize:
- WhatsApp decision message
- approval request message
- waiting parts message
- ready for delivery message
- payment pending message
- critical warning text
- invoice message
- reminder message

Required variables:
- customer_name
- work_order_id
- decision_link
- total_amount if needed
- branch_name

If required variables are missing:
- block publish
- show validation error

Changes affect:
- generated WhatsApp messages
- Customer Portal text
- Branch Manager reminders
- decision workflow

### PAGE: Pricing & Financial Configuration

Purpose:
Configure service prices and financial rules.

Owner can configure:
- service prices
- labor prices
- inspection prices
- package prices
- parts selling price policy
- tax/VAT behavior
- discount limits
- payment methods
- deposit rules
- invoice numbering
- invoice terms
- refund approval rules
- delivery payment lock
- who can issue invoice
- who can record payment

Rules:
- catalog price changes affect future quotes only
- approved quote prices are locked
- running invoice updates live
- final invoice is immutable after issue
- changes after final invoice require credit/refund/adjustment
- customer sees selling price only
- internal cost/margin requires permission

### PAGE: Reports & Analytics

Owner sees company-wide reports for their own workshop:
- operations
- branch comparison
- technician performance summary
- inventory risk
- customer decision trends
- finance summary
- builder adoption
- feature usage
- workflow health
- permission/audit changes

Owner can control report visibility:
- personal reports
- team reports
- branch reports
- inventory reports
- finance reports
- builder adoption
- feature usage
- export
- drill-down

Report permissions must affect:
- pages
- widgets
- drill-downs
- exports
- API/data returned

### PAGE: Audit & Change History

Show:
- who changed what
- before
- after
- affected pages
- affected roles
- affected users
- reason
- timestamp
- risk level
- rollback availability

Audit:
- permission change
- scope change
- builder publish
- page layout change
- form field change
- message template change
- pricing change
- financial rule change
- user role change
- workflow policy change
- report visibility change

### PAGE: Publish Center / Impact Preview

Any major Owner change must go through:

1. Draft
2. Validate
3. Preview
4. Impact Preview
5. Publish
6. Apply Effective Config
7. Audit
8. Rollback if needed

Impact Preview shows:
- affected pages
- affected roles
- affected users
- affected workflows
- affected reports
- affected customer portal behavior
- platform locks
- risk level
- rollback availability

A setting is not complete unless it actually changes affected pages/actions/data.

## BRANCH MANAGER ROLE

Branch Manager owns daily branch operations.
They do not manage platform settings.
They do not manage inventory catalog by default.
They do not act as technician.

Pages:

1. Branch Home / Attention Center
2. Customer Intake
3. Work Orders
4. Work Order Workspace
5. Approvals & Customer Decisions
6. Delivery & Payments Status
7. Team Setup if delegated by Owner

### PAGE: Branch Home / Attention Center

Purpose:
Daily operational overview for assigned branch.

Cards:
- New / Active Work Orders
- Waiting Customer Decisions
- Waiting Parts
- Blockers
- Critical Rejections
- Rework / QC Failed
- Ready for Delivery
- Payment Pending
- Technician Load
- Today Intake
- Completed Today

Actions:
- open work order
- follow up customer
- assign/reassign technician
- escalate blocker
- view waiting parts
- view delivery readiness

### PAGE: Customer Intake

Purpose:
Register customer, asset, and Work Order.

Wizard:
1. Find/Create Customer
2. Find/Register Asset
3. Confirm Ownership
4. Create Work Order
5. Assign Technician
6. Communication Preference

Must support ownership transfer:
- new owner sees technical history only
- old owner private/financial data remains hidden

### PAGE: Work Orders

Purpose:
Board/list of branch Work Orders.

Group by status:
- Registered
- Under Inspection
- Waiting Customer
- Waiting Parts
- In Progress
- Blocked
- Ready for Review/QC
- Ready for Delivery
- Payment Pending
- Closed

Cards show:
- customer
- asset
- plate/identifier
- technician
- lifecycle status
- parts state
- customer decision state
- payment/delivery state
- next action

### PAGE: Work Order Workspace

Purpose:
Full operational view of one Work Order.

Sections:
- Summary
- Customer & Asset
- Assigned Technician/Team
- Technician Activity
- Customer Decisions
- Parts & Inventory
- Blockers
- QC/Rework
- Invoice/Payment Snapshot
- Delivery Readiness
- Timeline

Branch Manager can:
- assign/reassign technician
- follow up customer decisions
- review blockers
- monitor parts waiting
- issue final invoice if allowed
- record payment if allowed
- release delivery if payment/delivery gate allows

Branch Manager cannot:
- execute technician task
- mark part used
- adjust stock unless explicitly allowed
- edit platform/owner settings

### PAGE: Approvals & Customer Decisions

Purpose:
Monitor customer approval requests.

Filters:
- Pending
- Overdue
- Approved
- Rejected
- Critical Rejected
- WhatsApp Link Sent
- Needs Follow-up

Actions:
- view decision
- send reminder
- add follow-up note
- escalate critical rejection
- notify technician

### PAGE: Delivery & Payments Status

Purpose:
Show readiness before delivery.

Checks:
- work completed
- QC done if enabled
- customer decisions resolved
- final invoice issued
- payment paid or policy allows unpaid
- delivery allowed

Actions:
- issue final invoice if allowed
- record payment if allowed
- release delivery if allowed

### PAGE: Team Setup

Only if Owner delegates.

Can:
- create team
- assign Team Leader
- assign technicians to team
- move technicians
- set active/inactive team membership

Must preserve team membership history.

## TECHNICIAN ROLE

Technician UI must be simple, task-first, mobile/tablet-friendly.

Exactly three main pages:
1. Technician Home
2. My Work
3. Work Card

No admin sidebar.
No payment recording.
No final invoice.
No inventory admin.
No reports except personal summaries.

Technician lifecycle visibility is critical.

Every assigned vehicle/job must show:
- current lifecycle stage
- next action
- blocking role/reason
- customer decision state
- parts state
- finish readiness

Lifecycle strip:
Intake → Assigned → Inspection → Approval → Parts → In Progress → Review/QC → Invoice/Payment → Delivery

### PAGE: Technician Home

Purpose:
Tell technician what to do now.

Content:
- Current Job Card
- My Work
- Needs Inspection
- Waiting Customer
- Waiting Parts
- Blocked
- Returned for Rework
- Quick Service / Quick Inspection
- Scan Vehicle / WO

Current Job Card:
- asset
- plate/serial
- Work Order number
- current task
- lifecycle stage
- next action
- blocker
- Open Work Card button

### PAGE: My Work

Purpose:
Show assigned vehicles/tasks grouped by operational state.

Groups:
- Active Now
- Needs Inspection
- Due Today
- Waiting Customer
- Waiting Parts
- Blocked
- Returned for Rework
- Ready to Finish
- Completed Today

Each job card:
- asset
- identifier
- Work Order number
- task
- lifecycle stage
- next action
- customer decision state
- parts state
- blocker state
- Open Work Card button

### PAGE: Work Card

Purpose:
Execution command center for one vehicle.

Sticky header:
- asset
- identifier
- Work Order number
- current task
- lifecycle stage
- next required action
- blocker state
- finish readiness

Tools:
- Inspect
- Quick Inspection
- Codes
- Services / POS
- Parts
- Ask Customer
- Blocker
- Notes
- History
- Finish

**Quick Inspection:**
Fast triage, not quick service.

Fields:
- complaint confirmed yes/no
- odometer / hours
- quick visual condition
- warning lights / visible issues
- leak / safety concern
- category-specific checklist
- technician note
- recommended next step

Outputs:
- no issue found
- proceed to quick service
- create fault
- full inspection required
- add service/part to quotation
- ask customer approval
- report blocker

**Full Inspection:**
- checklist
- faults
- severity
- photos placeholder
- diagnostic codes
- recommended services
- recommended parts
- customer approval requirement

**Services / POS:**
This is Technician Work Order POS, not cashier POS.

Technician can add billable items to the current Work Order:
- inspection service
- maintenance service
- labor fee
- spare part
- package
- extra allowed item

Each item:
- name
- type
- quantity
- unit price if technician has permission
- labor price if allowed
- total if allowed
- customer approval required
- stock requirement
- status

If technician cannot view prices:
"Price hidden by workshop settings."

Technician never sees internal cost/margin unless explicitly allowed.

**Parts Panel:**

Sections:
- Search / Add Part
- Requested Parts
- Issued / On the Way
- Arrived / Received
- Used
- Return Unused
- Returned / Rejected

Technician labels:
- Pending
- On the way
- Arrived
- Received
- Used
- Return Pending
- Returned
- Rejected
- Unavailable

Rules:
- Requested is not Used
- Issued is not Used
- Arrived means technician received it
- Used means installed/consumed
- Return Unused waits for Inventory Manager acceptance before stock increases
- Finish Gate blocks if arrived part is neither used nor returned

**Ask Customer Panel:**
- item/service/labor
- explanation
- importance
- price if allowed
- total if allowed
- customer-facing message
- WhatsApp/MOP decision link workflow

Creates Customer Decision Request and updates:
- Customer Portal
- Branch Manager Approvals
- Technician Work Card
- Team Leader lifecycle
- Running Invoice
- Reports
- Audit

**Blocker Panel:**

Reasons:
- Waiting Part
- Waiting Customer
- Need Team Leader
- Tool Missing
- Safety Issue
- Unclear Diagnosis
- Other

Route blockers:
- Waiting Part → Inventory + Branch Manager + Team Leader
- Waiting Customer → Branch Manager
- Need Team Leader → Team Leader
- Tool Missing → Branch Manager
- Safety Issue → Branch Manager + Team Leader urgent

**Finish Panel:**
Finish is a gate, not just a button.

Checklist:
- inspection completed
- required faults handled
- customer decisions resolved
- approved work completed
- parts used or returned
- no pending return
- no open blocker
- required notes completed
- time tracking completed if required

If blocked, show exact reason:
- customer approval pending
- part received but not used/returned
- open blocker exists
- inspection incomplete

Technician can see read-only delivery status:
- Waiting QC
- Ready for Invoice
- Payment Pending
- Ready for Delivery
- Closed

Technician cannot:
- issue final invoice
- record payment
- release delivery
- close financial workflow

## INVENTORY MANAGER ROLE

Inventory Manager manages stock and warehouse operations.
They do not perform technician work.
They do not record payments.
They do not issue final invoices.

Pages:

1. Inventory Home
2. Technician Requests
3. Inventory POS / Catalog Control
4. Quantity Control & Stock Status
5. Returns / Movements
6. Reports & Stock Insights

### PAGE: Inventory Home

Cards:
- Pending Technician Requests
- Items to Dispatch
- Waiting Technician Arrival Confirmation
- Return Requests
- Low Stock
- Critical Stock
- Out of Stock
- Fast Moving Items

### PAGE: Technician Requests

Request card:
- request ID
- Work Order
- task
- technician
- asset
- category
- branch
- item
- quantity
- urgency
- reason
- availability
- status
- requested time

Actions:
- approve
- issue
- reject
- check other warehouse
- transfer
- supplier order
- mark unavailable

### PAGE: Inventory POS / Catalog Control

This is inventory/catalog management, not customer cashier POS.

Can manage:
- item name
- SKU
- item type
- category
- subcategory
- compatible operating category
- warehouse
- quantity
- low stock threshold
- critical stock threshold
- selling price
- work order usable
- POS visible
- stock tracked
- image placeholder
- barcode/QR
- cost if allowed
- supplier
- notes

### PAGE: Quantity Control & Stock Status

Shows:
- item
- SKU
- category
- warehouse balances
- available
- reserved
- issued
- received by technician
- used
- return pending
- damaged
- low/critical/out of stock status

Statuses:
- Healthy
- Low
- Critical
- Out of Stock

### PAGE: Returns / Movements

Tracks stock ledger and return requests.

Actions:
- Accept Return to Stock
- Accept as Damaged
- Reject Return
- Request Clarification

Stock only increases after Inventory Manager accepts return.

### PAGE: Reports & Stock Insights

Reports:
- usage by item
- consumption rate
- stock risk
- returns report
- technician request report
- category usage
- branch/warehouse usage

## TEAM LEADER ROLE

Team Leader supervises managed technicians only.
They do not make maintenance decisions yet.
They do not issue parts.
They do not record payments.
They do not access company-wide reports.

Pages:

1. Team Leader Home
2. Technicians View
3. Vehicles / Work Orders View
4. Technician Performance Reports

### PAGE: Team Leader Home

Cards:
- My Team
- Active Work
- Blocked Technicians
- Waiting Parts
- Waiting Customer
- Rework/QC Issues
- Recent Technician Activity

### PAGE: Technicians View

Technician cards:
- name
- status
- current task
- asset
- Work Order
- last action
- tasks today
- blockers
- pending parts
- pending decisions
- Open Details

Details drawer:
- current work
- actions timeline
- inspection activity
- parts activity
- customer decision activity
- blockers
- internal supervision note

Allowed:
- view activity
- add internal supervision note
- flag issue to Branch Manager

Forbidden:
- complete task
- issue parts
- record payment
- make customer decision
- pass/reject maintenance in this version

### PAGE: Vehicles / Work Orders View

Only WOs involving managed technicians.

Card:
- asset
- identifier
- Work Order
- technician
- lifecycle status
- task
- decision status
- parts status
- blocker
- delivery status
- last update

Lifecycle drawer:
- Intake
- Inspection
- Customer Decisions
- Parts & Inventory
- Technician Work
- Blockers
- Quality/Rework Status
- Delivery Status

### PAGE: Technician Performance Reports

Managed technicians only.

Reports:
- tasks completed
- active tasks
- average task time
- blockers by technician
- rework/returned count
- QC issues
- parts requested/used/returned
- customer decision requests
- diagnostic codes activity
- technician comparison table

No finance.
No inventory value.
No customer private data.
No company-wide reports.

## DATA ANALYST ROLE

Data Analyst is read-only.
They see reports only within assigned scope.

Pages:
1. Analytics Home
2. Operations Analytics
3. Technician & Team Analytics
4. Inventory Analytics
5. Customer Decision Analytics
6. Feature Adoption Analytics
7. Saved Views / Exports

Can see:
- company-wide dashboards if allowed
- selected branches if scoped
- selected categories if scoped
- inventory analytics if allowed
- technician/team performance if allowed
- customer decision analytics if allowed
- operational bottlenecks
- feature usage
- exports if allowed

Cannot:
- edit data
- change permissions
- change builder
- issue stock
- record payment
- send messages
- modify workflows

## CUSTOMER ROLE

Customer has a safe portal only.

Pages:
1. Customer Portal Home
2. My Assets
3. Current Service
4. Decision Page / Approvals
5. Invoice & Payment Status
6. Safe Technical History

Customer sees:
- own profile
- own linked assets
- current service status
- decision requests
- approved/rejected items
- current invoice
- final invoice
- payment status
- safe technical history

Customer must never see:
- internal notes
- staff notes
- stock numbers
- supplier details
- internal cost
- margin
- old owner private/financial data
- technician performance
- team leader supervision notes
- platform controls
- other customers/assets

Customer Decision Page:
Shows:
- service/part/labor item
- customer-facing explanation
- importance
- price
- labor
- total
- approve/reject buttons
- critical warning acknowledgement if needed

Customer cannot change:
- price
- quantity
- item identity
- Work Order ID

All decision responses must be validated server-side.

## SYSTEM AUTOMATION

System Automation has no login UI.

It creates:
- reminders
- low stock alerts
- overdue decision alerts
- delivery/payment locks
- invoice status updates
- audit events
- report snapshots
- workflow health alerts

All system actions must have actorType = system.

## RELATIONSHIPS BETWEEN ROLES

1. **Super Admin → Owner**
Super Admin creates workshop and Owner.
Super Admin controls platform-level modules/features/limits.
Owner works inside those limits.

2. **Owner → Staff**
Owner creates Branch Managers, Technicians, Inventory Managers, Team Leaders, Data Analysts.
Owner assigns roles/scopes/permissions.

3. **Branch Manager → Technician**
Branch Manager creates Work Order and assigns Technician.
Technician executes work.
Branch Manager monitors progress.

4. **Technician → Customer**
Technician creates findings/recommendations.
Technician or Branch Manager creates customer decision request.
Customer approves/rejects from portal/link.

5. **Technician → Inventory Manager**
Technician requests parts.
Inventory Manager approves/issues.
Technician confirms arrival.
Technician marks used or returns unused.
Inventory accepts return before stock increases.

6. **Technician → Team Leader**
Team Leader sees technician activity for managed technicians only.
If enabled, technician finish may go to team review.

7. **Branch Manager → Customer**
Branch Manager follows up decisions, invoice, payment, delivery.

8. **Owner → Reports**
Owner sees tenant-wide reports and controls who else sees reports.

9. **Super Admin → Live View**
Super Admin can view tenant pages read-only using tenant's current configuration.

10. **Owner Builder → All Role Pages**
Owner theme/page/layout/workflow changes must affect real pages for staff and customers.

## FINANCIAL SYSTEM

Finance is not just payment.

It includes:
- pricing catalog
- quotation/estimate
- customer-approved prices
- running invoice
- final invoice
- payment ledger
- discounts
- refunds/adjustments
- delivery payment gate
- financial reports

Owner controls:
- service prices
- labor prices
- package prices
- inspection prices
- parts selling price policy
- payment methods
- discount rules
- refund rules
- invoice numbering
- invoice terms
- delivery payment lock
- who can issue invoices
- who can record payments

Customer sees:
- current approved services
- part prices
- labor prices
- running invoice
- final invoice
- payment status
- receipt/final confirmation

Technician can add services/parts/labor to Work Order if allowed.
Technician cannot issue invoice or record payment.

Branch Manager can issue invoice/record payment only if allowed.

Rules:
- approved prices are locked
- catalog price changes affect future quotes only
- running invoice updates live
- final invoice immutable after issue
- changes after final invoice require credit/refund/adjustment
- delivery blocked if unpaid unless policy allows
- internal cost hidden from customer and unauthorized roles

## OPERATIONS ENGINE

Every important action must emit an operation event.

Examples:
- work_order.created
- technician.assigned
- inspection.saved
- fault.created
- customer_decision.requested
- customer_decision.responded
- part.requested
- part.issued
- part.arrived_confirmed
- part.used
- part.return_requested
- part.return_accepted
- blocker.reported
- task.finish_attempted
- task.finish_blocked
- invoice.issued
- payment.recorded
- builder.published
- owner.permission_changed
- platform_control.changed
- workshop.frozen

Every event must update:
- workflow status
- relevant pages
- notifications/attention cards
- reports
- timelines
- audit
- customer-safe projection if needed

No important action may update UI only.

## CUSTOMER-SAFE PROJECTION

Internal events must be converted into safe customer messages.

Example:

Internal:
"Inventory Manager created supplier order for unavailable brake pads."

Customer-safe:
"We are waiting for a required part. The branch will update you when it is available."

Customer must never see internal operational details.

## REPORTING SYSTEM

Reports are role-based, not one generic page.

Technician:
- personal task summary only

Inventory Manager:
- stock health
- movements
- consumption
- returns
- supplier/transfer
- warehouse-scoped reports

Branch Manager:
- branch operations
- waiting customer
- waiting parts
- blockers
- delivery/payment snapshot
- branch workload

Team Leader:
- managed technicians only

Owner:
- company-wide tenant reports
- branch comparison
- financials
- inventory risk
- feature usage
- builder adoption
- workflow health

Data Analyst:
- read-only analytics based on assigned scope

Customer:
- service summaries only, not reports

Super Admin:
- platform reports about sold workshops, usage, risk, subscriptions

Report permissions:
- view
- drill-down
- export
- finance visibility
- inventory value visibility
- cost/margin visibility

## BUILDER AND TENANT CUSTOMIZATION

Each workshop can have its own design and layout.

Owner can customize:
- theme
- logo
- colors
- density
- status colors
- page sections
- role experience
- forms
- messages
- workflows
- pricing
- reports visibility

When any user logs in:
The app must load:
- tenant theme
- tenant builder config
- role experience
- permissions
- scopes
- enabled modules/features

So the same Technician page can look different in two different workshops.

Example:
Apex Motors Technician Home may have blue theme and simple cards.
Delta Service Technician Home may have green theme and different optional sections.
But both must still respect safety, permissions, lifecycle, and tenant isolation.

Builder cannot:
- inject raw code
- show internal data to customer
- remove critical safety sections
- remove Finish Gate
- remove payment gate
- override platform locks
- bypass permissions

## AUDIT

Audit sensitive actions:
- login security events
- owner created
- staff created
- permission changed
- scope changed
- builder published
- workflow policy changed
- price changed
- invoice issued
- payment recorded
- refund requested/approved
- customer decision responded
- inventory movement
- report export
- platform control changed
- tenant frozen/reactivated
- live view opened

Audit fields:
- actor
- actor type
- tenant
- target
- action
- before
- after
- reason if required
- timestamp
- risk level

## QUALITY RULES

Do not build random pages.
Do not build disconnected UI.
Do not use fake role switching.
Do not hide buttons as the only security.
Do not let UI components contain all business logic.
Do not hardcode tenant/user/branch data.
Do not silently mutate invoices, stock, permissions, or workflows.

Use:
- centralized permission resolver
- centralized workflow status resolver
- centralized platform control resolver
- centralized lifecycle services
- centralized audit service
- centralized customer-safe projection
- clear domain services
- clear feature modules
- reusable UI components
- schema-driven builder
- route/action/data guards

## ACCEPTANCE TEST — FULL BUSINESS FLOW

The system passes only if this flow works:

1. Platform Super Admin creates workshop owner.
2. Owner logs in to their workshop only.
3. Owner configures theme, pages, permissions, staff, pricing.
4. Owner adds Branch Manager, Technician, Inventory Manager, Team Leader.
5. Branch Manager creates customer and asset.
6. Branch Manager creates Work Order and assigns Technician.
7. Technician sees job in Home/My Work.
8. Technician opens Work Card.
9. Technician performs Quick Inspection.
10. Technician creates fault/recommendation.
11. Technician adds service/part/labor through Work Order POS.
12. Customer decision request is created with prices.
13. Customer approves from portal/link.
14. Technician requests part.
15. Inventory Manager issues part.
16. Technician confirms arrived.
17. Technician marks used.
18. *(— message truncated here at the 50,000-character limit; steps 18 onward, and any sections that may have followed the Acceptance Test, were never received. Follow up with the product owner to obtain the remainder.)*


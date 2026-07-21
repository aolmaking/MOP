# V2/V3 Integration QA

Date: 2026-07-04

## Scope

This review covers the integration between:

- Identity Gateway and role-based navigation.
- Version 2 Customer Decision Request flow.
- Version 3 Technician Simple Execution Mode.
- Customer Portal service summary.
- Audit/event hooks used by technician actions.

## Reference Documents Used

- `Role & Permission Matrix.pdf`
- `Phase 18 - Scenario Library.pdf`
- `Inspection System Architecture (1).pdf`

These references confirm the V3 decisions around limited technician navigation,
task-context actions, Work Order timeline behavior, waiting-parts flow, Team
Leader Review routing, customer-safe history, and category-aware inspection.

## Auth And Route Matrix

- Technician route matrix exposes only `technician`, `my-work`, and `work-card`.
- Customer route matrix exposes only `customer`.
- Branch Manager and Tenant Admin can see `customer-decisions`.
- Unauthorized route access goes through Access Denied.
- Technician can create customer decisions from assigned work when assigned through either Work Order assignment or Task assignment.

## V2 To V3 Flow

1. Technician opens Work Card.
2. Technician uses Ask Customer inside Work Card.
3. Work Card creates a Customer Decision Request.
4. API generates WhatsApp-safe message and secure MOP decision link.
5. Customer opens `/decision/:token`.
6. Customer approves/rejects each item.
7. Critical rejection requires warning acknowledgement.
8. Customer response updates Work Order summary and creates timeline/audit records.
9. Technician Work Card finish checks detect pending customer decisions and critical rejections.

## Customer Portal

- Customer Portal shows safe service updates only.
- Financial totals are hidden for customer account sessions.
- Customer can see own decision requests through `/customer-decisions/my`.
- Responded decisions are shown as recorded.
- Pending sent/viewed decisions expose the secure MOP decision link.

## Fixes Applied During QA

- Added `customer-decisions` to seeded Tenant Admin and Branch Manager pages.
- Added Tenant Admin customer decision permissions in seed data.
- Added customer-owned decision list endpoint: `GET /customer-decisions/my`.
- Customer Work Orders response now includes `customerSummary`.
- Customer account sessions receive zeroed financial totals from Work Orders API.
- Customer Portal UI hides Total/Paid/Balance and shows safe service summary.
- Public decision page is read-only after a decision is already responded.
- Public decision open now returns the updated `viewed` status.
- Critical customer rejection now updates Work Order label and customer summary.
- Technician Work Card now checks all related decision requests, including responded critical rejections.
- Technician My Work now derives customer decision state from related decision requests.
- Technician decision creation works for task-assigned technicians even without separate Work Order assignment.
- V3 Freeze Addendum is documented in `v3-technician-simple-execution-mode.md`.
- Technician part actions now emit the structured Part Request contract required by V4 Inventory Manager work.
- Technician checklist includes `Not Applicable` and a quick `Mark OK` action,
  matching the Inspection Architecture suggested checklist behavior.

## Validation

- `node tools/validate-structure.mjs` passed.
- Static route matrix check passed for Technician and Customer routes.
- Static button check passed for Technician, Customer Portal, and Customer Decision pages.
- `pnpm install` was attempted but timed out before dependencies were installed; no `node_modules` or `pnpm-lock.yaml` were left in the project.
- Full Angular/Nest typecheck/build still requires a successful dependency install.

## Remaining Before Production

- Add automated integration tests after dependency install is available.
- Add real e2e tests for Login -> Technician Work Card -> Ask Customer -> Public Decision -> Customer Portal.
- Add persisted domain models for inspection, fault, and parts events beyond the current audit hook layer.

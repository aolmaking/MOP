# Role Acceptance Report

Date: 2026-07-09  
Gate: Product Acceptance and Release Candidate  
Result: PASS

## Acceptance method

- Verified each role's default landing page, navigation allowlist, API permission checks, tenant and scope filters, primary actions, empty states, and error states.
- Replaced the generic Team Review and Reports placeholders with functional role-specific experiences.
- Removed the duplicated `tenant`, `control`, and `permissions` placeholder pages from Owner and Tenant Admin navigation. Their real capabilities remain in Builder, Configuration and Permissions, and Users and Access.
- Static release-candidate gate: 97/97 checks passed.

## Role results

| Role | Landing page | Essential experience | Result |
| --- | --- | --- | --- |
| Customer | Customer Portal | Own assets, safe work-order status, decisions, invoice and payment state only | PASS |
| Technician | Technician Home | Exactly three pages: Home, My Work, Work Card; large task actions and server-side Finish Gate | PASS |
| Inventory Manager | Inventory Home | Requests, catalog/POS control, quantity risk, returns/movements, stock insights | PASS |
| Branch Manager | Branch Home | Intake, work-order board/workspace, decisions, invoices, delivery gate | PASS |
| Team Leader | Work Orders | Real managed-team review queue with checklist, Approve for QC, and Return for Rework | PASS |
| Tenant Owner/Admin | Builder Home | Builder, access, pricing, finance, operations, reports, and audit without duplicate placeholder pages | PASS |
| Platform Super Admin | Workshops | Workshop creation, secure owner invitation, reports, live view, freeze/reactivate controls | PASS |
| Data Analyst | Analytics Home | Read-only scoped operational, people, inventory/customer, and company reports with CSV export | PASS |

## Access and privacy

- Navigation is resolved from account type, role pages, effective permissions, platform controls, tenant configuration, and user scopes.
- Customer APIs restrict data to the authenticated customer and linked assets.
- Branch, warehouse, category, team, and managed-technician scopes are enforced by backend access helpers.
- Builder configuration cannot grant a permission that the effective access resolver denies.
- Frozen tenants are rejected or placed into controlled read-only behavior according to account type and platform policy.

## Remaining non-blocking acceptance work

- Run assisted browser UAT with one non-technical person per role on the deployment target.
- Capture mobile screenshots at the actual supported device widths after the Angular builder dependency is restored.
- Connect invitation links to the selected email/SMS provider; secure invitation acceptance itself is implemented.

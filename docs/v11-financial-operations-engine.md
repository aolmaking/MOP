# Version 11 - Financial Operations Engine

V11 closes the commercial cycle:

`inspection -> priced recommendation -> customer approval -> execution -> running invoice -> immutable final invoice -> payment -> delivery`

## Server rules

- Catalog prices are defaults; quotes preserve price snapshots.
- Customer approval locks the approved amount.
- Used parts update the running invoice and accepted unused returns reverse it.
- Pending approvals block final invoice issue.
- Issued invoices are immutable; corrections use credit notes or refunds.
- Payments recalculate invoice, work order, running balance, and delivery readiness.
- Delivery requires an issued invoice and cleared payment unless both Owner and platform policies allow an override.
- Invoice numbers use an atomic tenant, branch, and year sequence.
- Financial mutations create audit and V10 operation events.

## Role surfaces

- Owner: catalog, configuration, dashboard, invoices, discounts and refund rules.
- Branch Manager: branch invoices, payment recording, and delivery payment gate.
- Customer: customer-owned invoices, balances, and payment state.
- Technician: part usage feeds billing but cannot issue invoices or record payments.
- Inventory Manager: selling-price edits require Owner policy.
- Super Admin: module, payments, refunds, reports, read-only, and override controls.

Run `node tools/validate-v11-financial-operations.mjs` for the V11 gate.

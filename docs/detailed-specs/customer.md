# Customer — Detailed Page Specifications

> Status: **COMPLETE.** Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`, cross-checked against the Phase 0 schema.
>
> **Two of these six pages (My Assets, Safe Technical History) did not exist at all in the previous build** — the permissions were declared, never asserted by any controller, and `SafeTechnicalHistory` was a seeded-but-never-queried table. Both get full, real specs below, including the read path the old build never built.
>
> **The single rule every page in this role answers to:** a customer must never see internal notes, staff notes, stock numbers, supplier details, internal cost, margin, a previous owner's private/financial data, technician performance, Team Leader supervision notes, platform controls, or any other customer's data — enforced by the response DTO for every endpoint this role calls **never including those fields in the first place**, not by a frontend that receives everything and hides some of it. If a field isn't in the customer-facing DTO's type definition, it structurally cannot leak, regardless of what any future page built against that DTO tries to render.

---

## PAGE: Customer Portal Home

### Purpose
Landing page — orientation across the customer's own assets and open service.

### Access
Permission: `customer.portal.view` (this role's only account type is `CUSTOMER`; there is no staff-equivalent permission-matrix nuance here — a customer account either has portal access or, per `Customer.portalStatus`, it doesn't, in which case the account can't reach this page at all).

### Content
- Own profile summary (name, phone, email — editable within reasonable limits, e.g. contact info, not identity fields).
- **My Assets** shortcut — count of linked assets, links to My Assets.
- **Current Service** shortcut — if any asset has an open Work Order, a summary card (asset, current stage from the lifecycle strip, next expected update) links to Current Service; if no asset has anything open, this section shows a plain "No active service right now" state rather than an empty card shape.
- Pending decisions count (if any) — prominent, since this is usually the reason a customer is opening the portal at all.
- Recent invoice/payment status summary — links to Invoice & Payment Status.

---

## PAGE: My Assets

### Purpose
Every asset this customer currently owns, at a glance — new page, didn't functionally exist before.

### Access
Permission: `customer.asset.view_own`. Scope: assets where `AssetOwnershipHistory` has an **open** row (`endedAt = null`) for this customer — an asset this customer owned in the past but has since transferred away does **not** appear here, even though the historical record still exists in the database for the new owner's Safe Technical History purposes.

### Content
Card per asset: category-appropriate identifier (plate for Cars/Motorcycles, serial for Heavy Equipment), category, a small thumbnail/icon, current status ("In Service" if an open Work Order exists, "No Active Service" otherwise), and a link into that asset's own Current Service or Safe Technical History. For a customer with one vehicle, this is a single card; for a fleet customer with many assets (Heavy Equipment operators are the most likely case here, per the canonical spec's fleet/operator fields), the same card grid paginates rather than assuming one asset per customer anywhere in the layout.

---

## PAGE: Current Service

### Purpose
What's happening right now with a specific asset's open Work Order — the customer-safe mirror of the Technician's own lifecycle strip.

### Access
Permission: `customer.service.view_own`, scoped to the customer's own open Work Orders only (enforced the same way every other cross-role data boundary in this product is enforced — a query predicate keyed to `session.customerId`, not a client-side filter).

### Content
- Lifecycle strip (the same stages shown to staff — Intake → Assigned → Inspection → Approval → Parts → In Progress → Review/QC → Invoice/Payment → Delivery — but every internal detail behind each stage is replaced with its Customer-Safe Projection: "In Progress" shows no internal task list, just that work is underway, with a customer-facing note if one was marked visible).
- Pending decisions for this Work Order (also reachable from here, in addition to the dedicated Decision Page).
- Running total (if `FinanceConfiguration.customerInvoiceVisible`, which is on by default — a customer generally should see what they're accumulating before the final invoice, though the workshop can turn this off if they prefer to reveal pricing only at decision-request time).
- Estimated next update — a plain-language, non-committal indicator ("We'll update you once inspection is complete"), never a hard promised timestamp the workshop can't actually guarantee.

---

## PAGE: Decision Page / Approvals

### Purpose
Where a customer actually approves or rejects recommended work — the receiving end of the Technician's Ask Customer panel and the public link a WhatsApp message points to.

### Access
Two entry paths: (1) logged into the portal, viewing any of their own pending/past decisions; (2) the public secure-link path (`secureToken`), which does **not** require a portal login — this is deliberate, since the WhatsApp link is meant to be openable directly, and requiring login-first would break the flow the whole feature exists for. The public path resolves `secureToken → CustomerDecisionRequest`, scoped to exactly that one request, and grants no broader portal access.

### Link states (public path)
- **Expired** — `CustomerDecisionRequest.expiresAt` has passed: a plain page, no items shown, explaining the link expired and to contact the branch for a new one — never a confusing empty decision list.
- **Already responded** — every item already has a non-`PENDING` decision: shows the same content as normal but read-only (no Approve/Reject controls), with a clear "You already responded to this on {date}" banner, so re-opening an old WhatsApp link is informative, not broken.
- **Valid and open** — the normal interactive state described below.

### Content, per item on the request
Service/part/labor name, customer-facing explanation (from the technician's Ask Customer input, itself sourced from the workshop's Messages & Templates where applicable), importance (Low/Medium/High/Critical, shown as a plain badge, not the internal severity terminology), price, labor, total (subject to `customerInvoiceVisible`; if a workshop has that off, the item still shows with pricing withheld and a note that pricing will be confirmed on the invoice — a rare configuration, but the page must not break if it's set), **Approve** / **Reject** buttons per item.

### Critical warning acknowledgement
If an item is `importance = CRITICAL` and the customer selects Reject, a modal interrupts before the rejection is accepted: the workshop's configured critical-warning text (from Messages & Templates), an explicit acknowledgement checkbox ("I understand rejecting this may affect safety and this will be recorded"), and only then does Reject actually submit. This is not a client-side-only gate — the server independently re-validates that `warningAcknowledged = true` was actually submitted for any critical rejection before accepting it, since this is exactly the kind of check a modified/replayed request must not be able to skip.

### What the customer cannot change
Price, quantity, item identity, Work Order ID — every one of these is server-resolved from the `CustomerDecisionItem` row by its own ID; the client can submit only `{itemId, decision, warningAcknowledged, note}`, nothing else, and the server ignores (does not merely distrust) any other field even if a modified client tried to send one.

### After responding
Status updates live for the customer (Approved/Rejected shown immediately), and fans out through the same operations pipeline as every other significant action: Branch Manager's Approvals view, the Technician's Work Card, Team Leader's lifecycle view if enabled, the Running Invoice, Reports, Audit — a customer's decision is exactly as consequential an event as a staff action, and is treated with the same rigor.

---

## PAGE: Invoice & Payment Status

### Purpose
Running invoice while service is ongoing, final invoice once issued, and payment status throughout.

### Access
Permission: `customer.invoice.view_own`.

### Content
- While open: the running invoice's current line items and total, live-updating as approved items are added (subject to `customerInvoiceVisible`).
- Once issued: the final, **immutable** invoice — every line, subtotal, discount, tax, total, in the workshop's own currency, formatted per the workshop's `Tenant.currency`. The customer-facing render of an issued invoice is provably the same immutable data staff see in Work Order Workspace's Invoice/Payment Snapshot (same source row, same `locked` guarantee), not a separately-generated customer copy that could drift from the real one.
- Payment status: paid/partial/unpaid, payment history (method + amount + date, no processor-internal transaction detail beyond what's needed for the customer's own record), receipt/final confirmation once fully paid.
- If a `CreditNote` or `RefundRequest` has been applied, both appear here in plain language ("A credit of {amount} was applied on {date}: {reason}") — the customer sees the adjustment and why, never a silently changed total.

---

## PAGE: Safe Technical History

### Purpose
The sanitized service history for one of the customer's own assets — the other page that didn't functionally exist before (the data model was there; nothing read it).

### Access
Permission: `customer.history.view_safe`. Scope: `SafeTechnicalHistory` rows for this asset **where `ownerCustomerId` matches this customer** — this is the field that makes ownership-transfer privacy actually work: a new owner querying this asset's history only ever receives rows recorded under their own ownership period, never a previous owner's, even though both sets of rows exist in the same table for the same physical asset.

### Content
Chronological list: service date, a plain-language summary (Customer-Safe Projection output, not raw internal notes — "Brake pads replaced, front axle" rather than a technician's internal diagnostic shorthand), the associated Work Order if the customer wants to drill into that visit's own Current-Service-style detail (only for visits that occurred during their own ownership — a summary entry from a prior owner's era, if ever surfaced at all in some future aggregate-condition view, would never link into that prior owner's actual Work Order detail).

### What never appears here, regardless of how the underlying Work Order was actually staffed or costed
Internal notes, staff notes, stock/part numbers, supplier details, internal cost, margin, technician identity or performance, Team Leader supervision notes, any platform control — the same list as the role-wide rule at the top of this document, restated here because this is the page where "just show them the history" is most tempting to implement as "query the real record and strip a few fields on the way out" instead of "query a purpose-built safe projection" — and this spec requires the latter.

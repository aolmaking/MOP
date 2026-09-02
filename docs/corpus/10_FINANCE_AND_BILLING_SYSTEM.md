# MOP — Finance Core and Billing

> **Document ID:** DOC-10
> **Purpose:** how money is represented, priced, accumulated, invoiced, paid, discounted and refunded — and why Billing is a separate bounded system from Finance Core.
> **Authority:** DESCRIPTIVE.
> **Scope:** `apps/api/src/systems/finance/`, `apps/api/src/systems/billing/`, `packages/shared/src/money/`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 06 (entities), 09 (where a part line comes from), 22 (invariants), 23 (idempotency), 04 (the four money policies).

---

## 1. The money representation rule

> **Money is `Decimal(12,2)` in the database and a `string` across the API.**

`[VERIFIED]` — enforced by `tools/lint-money.mjs`; the build fails otherwise.

Not a number — a JS number cannot hold `0.1 + 0.2`. Not a `Decimal` — that would drag Prisma's runtime into the browser. **A string is the only representation that is exact, portable and serialisable.**

Internally, `packages/shared/src/money/money.ts` works in integer **minor units** (piastres, cents, fils). Integers are exact in JS below 2⁵³ — roughly 90 trillion currency units, larger than any invoice a workshop will ever issue.

Two refusals in `toMinor()` that are worth understanding, because both are deliberate:

- **More than two decimal places is an error, not a rounding.** `"1.005"` is not a price; somebody computed it and lost a fraction on the way, and accepting it would bury that. *Round it deliberately before it gets here.*
- **Too large to represent exactly is an error**, not a silent precision loss.

Negative money is legal — a refund, a credit, a negative adjustment.

## 2. The immutability moments

Money has a moment where it must become immutable, **and not one moment earlier**. Too loose and prices are retroactively altered under a customer who already agreed; too tight and normal daily corrections become impossible and staff start working around the system.

| Stage | Mutability | Entity |
|---|---|---|
| Catalogue price | Fluid — but **effective-dated** | `PriceCatalogEntry` |
| Quotation | Fluid | `Quotation`, `QuotationItem` |
| Approved price | **Frozen at approval** | `ChargeableWorkItem.approvedUnitPrice` / `approvedLabourPrice` |
| Running invoice | Live while the job is open | `RunningInvoice`, `RunningInvoiceLine` |
| Issued invoice | **Permanent** | `Invoice`, `InvoiceLine`, `BillingDocument` |
| After issuance | Only a credit note | `CreditNote` |

**The effective-dating rule.** A price edit **closes the old `PriceCatalogEntry` row and opens a new one**. It never rewrites what an issued invoice already printed. This is the same discipline as `WorkshopPolicy`, `MessageTemplate` and `TenantCapability`, and it is what makes *"an old invoice must not silently reprice"* structurally true rather than a convention.

## 3. Finance Core

`FinanceService` is the whole money surface. Its public commands:

| Method | Endpoint | Does |
|---|---|---|
| `addLine` | `POST /finance/work-orders/:id/lines` | Adds a chargeable line to the running total |
| `jobTotal` | `GET /finance/work-orders/:id/total` | The live running total |
| `issueInvoice` | `POST /finance/work-orders/:id/invoice` | Freezes the total into an `Invoice` |
| `settlement` | `GET /finance/invoices/:id` | Total / paid / balance |
| `recordPayment` | `POST /finance/invoices/:id/payments` | Takes money |
| `requestRefund` / `approveRefund` / `rejectRefund` | `POST /finance/invoices/:id/refunds`, `/finance/refunds/:id/{approve,reject}` | The refund workflow |
| `requestDiscount` / `approveDiscount` / `rejectDiscount` | `POST /finance/work-orders/:id/discounts`, `/finance/discounts/:id/{approve,reject}` | The discount workflow |

### Where a line comes from

Finance Core does not read Inventory's or Operations' tables. It consumes a **`ChargeableWorkItem`** (`packages/shared/src/contracts/cross-system.ts`) with:

```
itemType     SERVICE | LABOUR | PART | INSPECTION | PACKAGE | FEE
provenance   INVENTORY | EXTERNAL_PURCHASE | CUSTOMER_SUPPLIED | NOT_APPLICABLE
sourceType   TASK | INSPECTION | PART_REQUEST | MANUAL
approvalStatus  NOT_REQUIRED | PENDING | APPROVED | REJECTED
approvedUnitPrice / approvedLabourPrice   (frozen at approval, nullable)
```

`ChargeableItemsService` in Operations produces them; `FinanceService` consumes them. That is the contract boundary, and it is why *"the Pricing page could write `PriceCatalogEntry` but nothing in the money path read it"* was a real, findable defect rather than a matter of opinion — the reader is a named function.

### Pricing lookup

`PriceCatalogService` resolves a service key to its **effective** price at the moment the line is added. `resolveMany()` exists for batch resolution.

⚠️ There is **no stable `serviceId` on an invoice line.** `topServicesByRevenue` in reporting is explicitly grouped by invoice-line **text** and says so, rather than producing a plausible-looking grouping that would silently merge two differently-named services. Gap in doc 37.

## 4. Policies that govern money

| Policy | Enforced where |
|---|---|
| `PARTIAL_PAYMENT` | `recordPayment` refuses a short amount under `FULL_ONLY` |
| `DISCOUNT_AUTHORITY` | `enforceDiscountAuthority` runs on **every** `issueInvoice` call; `THRESHOLD_THEN_APPROVAL` and `ALWAYS_APPROVAL` require a matching **APPROVED `DiscountRequest` for this exact work order and amount** |
| `DELIVERY_BLOCKED_UNTIL_PAID` | `GateEvaluatorService`'s `payment.settled_or_policy_allows`, via `FinanceConfiguration.allowUnpaidDelivery` |
| `UNCOVERED_COUNTRY_BILLING` | `issueInvoice` resolves it **before opening its transaction** and hands it to `BillingService.issueDocument` |
| `CUSTOMER_INVOICE_VISIBILITY` | `CustomerDecisionService.pricingVisible` via `FinanceConfiguration.customerInvoiceVisible` |

Note the pattern: three of these are read through **`FinanceConfiguration` columns written from the policy answer**, not from the policy at call time. That is deliberate — the configuration row is the hot-path read, and `PlatformService.writeFinanceConfiguration` is the single writer that keeps it in step with the policy.

## 5. Payment idempotency

`Payment.idempotencyKey` is the thing that actually prevents a duplicate payment — **a unique constraint, not a check-then-write.**

`recordPayment`:

1. Look up by `idempotencyKey`. Found and matching → return the original result.
2. Not found → attempt the insert inside a transaction.
3. A concurrent insert wins the race → the unique constraint fires; re-read by key and return that result.
4. Same key, **different amount or method** → `409 idempotency_conflict`. Replaying a key with different content is a client bug, not a retry, and it must not silently succeed.

A double-pressed *Take Payment* button therefore records one payment. Two genuinely different payments carry two keys. See doc 23.

## 6. Invoice issuance

```
issueInvoice(workOrderId, …)
  ├─ resolve UNCOVERED_COUNTRY_BILLING          (before the transaction)
  ├─ enforceDiscountAuthority                   (refuse, or require an APPROVED request)
  └─ ONE transaction:
       ├─ freeze RunningInvoiceLines → InvoiceLines
       ├─ allocate the number from InvoiceSequence      (gap-free, per tenant)
       ├─ create Invoice
       ├─ BillingService.issueDocument(...)             (may REFUSE — see below)
       ├─ emit invoice.issued
       └─ audit finance.invoice.issued
```

**The compliance refusal happens inside the same transaction the invoice is created in**, so under `BLOCK` the *whole invoice rolls back* — not just the billing document. An invoice that exists without a legally valid document is precisely the inconsistency the split exists to prevent.

## 7. Billing — a separate bounded system, and why

In several markets an invoice is **not a formatted total; it is a compliance artefact** that must be cleared by a government portal before it is legally valid. Egypt's ETA and Saudi Arabia's ZATCA are the two named for the first adapter pass.

That is a different lifecycle, a different failure mode and a different immutability rule from "what does this job cost", so it is a different system:

| | Finance Core | Billing |
|---|---|---|
| Owns | Prices, running totals, payments, balances, discounts, refunds | The legal document and its clearance state |
| Capability | `FINANCE_CORE` | `BILLING` (depends on Finance Core) |
| Gate | `payment.settled_or_policy_allows` | `invoice.issued` |
| Historical policy | `PRESERVE_READ_ONLY` | **`EXTERNAL_REFERENCE_ONLY`** |
| Externalised | *External Finance Mode* — money entirely outside MOP | *External Billing Mode* — MOP keeps the money, the document comes from accounting software |

`ClearanceStatus`: `NOT_REQUIRED` · `PENDING` · `CLEARED` · `REJECTED` · `FAILED`.

Events: `invoice.issued`, `invoice.document_generated`, `invoice.cleared`, `invoice.clearance_failed`, `invoice.rejected`, `invoice.cancelled`, `credit_note.issued`, `debit_note.issued`.

### ⚠️ The compliance gap, stated plainly

`GenericBillingAdapter` sits behind the country-adapter seam and is the **only** adapter that exists. **No country-specific legal invoicing adapter has been built.** Every real country is therefore compliance-blocked until one ships, and `UNCOVERED_COUNTRY_BILLING`'s default of `WARN_ONLY` is the right default *precisely because the adapter-covered-country list is empty*.

`FinanceConfiguration.compliantBlocked` is real and is surfaced: the Platform Workshops list carries a Compliance badge, and the workshop drawer shows the itemised warning.

Two adapter methods — `getClearanceStatus()` and `generateDebitNote()` — currently have **no production caller**. They are the seam waiting for its first real adapter, not dead code, but they are unexercised outside tests.

## 8. Money invariants

These must hold at all times. See doc 22 for the full register.

```
invoice.total          = Σ invoiceLine.lineTotal (+ tax − discount)
invoice.amountPaid     = Σ payment.amount  where status = COMPLETED
outstanding            = invoice.total − invoice.amountPaid
0 ≤ amountPaid ≤ total                            (unless a credit note applies)
runningInvoice.total   = Σ runningInvoiceLine     while the job is open
an issued Invoice is never mutated                 — only a CreditNote follows it
a discounted invoice has an APPROVED DiscountRequest for that work order AND amount
                                                   — unless DISCOUNT_AUTHORITY = ANY_STAFF_UNLIMITED
InvoiceSequence and CreditNoteSequence are gap-free per tenant
every money value crossing the API is a two-decimal string
```

⚠️ **Rounding at the halfway point** has no single named, documented rule (edge case E15). It was verified resolved on inspection, but the *rule* is not written down in one place — recorded in doc 37, because "verified correct once" and "specified" are different things.

## 9. Refunds and credit notes

```
requestRefund   → RefundRequest (PENDING)     finance.refund.request
approveRefund   → CreditNote issued           finance.refund.decide
rejectRefund    → RefundRequest (REJECTED)    finance.refund.decide
```

`RefundReasonCategory` classifies why. A credit note is **the only honest way to change an issued invoice**, and `CreditNoteSequence` numbers them gap-free.

Authority separation, from the baseline permission map: a Branch Manager may **request** a refund — they see the dispute — but `finance.refund.decide` stays with the Owner. Same for discounts.

## 10. What the customer sees

- **Invoice & Payment Status** (`/customer/invoices`) renders `total` / `paid` / `balance` as **the exact strings the server sends** — no client-side arithmetic, because client-side money arithmetic is how a browser and a ledger come to disagree.
- **Decision pages** show a price beside a finding only when `CUSTOMER_INVOICE_VISIBILITY = SHOWN`. Under `HIDDEN` the price is **absent from the response**, not styled away.
- A smuggled price field on a decision response is **refused**, verified end to end against a running stack.

## 11. Implementation status

| Element | Status |
|---|---|
| Money as string across the API, minor units internally | ✅ `[VERIFIED]` — lint + `money.spec.ts` |
| Effective-dated `PriceCatalogEntry`, read by the money path | ✅ `[INTEGRATED]` — `/owner/pricing` |
| `ChargeableWorkItem` contract between systems | ✅ `[IMPLEMENTED]` |
| Running invoice, line sources | ✅ `[INTEGRATED]` |
| Invoice issuance, gap-free numbering, immutable snapshot | ✅ `[VERIFIED]` |
| Payment with unique-constraint idempotency and a real conflict error | ✅ `[VERIFIED]` |
| Discount request/approve/reject enforced at issuance | ✅ `[VERIFIED]` |
| Refund request/approve/reject + credit notes | ✅ `[VERIFIED]` |
| Delivery gate reading `allowUnpaidDelivery` | ✅ `[VERIFIED]` |
| Compliance blocking inside the invoice transaction | ✅ `[VERIFIED]` |
| Owner Pricing & Financial Configuration page | 🟡 — Service Catalog, Tax/VAT, Discounts & Deposits, Payment Methods, Invoice Settings, Delivery Payment Gate all built. **"Who Can Handle Money" not built** — it needs the same platform-lock mechanism as Builder Control's permission matrix |
| **Country-specific billing adapter (ZATCA / ETA)** | 🔴 `[INTENDED]` — **the single largest compliance gap in the product** |
| `getClearanceStatus()` / `generateDebitNote()` | 🧪 — seam methods with no production caller yet |
| `REQUIRES_OVERRIDE` audited delivery release | 🔴 `[INTENDED]` |
| `BLOCK_WITH_OVERRIDE` platform exception | 🔴 `[INTENDED]` |
| Named halfway-rounding rule | 🔴 `[INTENDED]` — E15 |
| Stable `serviceId` on invoice lines | 🔴 `[INTENDED]` |

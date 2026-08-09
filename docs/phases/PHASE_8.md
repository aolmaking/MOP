# Phase 8 — Finance Core

> **Goal:** pricing, discounts, tax, the running balance, payments, refunds and deposits.
> **Why it matters:** every earlier phase could be wrong and be *corrected*. This one reaches a customer's pocket. A stock count that disagrees with a shelf is an argument; a total that disagrees with what someone paid is a dispute.
> **Companions:** [`DESIGN_LANGUAGE.md`](../DESIGN_LANGUAGE.md) §7.5. The `FINANCE_CORE` capability and its removal policy already exist, as do the cross-system contracts in `packages/shared/src/contracts/`.

---

## 1. The rule this phase is judged by

> **Never move money you did not mean to move, and never move it twice.**

Everything below is downstream of that. A fast finance system that double-charges is worse than a slow one that never does.

Two supporting rules already exist and are not re-argued here:

- **Money is `Decimal` in the database and `string` across the API.** A money value arriving in the browser as a JS number is a bug even when it looks right. `MoneySerializationInterceptor` enforces the boundary.
- **Finance never reads Operations' tables directly.** It consumes `ChargeableWorkItem` / `InvoiceCandidate` through published contracts.

### The mistake already made once

In 5.E I summed money with `Number(d.toString())`. It passed review by looking right. `Decimal.add` is exact; `Number` is not, and at invoice scale the difference eventually charges a customer a cent they do not owe.

That is a *class* of error, not an incident, so Phase 8 adds **`tools/lint-money.mjs`** — a fourth linter that fails the build on `Number(`, `parseFloat(`, and bare arithmetic over money-named identifiers inside finance code. A rule I have already broken once is a rule that needs a machine watching it.

---

## 2. Arithmetic, decided explicitly

Both of these are real choices with defensible alternatives, so they are written down rather than left to whoever writes the service.

### Rounding: per line, then sum

Each line is rounded to 2dp, and the invoice total is the **sum of rounded lines** — not the rounded sum of exact lines.

The alternative produces an invoice whose lines visibly do not add up to its total, off by a cent. It is arithmetically defensible and *commercially indefensible*: the customer adds the column themselves, and being told their addition is wrong is how a workshop loses an argument it is technically winning. This matches standard practice — [round at each line, then total the rounded lines](https://docs.evolutionx.io/en/articles/2117376-rounding-and-tax-calculations).

### Order: discount first, then tax

Tax is charged on what the customer actually pays, so the discount comes off before tax is computed. Tax-on-pre-discount exists in some jurisdictions and is [configurable in the big ERPs](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/24d/faiom/apply-tax-before-you-calculate-a-discount.html) for exactly that reason — so the order lives in one named function, not scattered through callers, and can become a policy when a market demands it.

### Rounding mode: half-up

Banker's rounding is better for statistical neutrality across millions of rows. This is a workshop invoice read by one person, and half-up is what a human doing it on paper would produce. Matching the customer's arithmetic beats being neutral in aggregate.

---

## 3. Payments: idempotency is the feature

`Payment.idempotencyKey` is already `@unique` in the schema. The subtle part is what happens on a **key collision**.

| Same key, same amount | Same key, **different** amount |
|---|---|
| Return the original payment. A retry is not a second payment | **Refuse with a conflict.** |

The second is the one that matters. A client reusing a key for a different amount is not retrying — it is confused, or two people are taking money for the same job at once. [Returning the first payment silently in that case hides a real problem](https://medium.com/codeelevation/how-to-design-idempotent-payment-apis-for-reliable-financial-transactions-24513f6420ae) and leaves a customer charged an amount nobody recorded.

**Payments are never edited or deleted.** An over-payment or a mistake is corrected by a *refund*, which is its own record. The invoice's `paid` and `balance` are therefore derived from the payment rows, exactly as inventory fulfilment is derived from issue rows — same reasoning, same refusal to cache a total.

---

## 4. What the capability engine must not break

| Capability off | Must still be true |
|---|---|
| `FINANCE_CORE` | A workshop can run with **no internal finance at all** — it still books cars in, does the work, and hands them back. No invoice is created, and the delivery gates that ask about payment do not exist to block it |
| `BILLING` = `EXTERNAL` | Totals are still computed and shown; the *legal document* is issued elsewhere. `FinanceConfiguration.externalInvoiceReference` records where |

The scenario to keep passing: a workshop with `FINANCE_CORE` disabled must reach `CLOSED`. If it cannot, the capability engine has become decoration.

---

## 5. Pages, and what decides each structure

| Page | Question | Structure, and why |
|---|---|---|
| **Job total** *(inside Work Order Workspace)* | "What does this job cost so far?" | Not its own page. The running total belongs beside the work that produced it; a separate screen makes the manager hold two things in their head |
| **Take payment** | "The customer is standing here with money" | A focused task, like intake. The balance is the largest thing on it, and the method is a choice not a dropdown — a dropdown for four options is a click that buys nothing |
| **Money** *(owner)* | "What is outstanding, and what came in?" | Two lists, split the way Approvals splits: what is owed to us, and what has been received. Different questions, different actions |

Deferred to Phase 9 with reasons, not silently: the legal invoice document, numbering rules, credit notes, and the country adapters. An invoice is a compliance artifact with its own lifecycle, which is why Billing is a separate bounded system.

---

## 6. Tasks

- **8.A** ✅ `tools/lint-money.mjs` — the fourth linter, written before the code it guards
- **8.B** ✅ Money arithmetic in `@mop/shared` — pure, exact, exhaustively tested
- **8.C** ✅ Running total for a job in progress
- **8.D** ✅ Invoice issue, with lines snapshotted immutable
- **8.E** ✅ Payments — idempotent, derived balance. **Refund flow deferred** (see below)
- **8.F** ✅ Finance API + Take Payment page
- **8.G** ✅ Scenario walkthrough — including the finance-off profile reaching CLOSED

### Two honest corrections to this plan

**8.C–8.E landed as one `FinanceService`, not three.** They share a transaction boundary and a single set of invariants; splitting them would have meant three services reaching into each other's tables to answer "what is owed". The name in the plan was aspirational, and one cohesive service is the right shape. If it grows past its current size, the split point is invoicing versus payment.

**Refunds are not built.** The *principle* is enforced — payments are never edited or deleted, `paid` is derived, and an over-payment is reported as money owed back rather than a negative balance. But there is no refund endpoint, no approval flow, and no UI. `RefundRequest` exists in the schema and is untouched.

The reason is that a refund is only half a finance concern: the other half is a **credit note**, which is a Billing artifact with its own numbering and immutability rules. Building the refund side here would mean guessing at the interface Phase 9 needs, and then rewriting it. **Deferred to Phase 9**, recorded here rather than left as a silent gap.

## Exit criteria

1. ✅ Money never becomes a JS number anywhere in finance code — enforced by `lint-money.mjs`, not by review.
2. ✅ Invoice lines visibly add up to the invoice total, to the cent.
3. ✅ The same idempotency key returns the original payment; the same key with a different amount is **refused**.
4. ✅ `paid` and `balance` are derived from payment rows and cached nowhere.
5. ✅ A workshop with `FINANCE_CORE` disabled still drives a work order to `CLOSED`.
6. ✅ Everything green: tests, typecheck, all **four** lint rules, build.

# Phase 9 — Billing / Invoicing

> **Goal:** the legal invoice document, as its own bounded system with a country-adapter seam, plus the refund and credit-note flow Phase 8 deliberately left untouched.
> **Why it matters:** Phase 8 built the money — running balance, payments, idempotency. This phase builds the *document* — the thing a tax authority, a customer's accountant, or a dispute actually looks at. A total that is arithmetically correct and a document that is legally insufficient are two different failures, and this project has already found, twice this session, that assuming they are the same thing is exactly the gap a second-country tenant exposes (`docs/scenarios2/PLATFORM_02_RIYADH_ALSAFWA.md`, scenario 6).
> **Companions:** [`docs/SYSTEMS.md`](../SYSTEMS.md) §"The Billing country adapter" (the interface is already designed, quoted below), [`PHASE_8.md`](./PHASE_8.md) (money is settled; this phase does not reopen it), `docs/phases/PHASE_20.md` §20.D (country-as-a-real-axis, which this phase's compliant-blocked state depends on).

---

## 1. The rule this phase is judged by

> **Finance decides how much. Billing decides whether the document is legally sufficient, and never touches how much.**

Billing is a **separate bounded system**, per this project's own recorded decision (`PROJECT_STATE.md` §5) — not a formatting layer bolted onto `FinanceService.issueInvoice()`. It consumes `InvoiceCandidateCreated` from Finance Core through the published contract already typed in `packages/shared/src/contracts/`, and it must never read Operations' or Finance's tables directly to decide what to invoice, exactly as `SYSTEMS.md` states for every cross-system contract in this codebase.

The reason this separation earns its own phase rather than living inside Phase 8: Egypt's ETA and Saudi Arabia's ZATCA (confirmed as a real, not hypothetical, gap by Workshop 2's scenario 6 this session) make issuing an invoice a multi-step **clearance** process — validate, submit, wait, receive a QR/hash, possibly be rejected and have to resubmit. `FinanceService.issueInvoice()` today issues synchronously, in one transaction, and always succeeds once past validation. Retrofitting an asynchronous, possibly-failing clearance step into that flow later is a rewrite. Building the seam now, even with only a generic adapter behind it, is not.

**A real note on "asynchronous," checked against the actual codebase before writing the rest of this document:** `OperationEventsService.emit()` — this project's only existing event mechanism — writes an `OperationEvent` row and an audit row. It has no subscriber, listener, or dispatch mechanism anywhere; nothing in the codebase currently *reads* an `OperationEvent` to act on it. Building genuine async dispatch (a queue, or NestJS's `EventEmitter2`) is real infrastructure work that belongs to Phase 13, System Automation, which already exists in the roadmap specifically because "the current in-process scheduler double-fires the moment there are two API replicas" — the same class of problem a hand-rolled event consumer would walk straight into. This phase does **not** invent that infrastructure. "Billing consumes `InvoiceCandidateCreated`" means: `FinanceService` constructs the typed contract payload and passes it to `BillingService` through an injected dependency, synchronously, in the same request — module and data boundaries are real (Billing never reads Operations' or Finance's tables directly, only the typed payload it's handed), but the *dispatch* is a direct call, not a queue. Moving it onto a real queue is Phase 13's job, and is named here so the distinction is never silently assumed away.

---

## 2. What already exists, and what this phase actually adds

Phase 8 already built more of this phase's foundation than a first reading suggests. Read before designing anything:

| Already real | Where |
|---|---|
| Invoice numbering, immutability (`locked`, `immutableVersion`), invoice lines with locked prices | `Invoice` / `InvoiceLine`, `finance.service.ts` |
| A real atomic sequence table | `InvoiceSequence` — unused until this session's H3 fix; now the actual source of `invoiceNumber` |
| `RefundRequest`, `CreditNote` | Schema only. `PROJECT_STATE.md` §4 names this explicitly: "Phase 8 built payments but no refund flow, deliberately... `RefundRequest` and `CreditNote` exist in the schema and are untouched" |
| External Billing Mode | `FinanceConfiguration.externalBillingEnabled` / `externalInvoiceReference` — a real capability state, not on/off: totals are still computed, the legal document is issued elsewhere |
| The adapter interface itself | `SYSTEMS.md`, quoted in full below |

So this phase is **not** "build an Invoice model." It is:

1. Give Billing its own module boundary, consuming Finance's invoice-issued event rather than being called synchronously from inside `FinanceService.issueInvoice()`.
2. Build `GenericBillingAdapter`, implementing the interface below, doing the minimum a jurisdiction-agnostic invoice needs.
3. Build the refund and credit-note flow `RefundRequest`/`CreditNote` were created for and never wired.
4. Add the **compliant-blocked** tenant state named in `docs/scenarios2/PLATFORM_02_RIYADH_ALSAFWA.md` (6.2) and `PHASE_20.md` §20.D: a tenant onboarded into a country with no ready adapter must be flagged, never silently allowed to issue a legally-insufficient document.

---

## 3. The adapter seam

Already designed, quoted from `SYSTEMS.md` rather than re-invented:

```ts
interface BillingCountryAdapter {
  validateInvoice(candidate: InvoiceCandidate): BillingValidationResult;
  generateDocument(invoice: InvoiceSnapshot): BillingDocumentArtifact;
  submitForClearance(invoice: InvoiceSnapshot): ClearanceSubmissionResult;
  getClearanceStatus(invoiceId: string): ClearanceStatus;
  generateQr(invoice: InvoiceSnapshot): QrPayload;
  // amount + a sequence number: both missing from the original draft
  // below, found while actually implementing it in Phase 9. A credit
  // note is not always the full invoice, and needs its own numbering.
  generateCreditNote(invoice: InvoiceSnapshot, amount: string, reason: string, creditNoteNumber: string): CreditNoteDocument;
  generateDebitNote(invoice: InvoiceSnapshot, amount: string, reason: string, debitNoteNumber: string): DebitNoteDocument;
}
```

`GenericBillingAdapter` implements every method with jurisdiction-agnostic behavior: `validateInvoice` checks only universal invariants (positive total, a currency, a tenant), `submitForClearance`/`getClearanceStatus` return an immediate synthetic "cleared" result (no real clearance authority to call), `generateQr` returns null rather than a fabricated payload — a document with no QR code is honest; a document with a QR code that encodes nothing a real scanner would recognize is not. `EgyptETAAdapter` and `SaudiZATCAAdapter` are **not built in this phase** — the seam existing and being provably swappable (one integration test running the same invoice through two different adapter instances, asserting the document shape differs but the underlying amounts do not) is the exit criterion for this piece, not a second adapter.

### `BillingDocument` — a new model, not a repurposed `Invoice`

`Invoice` stays Finance's settlement record: the running balance, `paid`, `balance`, and the numbering `InvoiceSequence` produces belong there and do not move. A new `BillingDocument` table, owned by the Billing module, references an `Invoice` by id and carries what is specifically the *document's* concern: which adapter produced it, its clearance status, its QR/hash payload (nullable — the generic adapter has none), and the immutable rendered snapshot (the exact lines, prices and totals at the moment Billing consumed the event — never re-read from `Invoice` later, for the same reason `InvoiceLine.lockedUnitPrice` exists: Finance's own numbers could theoretically be corrected or reinterpreted later, and a legal document must not silently reflect a correction it was never re-issued to record).

This is the concrete reason Billing cannot be "a method on `FinanceService`": it needs its own row, its own lifecycle (`PENDING → CLEARED / REJECTED / CLEARANCE_FAILED`), and its own audit trail distinct from the invoice's.

---

## 4. Refunds and credit notes

Deferred from Phase 8 on purpose (`PHASE_8.md` §6): a refund is only half the concern, and the other half is a credit note, which is a **Billing** artifact with its own numbering and immutability rules, not a Finance one. This phase closes the loop:

1. `RefundRequest` gets a real approval workflow — `PENDING → APPROVED/REJECTED`, decided by someone other than whoever requested it where the tenant's role template requires it (this phase does not build general separation-of-duties machinery; that is Phase 19's, and a refund approval is a natural early candidate for it once 19.A exists, not a reason to block this phase).
2. An **approved** refund triggers `BillingCountryAdapter.generateCreditNote()`, producing a `CreditNote` row referencing the original `BillingDocument`, with its own document number from the same kind of atomic sequence `InvoiceSequence` proved out for invoices.
3. `Invoice.paid`/`balance` are corrected by the refund exactly as a payment corrects them — derived from rows, never edited in place, matching Phase 8's own rule that money is never summed with anything but exact arithmetic and a total is never cached without the rows that produced it.

Debit notes (a charge correction going the other way — undercharged, not overcharged) are named in the adapter interface and are real but rarer; this phase wires the same mechanism through `generateDebitNote()` without inventing a second approval workflow, since the risk profile (the workshop is owed more, not less) does not carry the same dispute weight a refund does.

---

## 5. External Billing Mode

Already a real capability state per `FinanceConfiguration.externalBillingEnabled`. This phase makes Billing respect it explicitly: when true, the Billing module does not create a `BillingDocument` at all on receiving `InvoiceCandidateCreated` — it records that the tenant's own accounting software owns the document, using `externalInvoiceReference`, and the delivery gate (which reads "does an invoice exist," per `SYSTEMS.md`'s note on `invoice.cleared` releasing delivery) is satisfied by the reference being present rather than by a `BillingDocument` row existing. This is not a new decision — it is making an already-decided capability state actually load-bearing in the module this phase builds.

---

## 6. Compliant-blocked

New in this phase, sharpened by this session's platform-layer scenario pass. A tenant can be onboarded (Add Workshop Owner has no country-adapter awareness today) into a country with no ready `BillingCountryAdapter` beyond the generic one. That tenant is **operationally fine** and **legally insufficient** the moment it issues its first invoice, and nothing today tells anyone.

This phase adds a tenant-level flag, distinct from a capability the tenant chose to disable (`docs/scenarios2/PLATFORM_02_RIYADH_ALSAFWA.md`, 6.2, is explicit about this distinction): `compliantBlocked: boolean` on `FinanceConfiguration`, set automatically when a tenant's `country` has no registered adapter beyond generic and the tenant is not in External Billing Mode, surfaced on the Workshops list (a new badge, alongside Builder Status and Health) and checked — not enforced as a hard block in this phase, since MOP is not the tenant's lawyer and a workshop may have its own arrangement — but visible everywhere a super admin or an owner would need to see it before assuming a document is sufficient.

---

## 7. Exit criteria

1. `GenericBillingAdapter` implements every method of `BillingCountryAdapter`; a second, deliberately different test adapter (built only for the test suite, not shipped) proves the seam is real by producing a differently-shaped document from the same `InvoiceSnapshot`.
2. Billing consumes `InvoiceCandidateCreated` through a typed contract call, not by reading Finance's tables directly — a `BillingDocument` is created by `BillingService`, a separate module, never inline inside `FinanceService`'s own class. Genuine queue-based async dispatch is explicitly Phase 13's infrastructure, not invented here.
3. A refund, once approved, produces a real `CreditNote` with its own sequential number, and the invoice's derived `paid`/`balance` reflect it without any column being written by hand.
4. External Billing Mode is respected: no `BillingDocument` is created for a tenant with `externalBillingEnabled: true`, and the delivery gate still passes on `externalInvoiceReference` being present.
5. `compliantBlocked` is computed, stored, and visible on the Workshops list drawer for any tenant whose country has no adapter beyond generic.
6. Every cross-system contract this phase touches (`InvoiceCandidateCreated`, `invoice.issued`, `invoice.cleared`, `invoice.rejected`, `credit_note.issued`) is typed in `packages/shared/src/contracts/`, matching `SYSTEMS.md`'s existing table rather than inventing new event names.
7. A cross-system scenario walkthrough: a work order reaches `CLOSED`, Finance issues the invoice, Billing produces the document, a customer disputes a line, a refund is approved, a credit note is generated — proving the whole chain, not each service in isolation.

**Not in scope for this phase, named rather than silently dropped:** `EgyptETAAdapter`, `SaudiZATCAAdapter`, or any real clearance-authority integration (the seam is proven generic-only); QR code generation beyond a null placeholder; debit-note approval workflow beyond the mechanism itself; hard-blocking a compliant-blocked tenant from issuing (visibility only, this phase).

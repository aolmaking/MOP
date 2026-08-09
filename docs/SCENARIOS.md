# Scenario Matrix

> **What this is:** the situations MOP must handle, each with its branches, terminal states, the systems it touches, how it changes under different capability profiles, and a **schema verdict**.
> **Why it exists:** a page is a projection of scenarios onto a screen. Designing the screen first produces a beautiful page that cannot express what actually happens on a Tuesday — which is how the previous implementation ended up with pages that each worked alone and did not connect.
> **How to use it:** every role phase closes by walking the scenarios that touch it, across every system involved. Not a page checklist.

**Verdict key** — `OK` representable today · `SCHEMA` needs a schema change · `PHASE n` deferred with a named phase.

**Profile shorthand** — `FULL` = everything on · `QUICK` = no inventory, no teams, no QC, single branch · `DIAG` = diagnostics only, no parts · `EXT-BILL` = billing external · `EXT-FIN` = finance external.

---

## 1. Intake and scope

### 1.1 Standard intake
Customer arrives with a complaint. Receptionist finds or creates the customer, finds or registers the asset, confirms ownership, creates the work order, assigns a technician.

*Path:* `DRAFT → REGISTERED → UNDER_INSPECTION`
*Systems:* Operations, People
*Verdict:* **OK**

### 1.2 Customer declines inspection and asks for one named service
"Just change the oil. Don't inspect anything."

*Path:* `REGISTERED → AWAITING_CUSTOMER_APPROVAL` — the inspection step is skipped, not faked. The `inspection_completed` gate must not block a job that was never scoped for inspection.
*Branches:* technician spots a safety issue anyway → raises a fault → new decision request (see 4.2).
*Profiles:* identical everywhere; inspection is core but *scoped*.
*Verdict:* **OK** — transition exists in the work-order graph.
*Note:* the finish gate must treat `inspection_completed` as satisfied when the work order was created with inspection declined. Phase 4 must not implement it as "an inspection row exists".

### 1.3 Customer supplies their own part; workshop fits it only
**The scenario that drove this document.** Customer brings brake pads bought elsewhere and pays for labour only.

*Path:* normal, but the part line has no inventory item, no stock movement, no cost to the workshop, and a labour charge.
*Systems:* Operations → Finance (labour), **not** Inventory.
*Profiles:* `FULL` — coexists with stock parts on the same work order. `DIAG`/`QUICK` — the only kind of part there is.
*Verdict:* **OK** *(resolved in 2.D)* — `WorkOrderPartLine` carries `provenance`, a nullable `inventoryItemId`, zero cost, and `workshopWarranted`. `PartRequest` is left untouched and inventory-only, so a customer-supplied part never needs a fake stock row.
*Liability:* the record must show the customer supplied it. Warranty disputes turn on exactly this, so it is a stored fact, not a note.

### 1.4 Quote only; customer authorises nothing
Inspection performed, prices given, customer declines everything and leaves.

*Path:* `AWAITING_CUSTOMER_APPROVAL → CANCELLED`. The inspection is still billable if the workshop charges for it.
*Verdict:* **OK**

### 1.5 Walk-in with no appointment and no prior record
*Verdict:* **OK** — intake creates customer and asset in one transaction.

### 1.6 Customer rejects a critical safety item and takes the vehicle
Brakes are unsafe; customer refuses the repair.

*Path:* decision recorded as rejected **with acknowledgement**; work order proceeds on the approved items only, or `CANCELLED`.
*Systems:* Operations, Customer Engagement, Governance (audit).
*Profiles:* portal off → acknowledgement recorded at the counter by staff. The `critical_warning_acknowledged` gate is **core** and never dropped — a workshop cannot switch off informed consent.
*Verdict:* **OK**

---

## 2. Asset and ownership

### 2.1 Vehicle arrives under a different owner than the record
*Path:* ownership transfer closes the previous `AssetOwnershipHistory` row and opens a new one.
*Rule:* the new owner sees technical history; the previous owner's financial records stay hidden.
*Verdict:* **OK**

### 2.2 Ownership transfers mid-work-order
Rarer and nastier: the vehicle is sold while in the workshop.

*Question to settle in Phase 4:* who owes the invoice — the owner at intake or at delivery? **Decision: the customer on the work order at intake**, because that is who authorised the work. The asset's owner changes; the work order's customer does not.
*Verdict:* **OK** — `WorkOrder.customerId` is independent of `Asset.currentOwnerCustomerId`.

### 2.3 One customer, many assets; one asset, many open work orders
*Rule:* one work order = one asset. Two concurrent faults on one vehicle are two work orders, or one work order with two tasks — the latter, unless the customer wants them billed separately.
*Verdict:* **OK**

### 2.4 Asset outside the tenant's operating category
A car arrives at a motorcycle-only workshop.

*Verdict:* **OK** — category scope is enforced; the intake is refused with a clear reason rather than silently accepted.

---

## 3. Parts

### 3.1 Part available, normal flow
*Path:* `requested → approved → issued → arrived → received → used`
*Systems:* Operations, Inventory, Finance
*Profiles:* `QUICK`/`DIAG` — this entire flow does not exist; `PartRequest` is never created.
*Verdict:* **OK**

### 3.2 Part unavailable → supplier order
*Branches:* customer waits · customer accepts a substitute · customer cancels.
*Customer sees:* "We are waiting for a required part" — never the supplier's name or the order.
*Verdict:* **OK**

### 3.3 Part arrives damaged
*Path:* return accepted **as damaged** — increments a damaged bucket, never sellable stock.
*Verdict:* **OK**

### 3.4 Wrong part issued and used before anyone notices
The genuinely awkward one: stock and the invoice are both already wrong.

*Path:* reversal must be an explicit, audited correction — never a silent edit. Stock adjusts with a movement row stating the reason; the invoice, if issued, corrects via credit note.
*Verdict:* **OK** for stock. Invoice correction is **PHASE 9**.

### 3.5 Partial fulfilment — 3 requested, 2 issued
*Verdict:* ✅ **OK — resolved in Phase 7.A.**

A *single* short issue was always expressible (`PartRequest.quantity` is the ask, `IssuedItem.quantity` is the hand-over). Issuing the **remainder later** was not, because `IssuedItem.partRequestId` was unique.

Settled by dropping that constraint: **one request, many issue rows.** The alternative — splitting the request in two — was rejected because it invents a record the technician never created, and splits one part into two lines on the customer's invoice.

Fulfilment is now **derived**, never stored: `requested` on the request, `issued` as `SUM(IssuedItem.quantity)`. Caching that sum would create a second source of truth. Proven by `apps/api/src/inventory/partial-fulfilment.integration.spec.ts` — 3 requested, 2 issued, 1 issued later, one invoice line. Full reasoning in [`PHASE_7.md`](phases/PHASE_7.md) §2.

### 3.6 Technician finishes with a received part neither used nor returned
*Path:* Finish Gate blocks on `parts.received_used_or_returned`.
*Profiles:* inventory off → that gate does not exist, so it cannot block. This is the exact case the capability engine exists to get right.
*Verdict:* **OK** — covered by a passing test.

---

## 4. Execution

### 4.1 Technician goes off shift mid-job
*Path:* reassignment preserves the task and its history; the new technician sees what was done.
*Verdict:* **OK** — `TaskAssignment` is time-ranged.

### 4.2 Second, unrelated fault found mid-work
Approved job in progress; technician finds something else.

*Path:* new fault → new decision request → approved items append to the same work order. The work order does **not** return to `UNDER_INSPECTION`.
*Verdict:* **OK**

### 4.3 Work order cancelled after parts issued but before work started
*Path:* issued parts must be returned before the work order can close. Cancellation does not bypass the return.
*Verdict:* **OK**

### 4.4 Rework after QC failure
*Path:* `READY_FOR_QC → QC_FAILED → IN_PROGRESS`
*Profiles:* QC off → those states are unreachable; finish routes onward directly.
*Verdict:* **OK**

### 4.5 Vehicle undrivable and blocking a bay
*Verdict:* **PHASE 4** — a blocker reason exists; bay/space management is not modelled and is out of scope for now. Recorded so it is a decision, not an oversight.

---

## 5. Money

### 5.1 Approved price versus a changed catalogue price
Catalogue price rises after the customer approved.

*Rule:* the approved price wins, always. `approvedUnitPrice` is snapshotted on the chargeable item.
*Verdict:* **OK**

### 5.2 Customer disputes the invoice after work is complete
*Path:* no invoice edit exists. Correction is a credit note.
*Verdict:* **PHASE 9**

### 5.3 Partial payment, delivery under a policy that allows it
*Verdict:* **OK** — `FinanceConfiguration.allowPartialPaidDelivery`.

### 5.4 Refund after delivery
*Verdict:* **PHASE 8/9**

### 5.5 Invoice cleared by a government portal
*Path:* `issued → clearance pending → cleared`. Delivery must wait for **cleared**, not merely issued, in a clearance jurisdiction.
*Branches:* clearance rejected → invoice not legally valid → must be corrected and resubmitted.
*Verdict:* **PHASE 9** — contract already carries `clearanceStatus`.

### 5.6 Workshop issues invoices from external accounting software
*Profiles:* `EXT-BILL`. MOP keeps pricing, payments and balances; an external invoice reference is recorded.
*Verdict:* **OK** *(resolved in 2.D)* — `FinanceConfiguration.externalBillingEnabled` and `externalInvoiceReference`, so delivery can still be gated on an invoice existing even though MOP did not produce it.

---

## 6. Platform and governance

### 6.1 Tenant frozen mid-work-order
*Path:* sessions revoked immediately; data preserved; work orders stay exactly where they were.
*Verdict:* **OK** — freeze revokes sessions in the same transaction as the status change.

### 6.2 Capability disabled while records are in flight
Team Review removed while 14 work orders sit in `READY_FOR_TEAM_REVIEW`.

*Path:* validation reports the count in the impact preview; apply migrates them forward in one transaction.
*Verdict:* **PHASE 3** — the reachability half is built and tested; live-data preconditions need the database.

### 6.3 Plan downgraded below current usage
Workshop has 5 branches; new plan allows 3.

*Rule:* existing records are never deleted. The workshop becomes read-only over the excess until it resolves the overage.
*Verdict:* **PHASE 3**

### 6.4 Two tenants, identical plate numbers
*Verdict:* **OK** — plate uniqueness is per tenant; the adversarial isolation test should cover this specific case.

---

## Schema changes required (Task 2.D)

| # | Change | Driven by |
|---|---|---|
| # | Change | Driven by | State |
|---|---|---|---|
| 1 | `WorkOrderPartLine` with `PartProvenance`, nullable `inventoryItemId`, zero cost, `workshopWarranted` | 1.3 | ✅ applied in 2.D |
| 2 | External billing reference on `FinanceConfiguration` | 5.6 | ✅ applied in 2.D |
| 3 | Multiple partial issues against one `PartRequest` | 3.5 | ✅ **Done (Phase 7.A).** The unique constraint on `IssuedItem.partRequestId` was dropped: one request, many issues. Fulfilment is derived (`requested` vs `SUM(issued)`), never stored. Reasoning in PHASE_7.md §2 |
| 4 | `TenantCapability`, time-ranged | Phase 3 capability history | ⏸ Phase 3, where its writers exist |

The 2.D migration is **purely additive** — no `DROP` statements — so it applies to a populated database without data loss and can be rolled forward from rather than reversed.

---

## Coverage note

This is not the complete list and is not claimed to be. It covers the families named in the canonical spec plus the ones found by working through the capability model, and it is the standing home for scenarios discovered later. **Adding a scenario here is cheaper than discovering it in a role page**, which is the entire argument for the document existing before the pages do.

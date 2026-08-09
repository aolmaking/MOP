# Phase 7 — Inventory

> **Goal:** the parts system — catalog, stock across warehouses, the part request lifecycle, returns, and a movements ledger that can always answer *why is the number what it is*.
> **Why it matters:** this is the first phase where the system holds something with a **cost**. A wrong number here becomes a wrong invoice, and a wrong invoice reaches a customer.
> **Companions:** [`DESIGN_LANGUAGE.md`](../DESIGN_LANGUAGE.md) §7.5 — structure is decided per page and argued here. `PART_REQUEST_GRAPH` and the `INVENTORY` / `PART_RETURNS` / `EXTERNAL_PARTS` capabilities already exist and are built **on**, not around.

---

## 1. The person, before the pages

The inventory manager is the third role and is unlike the first two.

They sit down. They work in **long focused sessions** processing many similar rows — approve eleven requests, issue nine parts, receive a delivery, reconcile a count. They are not interrupted the way a branch manager is, and not standing the way a technician is.

For them **density is the feature**. Scrolling is the cost, and a screen that shows twelve rows where it could show thirty makes their whole day longer.

Two things they are accountable for, which nothing else in the product is:

1. **The number is right.** Stock is a claim about physical objects in a room. When the claim and the room disagree, they are the one who has to explain it.
2. **Nobody is waiting on them without knowing why.** A technician standing at a car with an unapproved request is idle, and the cost is immediate.

### The rule this phase is judged by

> **Every number on every screen can be traced to the movements that produced it.**

No screen may show a stock figure it cannot explain. This is why `StockMovement` carries `beforeQty` and `afterQty` rather than just a delta — a ledger you cannot replay is a rumour.

---

## 2. The deferred decision, settled

`SCENARIOS.md` 3.5 has been open since Phase 2: **three requested, two issued, and the remaining one issued later.** `IssuedItem.partRequestId` is `@unique`, so one request can only ever have one issue row, and the remainder cannot be expressed.

Two options were left open. The decision is:

> **Drop the unique constraint. One `PartRequest`, many `IssuedItem` rows.**
> The request is what was *asked for*; the issues are what was *actually handed over*, and there can be several.

Rejected alternative: splitting the request into two requests. It is worse for three reasons.

- **It invents records the technician never created.** They asked for three of a thing, once. Showing them two requests they did not make, to describe one thing they did, makes the screen disagree with their memory.
- **It breaks the link to the work order line.** `WorkOrderPartLine` hangs off the request; splitting the request splits the charge, and the customer's invoice starts showing two lines for one part.
- **It contradicts the ledger.** `StockMovement` already records each physical movement separately. Two hand-overs are two movements either way, so the issue table should mirror the ledger rather than fight it.

This matches how order-management systems handle partial fulfilment generally: [multiple fulfilment records against one logical line](https://learn.microsoft.com/en-us/dynamics365/intelligent-order-management/fulfillment-entity-relationships), reconciled by comparing quantities.

**Consequence to hold onto:** fulfilment becomes *derived*, never stored. `requested` is on the request; `issued` is `SUM(IssuedItem.quantity)`. Nothing may cache that sum in a column, because a cached total is a second source of truth and the two will eventually disagree.

The migration is additive — dropping a unique index removes a restriction, so it applies to a populated database without touching a row.

---

## 3. Pages, and what decides each structure

| Page | Question | Structure, and why |
|---|---|---|
| **Requests** | "Who is waiting on me?" | A dense queue, oldest first, with approve/issue **on the row**. The technician is idle while this sits, so opening a page to approve would be the cost, not the click |
| **Stock** | "What do we have, and where?" | A table, one row per item, columns per warehouse. This is the one page in the product where a table is genuinely right: the values *are* comparable across rows and down columns, which is exactly what a table asserts |
| **Item** | "Why is this number what it is?" | Balance at the top, movements ledger below. The ledger is the page — the balance is just its last line |
| **Receiving** | "A delivery arrived" | A focused task with a clear start and end, like intake. Damaged goes to its own bucket and never to sellable stock |
| **Returns** | "This came back" | Its own surface because accepting a return is a decision with a cost, not a data entry |

**Stock uses a table and the Attention Center does not**, and that is not inconsistency. A table asserts that its cells are comparable; for stock-by-warehouse they are, and for "reasons a job is stuck" they are not. The rule from §7.5 is that structure follows the job, and this is that rule producing a different answer.

### What the research changes

Real-time counts must [split open, reserved and damaged](https://uitop.design/blog/designing-order-management-and-inventory-systems/) rather than showing one number — the schema already does this, and the UI must not flatten it back into a single figure. Warnings about a stock gap belong **before** the save, not after it, for the same reason the technician's Finish Gate is shown before the press.

---

## 4. What must not break

The capability engine is not decoration here, and Phase 7 is where it gets tested hardest.

| Capability off | Must still be true |
|---|---|
| `INVENTORY` | `PartRequest` is never created at all — not created-and-stranded. A job still finishes; the parts gates do not exist to block it |
| `PART_RETURNS` | A received part can still be *used*. Only the return path disappears, and the gate that owns it dies with it |
| `EXTERNAL_PARTS` | A customer bringing their own part is still expressible via `WorkOrderPartLine` + `PartProvenance` — the founding scenario, which must not require an inventory |

`SCENARIOS.md` 3.6 is the one to keep passing: a technician finishing with a received part neither used nor returned is blocked by `parts.received_used_or_returned` — **and is not blocked when inventory is off**, because the gate does not exist there.

---

## 5. Tasks

- **7.A** Schema: drop the `IssuedItem.partRequestId` unique constraint; derive fulfilment
- **7.B** Stock service — balances, movements, and the invariants that keep them honest
- **7.C** Part request lifecycle service — request → approve → issue → arrive → receive → use, on `PART_REQUEST_GRAPH`
- **7.D** Returns and damaged stock
- **7.E** Inventory API + `InventoryShell`
- **7.F** Requests queue and Stock table
- **7.G** Item page with the movements ledger
- **7.H** Scenario walkthrough — 3.1 through 3.6, including partial fulfilment and the inventory-off profile

## Exit criteria

1. Every stock figure on every screen is reproducible from its movements — asserted by a test that replays the ledger and compares.
2. Partial fulfilment (3.5) works end to end: 3 requested, 2 issued, 1 issued later, with one request and one invoice line.
3. Stock can never go negative, and the constraint is enforced in the database, not only in service code.
4. A workshop with `INVENTORY` disabled still finishes a job, and never creates a `PartRequest`.
5. Damaged stock never enters sellable stock.
6. Everything green: tests, typecheck, all three lint rules, build.

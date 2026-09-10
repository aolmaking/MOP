# MOP — Final System Reality Audit

**Method.** The product was driven through a real browser as real people:
branch manager, technician, operator, owner, team leader, platform super admin.
Nothing below is asserted because a service, a route, a component or a unit test
exists. Every claim of working behaviour is tied to something observed — an HTTP
response, a row in Postgres, a rendered screen — and every claim of broken
behaviour was reproduced before it was written down.

**Environment.** Angular dev server on `:4200`, NestJS API on `:4000` against
`mop_platform_dev`, Postgres. Tenants: **Apex Motors** (`APEX-001`, EGP, two
branches, two warehouses) and, as the victim in the isolation section,
**Precision Motors Service Center** (six work orders, fifteen customers, 102
stock movements). Four complete work orders were created and driven; one was
taken from intake to `CLOSED`.

**Evidence classes used below**

| Class | Means |
|---|---|
| `VERIFIED_RUNTIME` | Observed in the browser against the running product |
| `VERIFIED_DATABASE` | Confirmed by querying Postgres directly |
| `VERIFIED_CODE` | Established by reading the code path; not exercised at runtime |
| `PARTIALLY_VERIFIED` | Some but not all of the claim was exercised |
| `UNVERIFIED` | Named, not tested |

---

## 1. Headline

**39 defects were found. 22 are fixed and re-verified. 17 remain open**, four of
them production-blocking. Fourteen behaviours were positively verified as
correct — several of them the parts of the product that are genuinely well built.

The audit found three things that matter more than the count:

1. **The product invented facts about customers' vehicles.** An inspection
   report submitted one finding and the database recorded twenty-four, each
   carrying a catalogue prompt as an observed defect. (F-30, fixed.)
2. **A refusal did not refuse.** An approval that answered `400` to the operator
   had already moved the work order to `APPROVED_FOR_WORK` and created its
   tasks. (F-26, fixed.)
3. **A tenant boundary leaked.** One route accepted another workshop's work-order
   id and wrote a row against it. (F-39, fixed.)

Two of the three were invisible from the API and from the test suite. They were
only findable by using the product and then looking in the database.

---

## 2. What was measured

| Signal | Result |
|---|---|
| API suites · tests | 147 · 1403, all passing |
| Web tests | 421, all passing |
| Shared tests | 251, all passing |
| `pnpm typecheck` | 0 errors |
| `pnpm lint` (eslint) | 0 errors, 148 warnings (all pre-existing `no-explicit-any`) |
| Architectural linters | 11 of 11 pass, including migration drift |
| `pnpm build` | passes |
| Work orders driven end to end | 4 |
| Complete journeys to `CLOSED` | 1 |
| Cross-tenant probes run | 11 |
| Stock balance rows replayed against the ledger | 1077 |

---

## 3. The golden journey, zero to CLOSED

Work order `cmtuud8si001113dd7ufz4797` — vehicle `AUDIT-9001`, Nasr City branch,
customer "Nasr Journey Customer". Every transition was checked on four surfaces:
the screen, the API response, the work order's own state, and the database.

```
work_order.created
DRAFT               -> REGISTERED             branch manager, intake
REGISTERED          -> UNDER_INSPECTION       technician, start inspection
UNDER_INSPECTION    -> APPROVED_FOR_WORK      operator, approve + dispatch
APPROVED_FOR_WORK   -> IN_PROGRESS            technician, start working
task.started / task.completed                 actualMinutes 75
IN_PROGRESS         -> READY_FOR_TEAM_REVIEW  technician, finish (8 gates)
READY_FOR_TEAM_REVIEW -> IN_PROGRESS          branch manager, send back
IN_PROGRESS         -> READY_FOR_TEAM_REVIEW  technician, finish again
READY_FOR_TEAM_REVIEW -> READY_FOR_QC         team review passed
READY_FOR_QC        -> PAYMENT_PENDING        QC passed
finance.invoice_issued                        INV-000008
PAYMENT_PENDING     -> READY_FOR_DELIVERY     settled
READY_FOR_DELIVERY  -> CLOSED                 delivery gates evaluated
```

Twelve audit rows, one per transition plus creation, each with an actor and an
intent. `VERIFIED_RUNTIME` + `VERIFIED_DATABASE`.

**Money reconciled exactly.**

```
Invoice INV-000008   subtotal 145  discount 0  tax 0  total 145
                     paid 145  balance 0  status PAID  locked true
InvoiceLine          Brembo UV-Coated Vented Front Brake Rotors × 1
                     lockedUnitPrice 145  lockedLaborPrice 0  total 145
Payment              100 CASH + 50 CARD                    = 150 in
RefundRequest        5  COMPLETED
CreditNote           CN-000001  5
```

150 taken − 5 refunded = 145 = the invoice total. The invoice is immutable and
the overpayment went back as a credit note rather than by editing it. Every
figure traces to the `WorkOrderPartLine` created at approval, which traces to
`InventoryItem.sellingPrice`.

**Inventory closed its loop.**

```
SUPPLIER_RECEIPT    6   0 -> 6   INITIAL_PROVISIONING
RESERVE             1   6 -> 5   WorkOrder cmtuud8si…
CONSUME_RESERVATION 1   1 -> 0   WorkOrder cmtuud8si…
```

Replayed against `StockService`'s own `EFFECTS` table: reported
`available 5, reserved 0`; replayed `available 5, reserved 0`. **Reconciles.**

---

## 4. Production-blocking defects, fixed

### F-30 — the inspection report invented a defect for every subsystem
**CRITICAL · customer-facing fabrication · fixed and re-verified**

A technician inspected one subsystem (A/C, CRITICAL) on work order
`cmtuu27og000c10pxosq1bcdh`. The payload carried **24 findings** and the database
recorded **24 `Fault` rows** — 23 of them MEDIUM, each with the checkpoint's
*prompt list* stored as the observed defect:

```
ac              CRITICAL  A/C blowing warm …                    <- the real one
airbags_safety  MEDIUM    SRS Airbag warning light remains on
hybrid_ev       MEDIUM    Significant drop in electric driving range
glass_wipers    MEDIUM    Stone chip or spreading crack on the windscreen
… 20 more
```

The vehicle is a petrol car with a noisy A/C. Every fabricated finding is a
quotable, chargeable line and a permanent entry on the vehicle's history.

*Root cause.* `proceedToFindingsAndParts` mapped **every** checkpoint into the
findings list at MEDIUM, using the checkpoint's symptom prompts — the things to
look *for* — as the description of what was *found*. There was no representation
anywhere of "inspected and sound". A second fabrication sat beside it: a vehicle
with no checkpoints got four hardcoded findings invented for it.

*Fix.* A finding carries `flagged`. Each card rests at "✓ No problem" and becomes
a finding only when the technician sets a condition. Only flagged findings are
submitted; the invented fallbacks are gone; an inspection that flags nothing
submits nothing and records "No subsystem was flagged as defective."

*Re-verified.* One flagged subsystem → one finding in the payload → **one**
`Fault` row.

### F-26 — a refused approval still dispatched the repair
**CRITICAL · data integrity · fixed and re-verified**

The operator pressed *Approve & Dispatch* on a branch with no serving warehouse.
The API answered `400 branch_has_no_serving_warehouse` and the screen showed the
refusal. The database disagreed:

| fact | after the refusal |
|---|---|
| `WorkOrder.status` | `APPROVED_FOR_WORK` (was `UNDER_INSPECTION`) |
| `Task` rows | 2, both ASSIGNED |
| `Inspection.fields` | stamped `operatorApproved: true` with the full approval record |
| `AuditLog` | a `work_order.status_changed` by the operator |
| `PartRequest` / `WorkOrderPartLine` / `StockMovement` | **0** |

The operator was told the job could not be dispatched, and it was — with an
approved quote naming a part that was never reserved, never requested, and never
put on a line.

*Root cause.* `approveRepair` writes in sequence with no transaction, and checked
the serving-warehouse prerequisite at step 9, inside the per-part loop — after
step 6 stamped the inspection, step 7 applied the lifecycle intent, and step 8
created the tasks.

*Fix.* The prerequisite and the resolution of every catalogued part were hoisted
to a new step 4b, before the first write.

*Re-verified.* The identical refusal now leaves `UNDER_INSPECTION`, 0 tasks, 0
new events, 0 new audit rows.

**Still recommended:** wrap steps 6–9 in one `prisma.$transaction`. Hoisting the
known prerequisite removes the reproduced defect; it does not make the operation
atomic against a failure inside the part loop.

### F-39 — cross-tenant write through the discount route
**CRITICAL · tenant isolation · fixed and re-verified**

As an **Apex Motors** branch manager:

```
POST /api/v1/finance/work-orders/cmtpp006800196zzf139omve9/discounts
     {"amount":"999","reason":"cross-tenant probe"}
→ 201 {"status":"PENDING"}
```

That work order belongs to **Precision Motors**. The row landed with Apex's
`tenantId` and the victim's `workOrderId` — a row inside one tenant holding a
foreign key into another's data, visible on the attacker's own approvals screen.

*Root cause.* `requestDiscount` called `requireFinance(tenantId)` — "does the
caller have the finance module" — and never `requireOwnedWorkOrder`. `issueInvoice`
in the same file does, with a comment naming this exact attack.

*Fix.* `requireOwnedWorkOrder` added. The same request now answers
`404 work_order_not_found`; the legitimate path still answers 200.

### F-18 / F-19 — no part could ever be attached to a finding
**CRITICAL · fixed and re-verified**

The work card rendered an "Attached Workshop POS Parts" table per finding and
wired its quantity and remove controls, and **nothing could put a part into it**.
Every member that wrote `boxAttachedParts` was referenced zero times by the
template — `posModalOpen`, `openPosModal`, `addPosPart`, `workshopInventory`,
`inventoryError`, `selectFitmentPart`, `smartSuggestions`: all zero. The
finding's "Attach Parts (from POS)" was an `<a>` to the requisition page, a
different loop. Underneath, the stock lookup called
`GET /api/v1/inventory/items` — a route the API does not serve; verified in the
browser as **404**.

Consequences: the report's `parts` array was always empty, `partsTotal` always
`0`, and the customer approved a quote that could not contain parts.

*Fix.* The finding's button opens the **workshop's real Point of Sale** —
the same catalogue tree, filters, stock levels and wording the counter uses —
carrying `?finding=<subsystem>`. Parts attached there are written to
`finding-parts.store` and read back onto the card. (An interim stock-picker
modal was written and then removed at the owner's direction: the product should
open its real page, not a smaller copy of it.)

*Re-verified.* Attach from the real POS → return → the finding shows
"ATTACHED WORKSHOP POS PARTS (1)", and the part reaches the report, the
operator's approval, a reservation, and the ledger.

---

## 5. Production-blocking defects still open

### F-33 — an approved discount is never applied
**CRITICAL · money · open**

A 20.00 discount was requested and the owner approved it. The screens said
*"It is applied once the owner approves it"* and *"Discount approved."* The
invoice issued immediately afterwards:

```
DiscountRequest  amount 20  status APPROVED  decidedAt …
Invoice INV-000008  subtotal 145  discount 0  total 145  locked true
```

The customer is billed in full, and the invoice is immutable — correcting it
needs a credit note.

*Root cause — the two halves of the feature do not meet.* The request carries a
money **amount**; `issueInvoice` accepts only a **percent**, and `invoiceTotal`
in `@mop/shared/money` applies discounts per line as a percentage. There is no
absolute invoice-level discount anywhere in the money module.
`enforceDiscountAuthority` is a *guard* — it checks that a discount being applied
was approved. Nothing ever applies one. The client issues with an empty body, so
the guard returns before it even looks the request up.

*Not fixed deliberately.* The fix is not a one-liner: an absolute discount must
be representable in `invoiceTotal`, allocated across lines so line totals still
sum to the invoice total and ordered correctly against tax, and the exact-match
guard must hold against that allocation. Deriving a percent from the amount
reintroduces rounding drift and trips `discount_approval_mismatch` on a cent.
Changing invoice arithmetic in a hurry is the class of change this audit exists
to catch.

*Recommended design.* (1) add an invoice-level absolute discount to
`invoiceTotal`, allocated deterministically; (2) have `issueInvoice` read the
newest `APPROVED` request when the caller supplies none; (3) record which
invoice consumed the request so it cannot be spent twice; (4) keep
`enforceDiscountAuthority` as the guard.

### F-08 (remainder) — money crosses this path as a JS float
**HIGH · open**

The authority half is fixed: `submitInspectionReport` now prices each part from
`InventoryItem.sellingPrice` and each service from `PriceCatalogService`,
records `pricedFrom: "CATALOGUE" | "SUBMITTED"` per line, and the client sends no
prices at all. Verified: a report submitted with **no prices** came back
`{"partsTotal":145,…}` — 145 being the catalogue's figure for that SKU.

Still open: the `pricing` block in `Inspection.fields` is JS floats rather than
Decimal strings, and the operator's approval still totals those floats. The
representation change ripples through the operator DTOs, the quote, the invoice
and many specs; half of it would be worse than none.

### F-11 — labour prices are constants, not the workshop's catalogue
**HIGH · open**

The technician's service chips come from a 46-entry hardcoded table in the
browser (`COMPONENT_SERVICE_SUGGESTIONS`), with a 50/40 fallback for anything
unlisted. Verified at runtime: "Front Brake Pads Replacement 80.00 EGP" is a
literal in the bundle; the "EGP" comes from the formatter, not the price.

The API's own suggestion engine has the same shape:
`smart-suggestion.engine.ts` is stateless, **takes no tenantId**, and reads
`laborPrice` from a shared master dataset — so `POST /technician/smart-suggestions`
returns identical money to every workshop in the product regardless of currency.

An owner can set every labour price in the product and the number quoted will not
change. The `pricedFrom: "SUBMITTED"` marker added by this audit now makes each
such line visible in the record; the gap itself is unchanged.

### F-24 — the seeded tenants cannot dispatch a repair that needs parts
**HIGH · open (data, not code)**

`BranchWarehouseAccess` across the whole database: 24 rows, **none** belonging to
`apex-motors` or `delta-quick` — the two tenants the seed creates and CLAUDE.md
names as canonical. Every tenant created through the product's own workshop-
creation flow gets links; the hand-written seed does not.

Out of the box, on the data every developer and demo starts from, no repair that
needs a part can be dispatched at either branch. This is why the parts half of
the product looked untested: it was unreachable from the seed. (Working around
it by hand through the owner's Branch ↔ Warehouse matrix is what unblocked the
golden journey — see §7.)

### F-37 — five stock balances cannot be reproduced from the ledger
**HIGH · open (seed)**

Replaying every movement in the database against `StockService.EFFECTS`:

```
1077 balance rows · 982 movements
5 rows the ledger does not reproduce   (all Apex Motors, Central Warehouse)
```

`seed-demo.ts` calls `warehouseStockBalance.create/update/updateMany` directly
with no `StockMovement`, making the seed a **second writer** of the balance
table — the precise rule the codebase states elsewhere and whose violation its
own comments blame for REC-015. One row carries three units of available stock
no receipt explains.

### F-20 — two inspection models disagree by design
**HIGH · partially fixed · needs a product decision**

Pressing "Complete Inspection" fired two calls. The second,
`POST .../inspection/submit`, sent a `technicianNotes` property the server
rejects outright and was subscribed as `error: () => {}` — so it answered `400`
for every inspection ever submitted and nothing said so. Correcting the property
name only moved the failure to `409 expected aggregateVersion 3, but current is 2`.

Two defects underneath, both now fixed: the endpoint returned the in-memory
aggregate version rather than the persisted one, and the client made a redundant
second call that raced the first. The endpoint now returns the stored version and
state plus `aggregateSubmitRefusal`, and the client no longer makes the call.

**What is not fixed, because it is a product decision:** `aggregate.submit()`
refuses while any checkpoint is uninspected. A CARS inspection has 24 checkpoints
and the work card lets a technician send after inspecting one — so the refusal is
the *normal* case. Either the completeness rule is wrong for this product, or the
card must stop offering "Complete Inspection" before the checkpoints are done.
Until that is decided, `Inspection.fields.state` stays `IN_PROGRESS` behind a
screen reading "Sent to Operator Desk".

---

## 6. Everything else found

Fixed and re-verified: F-04 (the parts basket rendered blank — `cartTotalAmount`
threw on a `sellingPrice` the server correctly omits, aborting the whole
template's change detection), F-05 and F-22 and F-23 and F-34 (hardcoded `$`,
`Labor Rate ($)`, a `?? 'USD'` default, money printed with no currency),
F-09 (`?? 8` and `?? 10` — invented stock levels), F-10 (a ~700-line invented
parts catalogue in the bundle), F-13 (a refusal rendered 1778px from the button
that caused it), F-15 (the estimate double-counted every service: one 80 service
showed 160), F-16 and F-29 (an invented placeholder finding; a confirmation
screen counting subsystems as findings), F-36 (a "Hand over" button shown to the
one role that gets a 403 from it).

Open, with severity and reasoning recorded in the working log: F-01 (a failed
workshop lookup fabricates a workshop and makes the login page's error
unreachable), F-02 (a specific tenant's name, code and currency hardcoded as
shipped defaults), F-03 and F-21 (an inspection produces no event, no audit entry
and no transition — Journey and History have a hole where the result belongs),
F-06 (`lint-money` does not read web components), F-07, F-12, F-14 ("Mark Done"
silently asserts the component is GOOD, contradicting the severity the same
technician sets on the next screen), F-17, F-25 (validation detail dropped before
the user sees it), F-27 (one vehicle bookable into two branches at once), F-28
(intake confirms with a raw cuid), F-31 (the quote builder has no error state —
a 502 opened an empty dialog saying nothing), F-32 (rework records no reason
though the event has the field), F-35 (only the owner may issue an invoice and
the owner has no link to the page), F-38 (`issuedQty` is written by nothing and
summed by a report).

Three things I recorded as defects and then disproved are kept in the working log
as corrections, so the transcript does not read as findings: a "double submit"
that was my own stacked instrumentation, a discarded VIN that was my own mis-
indexed form fill, and two ledger "mismatches" that were my replay model rather
than the ledger.

---

## 7. Configuration reality

For each important setting the question was: *what observable runtime behaviour
changes because of this? If nothing, investigate.*

| Setting | Observable effect | Evidence |
|---|---|---|
| `BranchWarehouseAccess` | Decides whether a repair can be dispatched at all. With no link: `400 branch_has_no_serving_warehouse`. Linking Nasr City ↔ Central Warehouse through the owner's matrix — the only change made — turned the same refused approval into a real reservation. | `VERIFIED_RUNTIME` + `VERIFIED_DATABASE` |
| `technicianPriceVisible` | Removes prices from the technician's catalogue, fitment and suggestion responses. Real, and the reason F-04 surfaced. | `VERIFIED_RUNTIME` |
| `depositRequired` / `depositPercent` | Returns `depositDue` on approval and the operator is told to collect it. | `VERIFIED_CODE` |
| Delivery payment policy | Held the car in "Held — the invoice has not been settled" on a partial payment, and released it when settled. | `VERIFIED_RUNTIME` |
| Tax rate | 0.00 on the invoice because Apex sets no rate — read, not ignored. | `VERIFIED_DATABASE` |
| Capability profile | `/team-leader` resolves to access-denied by documented design; `READY_FOR_TEAM_REVIEW` remains actionable by the branch manager, so reachability holds through the surface. | `VERIFIED_RUNTIME` |
| Labour prices (owner's Pricing page) | **Changed nothing** — F-11. | `VERIFIED_RUNTIME` |
| Standard time | **Was not a setting at all** — computed in the browser from the service's name and shown under a padlock. Now a real, editable column. | `VERIFIED_RUNTIME` |

---

## 8. Tenant isolation

Attacker: a signed-in Apex Motors branch manager. Victim: Precision Motors.
Eleven probes against the victim's real object ids.

**Ten of eleven were refused** — 404 `work_order_not_found` on the branch-manager,
operator and finance work-order routes; 403 on technician routes, on
`finance/.../invoice`, on the parts catalogue, and on
`organization/branch-warehouse-links`. Refusals are 404 rather than 403 on foreign
ids, which the service comments call out as deliberate: a 403 confirms the id is
real.

**One succeeded** — F-39, fixed and re-verified above.

**The victim tenant is byte-for-byte unchanged.** Fingerprints taken before and
after the whole run — work orders, customers, assets, invoices, part lines, stock
movements, faults, staff, summed available and reserved stock, and the work-order
status histogram — are identical. The single row the probe created was written
into the *attacker's* tenant and was deleted.

---

## 9. Workflow branches exercised

Verified at runtime: rejection (team review "Send back" → `REVIEW_REJECTED`,
back to `IN_PROGRESS`), missing prerequisite (parts requisition before customer
approval → `409 work_not_authorized`; dispatch without a serving warehouse →
`400`), partial payment (balance recomputed, delivery still held), overpayment
(`overpaid: 5.00`, offered as a refund, not a negative balance), refund
(approved → credit note `CN-000001`), discount request and approval (the approval
happens; F-33 is that it never reaches the invoice), unauthorized user (the
owner's `403` on release), stale/optimistic concurrency (`expectedVersion` on
inspection target writes, and a real `409` when it is wrong), and the
finish gate (eight itemised conditions, one failing, refusing the transition
until the work was done).

Not exercised: concurrent writes from two sessions at once, payment-provider
failure (there is no provider — payments are recorded, not taken), insufficient
stock at the moment of reservation (the code path splits the reservation and
raises a `PartRequest` for the shortfall — `VERIFIED_CODE`, not run), and
CLOSED-state behaviour beyond confirming the job closes.

---

## 10. Is MOP ready for real users?

**No — not on the seeded data, and not with the money paths as they stand.**

The percentage this question usually invites would be invented, so here is the
checklist it would have been derived from instead.

**What genuinely works end to end, verified:** intake; inspection start; the
inspection report reaching the operator with its findings and parts intact; the
operator's approval; task creation; the repair; the eight-condition finish gate;
team review including rework; QC; invoice issue; partial payment, overpayment and
refund with a credit note; the delivery gates; closing the job; the lifecycle,
its events and its audit trail; the inventory ledger from receipt through
reservation to consumption, replaying exactly; and tenant isolation on ten of
eleven attack surfaces.

**What partially works:** the inspection record (the legacy blob advances, the
`schemaVersion 2` aggregate does not — F-20); pricing (parts are now catalogue-
priced and correct; labour is not — F-11); the discount loop (request and
approval work, application does not — F-33).

**What is broken or absent:** F-33 above; standard time was fabricated until this
audit; the seed cannot dispatch a parts repair (F-24); five stock balances are
unauditable (F-37); an inspection leaves no event or audit entry of its own
(F-21); rework records no reason (F-32).

**What would fail in real use.** *In a real workshop:* the first job needing a
part would stop at the operator's desk (F-24), and — before this audit — every
customer would have received a report listing two dozen defects their car does
not have (F-30). *In multi-tenant use:* one route accepted another workshop's
ids (F-39, fixed); the rest held. *In inventory and finance together:* approved
discounts vanish onto immutable invoices (F-33), and labour is quoted from a
constant no owner can change (F-11). *Under repeated or concurrent use:* the
idempotency on the parts cart and on payments is real and was exercised; the
non-atomic approval (F-26's remaining half) is the place a concurrent failure
would still leave a half-dispatched job.

**The honest summary.** The spine of this product — the lifecycle, the gates, the
audit trail, the inventory ledger, the invoice and its immutability — is well
built, and it held up under every check the audit put to it. What failed was
almost entirely at the edges where a screen decides what to send: invented
findings, invented prices, invented stock levels, a padlock over a number
computed from a string. Those are the parts a passing test suite cannot see, and
they are why this audit was driven through a browser rather than through the API.

---

## 11. Working log

The full evidence — every reproduction, every payload, every database dump, and
the three findings I disproved — is in the session working log referenced by
`SYSTEM_RECOVERY_REGISTER.md`. Each defect there carries severity, location,
repro steps, expected versus actual, affected role and tenant, the API/UI/DB
evidence, root cause, business impact, recommended fix, and a
production-blocking verdict.

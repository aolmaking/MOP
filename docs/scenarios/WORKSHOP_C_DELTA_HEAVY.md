# Workshop C — Delta Heavy Equipment Services

> **Scenarios 11–15 of 20.**

---

## The workshop

**Delta Heavy Equipment Services** — one yard/workshop in Belbeis, Sharqia,
plus field crews that go to the customer. Services generators, tractors,
excavators and irrigation pumps for farms, factories and construction
sites across the Delta.

| | |
|---|---|
| Branches | 1 yard, but roughly 60% of work happens at the customer's site |
| Warehouses | 1 yard warehouse + parts carried on 4 field vans |
| Owner | Mahmoud, an engineer by training |
| Branch managers | 1, doubles as dispatcher |
| Technicians | 11 — 7 yard-based, 4 field crew leads, each with a helper (not in MOP at all — informal labour) |
| Inventory manager | 1, also handles procurement |
| Cars per day | N/A — this workshop does not think in "cars per day". It thinks in **jobs**, often multi-day |
| Work | Generator overhauls, hydraulic system repair, engine rebuilds, irrigation pump service, emergency field callouts |
| Categories | HEAVY_EQUIPMENT primarily, some GENERATORS-adjacent work MOP has no category for at all |
| Money | Invoiced to businesses on 30/60 day terms, some cash for small farmers |
| Records before MOP | Paper job cards filed in a cabinet, a WhatsApp group for dispatch |

**Specializations:** engine hour meters, hydraulic pressure readings,
cylinder numbers, oil sample lab results, generator load-bank test
results, PTO (power take-off) hours, field travel time and mileage,
site-access constraints (locked gates, farm dogs, no phone signal).

---

## SCENARIO 11 — A job that takes six days and never fits a "work order"

**A generator overhaul spans a week, several site visits, and MOP's
model of a job as one continuous work order does not match reality.**

### What happens

A factory's backup generator has failed. Mahmoud's team is called. This
is not a car coming in and leaving same-day — it is:

- **Day 1**: field visit, diagnosis on site. A technician, Fathy, drives
  out, inspects, finds a cracked head. No parts fitted. 3 hours on site
  plus 2 hours travel.
- **Day 2–3**: the generator head is removed and brought to the yard
  workshop for machining — a sub-job at a **different location** than
  where the work order was opened.
  - Note: Delta doesn't do the machining itself; it's sent to a machine
    shop across town. MOP has no concept of **external subcontracted
    work** on a work order at all.
- **Day 4**: the head returns from the machine shop. It's reassembled at
  the yard.
- **Day 5**: field visit to reinstall. Load-bank test run for 2 hours to
  confirm output under load.
- **Day 6**: a follow-up call — the customer reports a fault under load
  that didn't show in the shorter test. Another field visit.

Fathy tries to log this in MOP as a single work order. The work card
assumes a technician clocks in, works, clocks out, on one continuous
task, at one location (implicitly the branch — nothing asks *where*). It
has no way to represent:

- multiple **site visits** as distinct events within one job, each with
  their own start/end and travel time
- a **sub-job sent externally** and its own cost, which needs to flow
  into this job's total cost but isn't Delta's own labour
- **six calendar days** of elapsed time against maybe 11 hours of actual
  labour — MOP's "waiting" concept is blockers (parts, customer,
  equipment), not "this job is naturally multi-day and elapsed time is
  not idle time"

Fathy ends up creating **four separate work orders** for what is, to the
customer and to Delta's own accounting, one job with one invoice. Nobody
can now answer "how much did the generator overhaul cost, total" without
manually adding four work orders together.

### The core mistakes

**11.1 — A work order assumes one continuous session at one location.**

The entire lifecycle (`WorkOrderLifecycleService`, the states, the task
model) assumes work happens where the car is: at the branch. Field
service — visit, return, revisit — is not representable as sub-events of
one job. This is a structural assumption baked into "work order," not a
missing field.

*What is missing:* a **visit** or **session** concept nested under a job,
each with its own location, start/end, technician(s) and travel time —
letting one job span many sessions across many days without becoming
many work orders.

**11.2 — External subcontracted work has no representation.**

Sending the generator head to a machine shop is routine for Delta and
Workshop B's body-adjacent work alike. MOP's part model handles physical
parts (catalog, stock, direct-purchase per Workshop A's 2.1). It has no
concept of a **subcontracted service line** — pay an outside vendor for
labour on this job, and the cost needs to appear on Delta's own margin
calculation and, ultimately, the customer's invoice.

**11.3 — Multi-day elapsed time is treated identically to a blocker.**

MOP has one notion of "why isn't this done": a blocker, which pauses
things and demands resolution. A generator overhaul spanning 6 days with
only 11 hours of labour is not blocked — it is a job whose nature is
long, with planned gaps (parts machining, waiting for a scheduled
revisit). Conflating "stuck" with "naturally spans days" means either
every long job triggers false blocker alarms, or the attention system
has no signal for jobs at all in this workshop's normal operating mode.

**11.4 — There is no "parent job, many work orders" grouping.**

Even accepting that Fathy split this into four work orders as a
workaround, MOP gives him no way to say "these four belong together."
Each is a separate row everywhere — the board, delivery, invoicing, the
customer's history. The total cost of the actual job Mahmoud sold is
unknowable from the product without manual reconciliation.

---

## SCENARIO 12 — Dispatch, and the technician who is two hours away

**The branch manager tries to dispatch a field crew and MOP has no idea
where anyone is or how long it takes to get anywhere.**

### What happens

07:00. Two emergency calls come in: a farm's irrigation pump has failed
(30 minutes from the yard) and a factory's generator won't start (90
minutes away, different direction). Mahmoud (also the dispatcher this
morning, his branch manager is out sick — no cover plan exists, another
gap, but not the interesting one here) has four field techs and needs to
send the right one to the right job, fast.

He opens **Work Orders**. It shows a board of lanes by status. There is
no map, no location for any technician, no travel-time estimate, no
concept of "which crew is closest and free." He picks based on memory: he
thinks Sayed is near the farm because that's roughly where Sayed lives.

He assigns both jobs. Sayed drives to the farm — it's actually 50 minutes
from where Sayed currently is (he was finishing yesterday's job
elsewhere), not 30. The factory generator crew arrives late too, because
nobody accounted for the fact that the technician assigned was still
mid-task on something else, 40 minutes from the yard, and MOP's
assignment screen showed him as simply "assigned to Job X" with no
indication of where "Job X" physically is relative to the new emergency.

By the time both crews arrive, the farm's pump has been down for 2.5
hours (irrigation timing matters — this can mean crop damage) and the
factory has had backup power down for the same window (production
stopped).

### The core mistakes

**12.1 — There is no location or travel-time model at all.**

MOP has branches (fixed points) and work orders (attached to a branch).
It has no concept of a technician's *current* location, a job's *site*
location distinct from the branch, or travel time between them. For a
workshop where 60% of work is in the field, dispatch — the single most
operationally critical decision Mahmoud makes every morning — has zero
product support.

**12.2 — "Assigned" doesn't say where or how far along.**

The board shows a technician as assigned to a work order. It does not
show that work order's location, its expected finish time, or the
technician's real-time status relative to it. Dispatch decisions are made
on memory and a WhatsApp group running in parallel to MOP, meaning MOP is
not actually the operational system of record for this workshop's most
important daily function.

**12.3 — Emergency/priority jobs have no expedited path.**

Both new jobs entered the same intake flow as routine ones. There is no
"emergency" flag that would, say, surface at the top of every relevant
list, suppress routine assignment logic, or trigger an immediate
notification to the nearest available crew. This connects to Workshop
A's missing promise-time/queue concept (4.1) but is sharper here:
Delta's emergencies are genuinely time-critical in a way an oil change
queue-jump is not.

**12.4 — Site-access facts have nowhere to live.**

Locked gates, guard dogs, no phone signal at a specific farm — this is
exactly the kind of operational knowledge a field service company
accumulates about *locations*, not about the customer or the asset.
There's no site/location entity to attach it to; it lives in Fathy's
head and gets re-learned the hard way by whoever goes next.

---

## SCENARIO 13 — The oil sample that came back bad

**A diagnostic result arrives from an external lab three days after the
job closed, and MOP has already forgotten the job existed.**

### What happens

During a generator service, Fathy takes an oil sample and sends it to a
lab for analysis — standard practice before deciding whether an overhaul
is needed or a service is enough. The job is otherwise complete: oil
changed, filters replaced, generator running. He closes the work order
because the customer wants their generator back and the sample result
won't be back for 3 days.

Three days later, the lab result arrives (by email, outside MOP
entirely): elevated metal content, suggesting bearing wear. This is
important — it means a bigger job is coming and the customer should be
warned now, before it fails catastrophically.

Fathy needs to attach this result to the **closed** work order — but MOP
gives a technician tools only on **assigned, active** tasks. Once
`WorkOrderLifecycleService` has moved the work order past `COMPLETED`,
there is no route back into it from the technician's card at all. He
cannot add a note, cannot flag a future risk, cannot trigger a new
customer decision about scheduling a follow-up.

He tells Mahmoud verbally. Mahmoud has to manually create a brand new
work order, weeks later when he remembers, with no link back to the
original service or the lab result that prompted it — and by then the
generator has already thrown a bearing fault on site, which is exactly
the failure the sample was trying to catch early.

### The core mistakes

**13.1 — Closed work orders are dead ends, even for legitimate delayed
information.**

The lifecycle correctly refuses to let a technician mutate a closed
work order's *outcome* — that is a real invariant worth keeping, closing
the door to backdating what happened. But it also closes the door to
*appending* new, later-arriving information that is legitimately about
that job: a lab result, a follow-up finding, a manufacturer's delayed
diagnostic response. Those are additions, not edits, and the model
conflates the two.

*What is missing:* an **append-only addendum** on a closed work order —
visible, timestamped, attributed, and separate from the immutable record
of what happened during the job itself.

**13.2 — External diagnostic results (lab, dyno, load-bank) have no
representation.**

This is a variant of the missing photo/attachment gap (7.3) but
specifically for **results that arrive asynchronously from outside MOP
entirely** — a lab, a manufacturer's diagnostic cloud, a subcontractor's
report. There's no inbox, no pending-result state, no way to say "this
job is closed operationally but has an outstanding external result
expected."

**13.3 — A predictive/preventive finding has no path to action.**

Even if the result could be attached, there's no mechanism to turn "this
generator's oil shows bearing wear" into a scheduled future job, a
customer decision ("would you like to book preventive maintenance"), or
even a flag on the asset. The whole product is reactive — something
breaks, a work order opens — with no representation of a *predicted*
future need.

**13.4 — There's no link between a new work order and the job that
predicted or preceded it.**

Even after Mahmoud manually creates the follow-up job, nothing connects
it to the original service or its lab result. Asset history (once built,
per Workshop A's 2.3) would show two unrelated visits instead of a
causal chain: service → sample → result → predicted failure → follow-up.
This is the same "relationship between work orders" gap as the comeback
problem in Workshop B (8.2), generalized: MOP needs work orders to be
**linkable to each other** for several different reasons (comeback,
follow-up, parent/child sessions per 11.4), and currently has none of
them.

---

## SCENARIO 14 — Hydraulic pressure, cylinder numbers, and a diagnostic
form that doesn't exist

**A hydraulic excavator repair needs structured diagnostic data MOP has
no field for, on any inspection type it offers.**

### What happens

An excavator's boom is dropping under load — a hydraulic fault. The
diagnosis needs pressure readings at multiple test points: main pump
output, boom cylinder (rod side and cap side), and the relief valve
setting. Each is a number, in bar, at a specific test point, and the
pattern of readings across points is literally how the fault is
diagnosed (a low reading at the cap side with a normal pump output
narrows it to the cylinder seal, not the pump).

MOP's inspection tools are **Quick Inspection** and **Full Inspection**.
Both are built around the categories the product ships with — which, per
the codebase, are oriented at defect codes for CARS: fault codes,
severity, notes. There is no generic "structured measurement" inspection
type: no way to define "these are the six test points for a hydraulic
diagnostic, record a bar reading at each," reusable the next time a
similar fault comes in.

Fathy records the four numbers in a **note**, freehand: "طلمبة رئيسية 210
بار، اسطوانة الذراع جانب الرود 40 بار (لازم يكون 180+)…" — the single
most diagnostically important data from this job, unstructured, in
Arabic prose, in a field nothing else in the product ever reads again.

Three months later, the same excavator has a similar symptom. There is
no way to compare "what were the readings last time" against "what are
they now" — which is the entire point of taking baseline readings in the
first place.

### The core mistakes

**14.1 — Inspection types are fixed by the product, not defined by the
workshop.**

This is 1.2 (service cards) from a different angle: not "what was
done" but "**what was measured**." A hydraulic pressure test, a load-bank
test, an oil analysis result, an engine-hour reading — these are all
structured measurement sets that vary by trade and by fault type, and
none of them fit CARS-shaped defect-code inspections. The product needs
the same specialization mechanism to cover **diagnostic/measurement
forms**, not just service-completion fields.

**14.2 — There is no baseline-vs-current comparison for anything.**

Even with structured fields, nothing in MOP compares a measurement taken
today against one taken on a prior visit for the same asset at the same
test point. This is only possible once 14.1 exists and once work orders
are linked across visits (13.4) — three gaps converging on one real
diagnostic workflow.

**14.3 — HEAVY_EQUIPMENT as a category carries none of its own
vocabulary.**

`CategoryCode` has `HEAVY_EQUIPMENT` as a value. Nothing behind that
value differs from CARS in the product — same intake fields (VIN?
mileage? for an excavator?), same inspection types, same complaint
free-text. A category in the schema with no category-specific behaviour
is a label, not a specialization, and it is exactly the gap the user
described: "detected and edited from the beginning."

---

## SCENARIO 15 — Delta tries to bill 30/60-day business customers and
chase the money

**Every customer here is invoiced on terms, not paid same-day, and
MOP's finance system assumes same-visit settlement.**

### What happens

The generator overhaul from Scenario 11 (eventually reconciled by hand
into one invoice) goes out to the factory customer on **net-30 terms** —
standard for Delta's B2B customers. The farm's irrigation pump repair, a
smaller job, was cash on completion — Delta's small-farmer customers pay
same-day.

MOP's finance model (Phase 8, engine done per PROJECT_STATE) centers on
a running balance settled at or near delivery — the delivery gate
literally checks whether the invoice is paid before releasing the asset
(Workshop A hit this from the opposite side, 1.3, wanting *less*
ceremony; Delta needs *more* flexibility). For Delta:

- The factory's generator cannot sit un-released for 30 days waiting for
  payment — it has to go back to the factory immediately, work done,
  invoice payable later. Delivery and payment are **decoupled** for
  every B2B job Delta does.
- 30 days later, the invoice is unpaid. Mahmoud needs to know which
  invoices are overdue, by how much, for which customer — an **accounts
  receivable aging report**, a completely standard concept with zero
  representation in MOP's finance system as built.
- Partial payments happen — the factory pays 60% now, the rest in two
  weeks. MOP's payment model (Phase 8, "a payment that cannot be taken
  twice" per the recent commit) handles idempotent payment recording,
  but nothing in the spec discusses **partial settlement against an
  open balance over time**, tracked and aged.

Mahmoud ends up running his receivables in the same parallel spreadsheet
he's used for a decade, because MOP can record that a payment happened
but cannot tell him who owes him money right now, or for how long
they've owed it.

### The core mistakes

**15.1 — Delivery and payment are coupled by default, with no
workshop-level override for credit terms.**

The delivery gate assumes "paid, then released" is universal. Delta's
entire B2B business runs on "released, then paid within terms." This
needs to be a workshop-level (or even customer/account-level, tying back
to Workshop B's Account concept, 10.1) policy: some customers pay on
delivery, some pay on terms, and the gate needs to know which applies to
*this* invoice before deciding whether payment blocks release.

**15.2 — No accounts receivable aging.**

"Who owes me money, how much, and for how long" is not a report MOP can
produce even in principle from what's been described — there is no
concept of invoice due date, no aging buckets (0–30, 31–60, 60+), no
overdue flag or reminder. For a B2B-heavy workshop this is not a nice-to-
have report; it is the difference between getting paid and not.

**15.3 — Partial payment over time against one invoice is not clearly
modelled.**

The idempotent single-payment guarantee is real and valuable — but
Delta's invoices are frequently settled in 2–3 partial payments across
weeks. Whether the current model supports "invoice open at 3,200 EGP,
1,900 paid today, 1,300 outstanding, paid off in two weeks" as a tracked,
reportable state — versus only supporting one clean payment per invoice
— needs to be verified against the actual Phase 8 implementation, not
assumed; if it isn't there, it is close to the top of the Phase 8/9
revisit list.

**15.4 — Credit terms are a customer attribute nowhere in the schema.**

Net-30, net-60, cash-on-completion — this is exactly the kind of thing
that belongs on the Account/Customer entity (10.1) as a standing term,
applied automatically at invoicing, not decided ad hoc by whoever issues
the invoice that day.

---

## What Workshop C adds to the phase brief

| Finding | Recurs in | Phase that should own it |
|---|:--:|---|
| Multi-session/multi-day jobs at multiple locations | D | **16** — structural, not cosmetic |
| Subcontracted/external service lines | B | Phase 8/9 revisit |
| Elapsed-time-without-blocker as a normal state | A, D | **16** |
| Parent job grouping many work orders/sessions | — | **16**, links to Workshop A's 4.1 |
| Location/travel-time model for field dispatch | D | new work, likely its own future phase |
| Emergency/priority job path | A, D | **16** |
| Site/location entity with persistent facts | — | **16** |
| Append-only addenda on closed work orders | — | new work, foundational fix |
| Async external diagnostic results (lab, dyno) | — | **16** |
| Predictive finding → scheduled future work | — | new work, post-15–17 |
| Work-order-to-work-order linkage (comeback, follow-up, parent/child) | B | **16**, converges three findings |
| Workshop-defined diagnostic/measurement forms | A, D | **15** |
| Baseline-vs-current measurement comparison | — | depends on 14.1 + 13.4 |
| Category-specific vocabulary actually driving behaviour | A, B, D | **15**/**17** |
| Delivery/payment decoupling for credit terms | A (opposite direction) | Phase 8 revisit |
| Accounts receivable aging | — | Phase 8/12 revisit |
| Partial payment over time, verified against Phase 8 | — | Phase 8 audit |
| Credit terms as an Account attribute | B | Phase 8 revisit |

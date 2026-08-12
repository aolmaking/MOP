# Workshop A — Nafath Auto Care

> **Scenarios 1–5 of 20.** Written as discovery input for Phases 15–17.
> Each scenario walks the software step by step, from account creation
> through every page the people actually touch, and names the core
> mistakes it hits. The mistakes are not crashes. They are places where
> MOP is logically wrong, silently missing a concept, or refuses to
> represent something real.

---

## The workshop

**Nafath Auto Care** — Sidi Gaber, Alexandria. One rented unit, two
lifts, a compressor, a tyre machine and a small parts cupboard behind
the desk.

| | |
|---|---|
| Branches | 1 |
| Warehouses | 0 formal — a cupboard nobody counts |
| Owner | Sameh, 44. Owns it, runs the desk, and picks up a spanner when a lift is free |
| Branch managers | 0. Sameh is the desk |
| Technicians | 2 — Ashraf (12 years, does everything), Mido (19, apprentice) |
| Inventory manager | none |
| Team leaders | none |
| Cars per day | 30–40, mostly under 40 minutes |
| Work | Oil, filters, brake pads, tyres, batteries, wipers, AC gas |
| Money | Cash. A card machine that Sameh distrusts |
| Records before MOP | A carbon-copy book and Sameh's memory |

**Specializations that make this workshop what it is:** oil viscosity and
brand per car, drain-plug washer replaced or not, tyre position and DOT
date, brake pad thickness at fitting, battery CCA and warranty months,
AC gas grams charged. None of these are fields in MOP. All of them are
what Sameh's customers ask about six months later.

---

## SCENARIO 1 — The first morning

**Sameh has just been created as a workshop on MOP and is opening for the
first time.**

### What happens

07:40. The platform super admin created Nafath the night before through
**Add Workshop Owner**: name, slug, country Egypt, city Alexandria,
business type "Garage", primary category CARS, currency EGP, timezone
Africa/Cairo, plan "Starter", one branch allowed, three users, one
warehouse, starter builder template. An invite link was generated.

Sameh opens the link on his phone at the desk. `/invite/accept` loads,
shows his name and the workshop name, asks for a password twice. He sets
one. The token is consumed. He is signed in and lands on `/owner/audit`.

He is looking at an audit log. On his first morning. The first thing MOP
ever showed the owner of a workshop is a filterable table of system
events, because Audit & Change History is the only Owner page built.

He backs out, finds nothing else, and calls the number he was given. He
is told to use the *manager* login instead. There isn't one — he is the
owner. Someone creates a second account for him with role
`BRANCH_MANAGER` so he can reach `/branch/attention`.

**Sameh now has two accounts and two passwords for one person.**

08:15. A white Corolla pulls in. Oil change. Sameh opens **Book in**
(`/branch/intake`). The form asks for customer name, phone, then asset:
plate, make, model, year, VIN, colour, mileage. He types the plate. He
does not know the VIN and never will — nobody in Egypt reads a VIN for an
oil change. He leaves it blank; the form allows it. Good.

Then: **category**. CARS. Fine. Then the complaint field. He types "زيت".

He saves. A work order is created at `REGISTERED`.

08:18. He goes to **Work orders** and assigns Ashraf. The card moves.
Ashraf, on his phone, sees it under **Now**.

08:22. Ashraf opens the work card. The tools are there: start, finish
attempt, complete, quick inspection, full inspection, report blocker,
add note, request part, customer decision, running invoice line. He
starts the task.

He needs to record the oil. There is no field for oil. He writes it in a
**note**: "5W-30 Mobil, 4 لتر, فلتر أصلي".

08:51. Done. He completes. Sameh takes 850 EGP cash. He opens
**Delivery**, the car has no invoice, so it sits in "Held" with "The
invoice has not been issued." He has to go to the finance side, issue an
invoice, then take the payment, then release the car.

For an oil change. That took four minutes on paper.

09:05. The next car arrives while he is still clicking.

### The core mistakes

**1.1 — The owner of a one-person workshop is sent to an audit log.**

`LANDING_PAGES.TENANT_OWNER = "owner-home"`, and `owner-home` maps to
`/owner/audit` because that is the only Owner page built. For a large
workshop that is a temporary embarrassment. For Nafath it is
disqualifying: Sameh IS the workshop, and MOP's answer to "what do I do
now" was a list of its own internal events.

Worse, the shape is wrong even when Owner Home exists. MOP assumes owner
and branch manager are different people with different pages. In a
one-person workshop they are one person, and the product forced Sameh to
hold two identities to do his own job.

*What is missing:* a role is not a person. MOP needs the idea that one
account can hold several roles, and that a workshop can declare itself
single-operator, in which case the owner's landing page IS the branch
manager's and the rail is one rail.

**1.2 — There is nowhere to record what was actually done.**

The single most important fact about this job — 5W-30 Mobil, 4 litres,
original filter — lives in a free-text note. It is not searchable, not
reportable, not comparable, and not tied to the item that was used. In
six months when the customer asks "what oil did you put in", the answer
is in a paragraph of Arabic prose inside a note on a closed work order.

This is the gap the user named. A workshop like Nafath has perhaps eight
services, and each has three to six facts worth capturing. MOP has zero
of them, and no way for anyone to add one.

*What is missing:* **service cards with workshop-defined fields.** Not a
note. A card for "Oil change" whose fields — viscosity, brand, litres,
filter type, drain washer replaced — were defined for this workshop when
it was created, filled by the technician on the work card, stored as
data, and readable on the asset's history forever.

**1.3 — Cash on an 850 EGP oil change requires an invoice document.**

The delivery gate refuses to release a car without an issued invoice.
That is correct for a workshop with an accountant. For Nafath it means
every one of forty cars a day passes through an invoicing ceremony that
exists nowhere in the real business — Sameh takes notes, gives change and
waves.

The capability engine is supposed to solve exactly this by *rewiring*,
not hiding. But the reachability guarantee only proves a terminal state
is reachable; it does not ask whether the path is proportionate to the
job. A profile with invoicing disabled would let the car leave — but
then Sameh has no record of the 850 EGP at all, because payment is
modelled as settling an invoice.

*What is missing:* a **counter-sale / immediate settlement** path where
money is recorded against the work order without a legal invoice
document, and the invoice becomes an optional artefact the customer can
ask for.

**1.4 — Intake asks for a VIN before it asks what is wrong.**

The intake form's asset block is modelled on a dealership: plate, make,
model, year, VIN, colour, mileage. Nafath needs plate and mileage.
Everything else is either guessable or irrelevant, and every optional
field on a form used forty times a day is a small tax paid forty times.

*What is missing:* intake field sets that are **defined per workshop**,
not per product — and defined at workshop creation, when the super admin
already knows this is a two-lift quick-service shop.

---

## SCENARIO 2 — The customer who comes back six months later

**A returning customer asks a question MOP cannot answer.**

### What happens

A Hyundai Elantra, plate ح ط ر 4471. The owner, Mrs Nadia, is back after
a strange noise. She was here in February.

Sameh searches. **Book in** finds the asset by plate and shows "returning
customer" — good, this works, and it works because intake writes both
`Asset.currentOwnerCustomerId` and an `AssetOwnershipHistory` row.

She asks: *"You changed the brakes in February. Are they under
warranty?"*

Sameh opens the work order from February. He reads:

- Status: CLOSED
- Tasks: "Brakes" — completed by Ashraf
- Notes: "قدام بس", "زبونة قالت صوت"
- Parts issued: none — because Nafath has no warehouse, the pads were
  bought from the shop across the road and never entered MOP
- Invoice: 1,900 EGP

MOP knows that on 14 February someone did something called "Brakes" to
this car for 1,900 EGP. It does not know:

- which pads (brand, part number)
- front or rear — the note says front, in Arabic, in a free-text field
- what the disc thickness was
- whether the pads carried a warranty and for how long
- who supplied them

Sameh tells her he thinks they were Bosch, and yes, probably six months,
and today is day 187.

She is unhappy. He does the job free.

### The core mistakes

**2.1 — Parts that were never in stock do not exist to the system.**

MOP's part model is `PartRequest → IssuedItem → StockMovement`. It is a
warehouse model. A part that was bought for one job, from a shop across
the road, and fitted the same hour has no representation. Nafath fits
perhaps 60% of its parts this way. So the majority of what this workshop
puts into cars is invisible to its own software.

This is not a small workshop problem only. Workshop C (heavy equipment)
buys against a job constantly. Workshop B does it for anything urgent.

*What is missing:* a **direct-purchase line** on a work order — item
name, supplier, cost, price, warranty period — that never touches stock
and is a first-class part record.

**2.2 — There is no concept of a warranty on anything.**

Not on a part, not on a service, not on a job. `InventoryItem` has cost,
price, thresholds, categories, barcode, supplier and notes. It has no
warranty. `WorkOrder` has no warranty. Yet warranty is the single most
common reason a customer returns to a workshop, and the single most
common argument.

*What is missing:* warranty as a field **defined per item type by the
workshop** (a battery is 12 months, pads are 6, an oil change is none) —
which is the same specialization idea again — plus a derived "still under
warranty?" answer on the asset's history.

**2.3 — The asset's history is a list of work orders, not a service
record.**

`SafeTechnicalHistory` and `CustomerSafeProjectionService` exist (and are
still unreachable — no page). But even reachable, they project work
orders. What Mrs Nadia asked for is a **service record**: this car, these
services, these parts, these dates, these readings. Assembled from
structured facts, not from prose in notes.

*What is missing:* the service record as a derived, queryable view over
structured service-card data — impossible until 1.2 exists.

**2.4 — "Front or rear" is a fact about brake work that MOP has no place
for, and the pattern repeats endlessly.**

Front/rear. Left/right. Which tyre position. Which cylinder. Which
injector. Which door. Every trade has a *position vocabulary*, it is
different per trade, and a workshop that does cars and motorcycles needs
two different ones.

*What is missing:* position/component taxonomies **per workshop, per
category**, defined at creation. A car workshop gets FL/FR/RL/RR; a
motorcycle workshop gets front/rear; a generator workshop gets cylinder
numbers.

---

## SCENARIO 3 — Mido breaks a wheel stud

**An apprentice makes a mistake, and the software has no way to say so.**

### What happens

11:20. Mido is fitting a wheel on a Kia. He over-torques and snaps a
stud. He tells Ashraf. Ashraf tells Sameh.

The car now needs a stud and an hour it did not need. Nobody is going to
charge the customer.

Sameh opens the work card. His options are:

- **Report blocker** — the blocker reasons are about waiting: waiting for
  parts, waiting for customer, waiting for equipment, safety issue. He
  picks "safety issue", which escalates the work order to `ESCALATED`
  and puts it in his own Attention Center at the top with a red spine.
  It is not a safety issue. It is a broken stud.
- **Add note** — "مسمار اتكسر".
- Add a running-invoice line for the stud, then discount it to zero. The
  money side allows a 100% line discount, so the arithmetic works.

He picks the note. The stud is fitted from the cupboard, unrecorded.

The car leaves 70 minutes late. The Attention Center never showed the
delay, because the work order was never blocked — it was `IN_PROGRESS`
the whole time, and MOP's attention ranking weights blockers, customer
waits and delivery holds. A job silently taking three times its expected
duration is invisible, because **MOP has no expected duration.**

At the end of the month Sameh cannot answer: how much did rework cost me?
How often does Mido cost me an hour? Was this the third stud this month?

### The core mistakes

**3.1 — There is no such thing as internal rework.**

Every cost in MOP is chargeable or discounted. There is no category for
"we caused this, we absorb it". A 100%-discounted invoice line records
the work as a gift to the customer, which is a completely different fact
from a mistake absorbed by the workshop — for margin, for performance
review, and for the technician's record.

*What is missing:* **cost attribution** on a work item: customer,
workshop (rework), warranty, insurer, contract. This is a field the
finance system needs and does not have, and it changes every report.

**3.2 — Blocker reasons are a fixed product list, so people mis-file.**

The blocker taxonomy is hardcoded product vocabulary. Mido's stud is not
in it, so Sameh filed a safety issue and MOP escalated a work order over
a wheel stud. Worse, the escalation is now in the audit log and in the
technician's record as a safety event.

Every workshop has its own reasons. A motorcycle shop's list is
different. A generator shop's list is entirely different.

*What is missing:* **workshop-defined blocker reasons**, each mapped to a
product-level behaviour (does it pause the clock? does it notify? does it
escalate?). The behaviour stays MOP's; the vocabulary belongs to the
workshop.

**3.3 — A job has no expected duration, so lateness is unobservable.**

The Attention Center ranks by blockers and waits. It cannot rank by "this
job is 3× over" because nothing declares what a job should take. In a
40-cars-a-day shop, elapsed-vs-expected is the *primary* signal — it is
the only thing that tells Sameh a lift is stuck before the queue backs
into the street.

*What is missing:* expected duration per service, **defined by the
workshop per service card**, and an over-run signal in attention ranking.

**3.4 — An apprentice and a 12-year technician are the same kind of
user.**

MOP has one TECHNICIAN role. Mido and Ashraf get identical pages,
identical permissions, identical tools. Nothing says Mido may not fit
brakes unsupervised, nothing routes his work to Ashraf for a check,
nothing records that this job needed supervision.

*What is missing:* **skill and authorisation as workshop-defined
attributes** of a technician, and service cards that can require a skill
level or a second signature.

---

## SCENARIO 4 — The Thursday queue

**Peak load. The software's model of a workshop day does not match the
day.**

### What happens

Thursday before a long weekend. Everyone wants their car done before they
travel.

07:30. Six cars are waiting when Sameh unlocks. He books them all in —
six trips through `/branch/intake`, each with the same eight fields. It
takes 22 minutes, during which two more arrive.

He now has eight work orders at `REGISTERED` and two lifts.

He opens **Work orders**. It is a board by lane. Eight cards, all in the
same lane, in creation order. There is no queue, no priority, no promise
time, no "this one is a 20-minute job and that one is a 3-hour job".

A customer asks: *"When will it be ready?"* Sameh guesses. There is
nowhere to record the guess. There is nowhere for the customer to see it.

09:00. He assigns Ashraf the AC job (long) and Mido the two oil changes
(short). Both accept. The other five sit.

10:15. A regular, Hany, arrives with a flat. Two minutes of work. He
should jump the queue — he is a regular, and it is two minutes. MOP has
no way to express "do this next". Sameh just tells Mido verbally, and the
board now lies: it shows Mido on an oil change while he is actually
fixing a puncture on a car that was never booked in.

12:40. The AC job needs a compressor Nafath does not have. Ashraf reports
a blocker: waiting for parts. The work order pauses. The car occupies a
lift for the rest of the day because there is nowhere else to put it, and
MOP has no idea that a *lift* is a resource at all.

17:00. Three cars unfinished. Sameh calls three customers. MOP sends
nothing — the notification concept exists in the spec, but nothing sends.

### The core mistakes

**4.1 — There is no appointment, no promise time, and no queue.**

MOP models a work order as something that exists and then progresses. It
does not model *when it was promised*, *when it is scheduled*, or *what
order things should be done in*. Every workshop in this document runs on
promises. Nafath's whole reputation is "come at nine, done by ten".

This is the largest single missing concept in the product. It is missing
for all four workshops, in four different shapes: Nafath needs a queue,
Workshop B needs appointments per bay, Workshop C needs field visit
scheduling with travel time, Workshop D needs a 20-minute SLA clock.

*What is missing:* promise time on the work order at minimum; scheduling
as its own system beyond that.

**4.2 — Physical capacity does not exist.**

Two lifts. That is Nafath's real constraint, and MOP does not know lifts
exist. It cannot answer "can I take another car?", cannot show that a
blocked job is occupying capacity, and cannot stop Sameh accepting a
ninth car.

Workshop B has 14 bays across 3 branches. Workshop C's constraint is
crews and vehicles. Workshop D's is 6 pit stops.

*What is missing:* **resources**, with the resource *types* defined per
workshop — lift, bay, ramp, pit, crew, mobile unit, diagnostic machine.

**4.3 — Work done outside a work order is invisible, so the board lies.**

Hany's puncture never entered MOP. The board showed Mido on something
else. In a shop doing forty jobs a day with a two-lift constraint, a
board that is wrong by one job is a board nobody trusts by Friday.

*What is missing:* a genuinely one-tap **quick job** — plate, service,
done — that produces a real work order without the eight-field intake.
Which is 1.4 again, from a different direction.

**4.4 — Nothing tells the customer anything, ever.**

Three phone calls at 17:00. The customer decision link exists — and it is
excellent — but it only fires when a technician raises a decision. There
is no "your car is ready", no "we are running late", no ETA. For Nafath
the phone is the whole customer relationship, and MOP contributes
nothing to it.

*What is missing:* outbound customer messaging as a real system, with
**templates the workshop writes** — not product-worded English strings.

---

## SCENARIO 5 — Sameh tries to understand his month

**Month-end. The owner asks the software what happened, and it cannot
say.**

### What happens

Last day of the month, 21:00, shutter down. Sameh sits with tea and MOP.

He wants to know four things:

1. How much did I take this month?
2. Which service makes me the most money?
3. Which customers are regulars and which have stopped coming?
4. Am I spending more on parts than I should?

He opens `/owner/audit`. It is the only Owner page. It tells him that on
the 14th, at 15:22, `finance.invoice.issued` by Sameh. Six hundred times.

There is no Owner Home. No money page. No customer list. No reports.

He goes to `/branch/delivery` — cars released. `/branch/work-orders` — a
board of currently-open jobs, not history. `/inventory/reports` — he has
no inventory manager and no warehouse, and the page needs
`reports.inventory.view` which his role does not have.

So he opens the spreadsheet he has kept in parallel since day one,
because he does not trust the software with the only number that matters.

**MOP has been running his workshop for four months and cannot tell him
what he earned.**

Even if the Owner money page existed, three of his four questions would
still be unanswerable:

- *Which service makes the most money* requires services to be a thing
  with an identity. They are free text in a complaint field and a note.
- *Which customers stopped coming* requires a customer list with a last-
  visit date. There is no customer page anywhere in MOP.
- *Am I spending too much on parts* requires part cost on parts he never
  entered (2.1) and a margin view that assumes a warehouse he does not
  have.

### The core mistakes

**5.1 — The owner of the workshop is the least-served user in the
product.**

Eight Owner pages are specified. One exists, and it is the audit log.
Every other role has its home. The person who pays for MOP has a table of
`capability.changed` events. This is a sequencing failure that has now
persisted across four completed phases, and for a single-operator
workshop it means MOP is unusable as an owner's tool.

**5.2 — Reporting is warehouse-shaped and staff-shaped, not
money-shaped.**

The only reports built are inventory reports, gated behind a permission
an owner does not hold by default, computed per warehouse, and useless to
a workshop with no warehouse. Meanwhile the four questions every owner
asks — revenue, mix, retention, cost — have no surface at all.

*What is missing:* the Owner's money view, and before it, the structured
data that makes "service mix" answerable: **service identity**, which
returns to the specialization engine.

**5.3 — There is no customer as a subject, only as a field on a work
order.**

`Customer` exists in the schema. There is no customer page, no customer
list, no customer history, no "last seen", no "total spent", no notes on
a person, no marking someone as difficult or as a favourite. For a
neighbourhood workshop, the customer relationship IS the business, and
MOP holds a phone number.

**5.4 — Nafath is paying for a shape it does not have.**

The plan gives it warehouses it does not use, an inventory manager role
it will never fill, a team structure for two people, an invoicing
ceremony it does not want, and an audit log it cannot read. Meanwhile it
gets none of: a queue, a promise time, a service card, a warranty, a
customer record.

The capability engine can remove the first list. **It cannot add the
second**, because the second does not exist in the product for anyone.

That is the case for Phases 15–17: capability removal made MOP fit
smaller workshops. It did nothing to make MOP fit *specific* ones. Nafath
and a Toyota dealership are not the same product with different features
switched off — they are the same spine with different **vocabularies**,
and MOP currently ships exactly one vocabulary: its own.

---

## What Workshop A adds to the phase brief

| Finding | Recurs in | Phase that should own it |
|---|:--:|---|
| Service cards with workshop-defined fields | B, C, D | **15** |
| Field sets defined at workshop creation | B, C, D | **17** |
| Direct-purchase parts (no warehouse) | B, C | 7 revisit / **16** |
| Warranty as a workshop-defined attribute | B, C, D | **16** |
| Position/component taxonomies per category | C, D | **15** |
| Workshop-defined blocker reasons | B, C, D | **16** |
| Expected duration and over-run signal | B, D | **16** |
| Skill / authorisation on technicians | B, C | **16** |
| Promise time, queue, appointments | B, C, D | new work, pre-15 |
| Resources (lifts, bays, crews) with workshop-defined types | B, C, D | **16** |
| Quick job / one-tap intake | D | 5 revisit |
| Outbound messaging with workshop-written templates | B, C, D | **16** |
| One person holding several roles | — | 3 revisit |
| Cost attribution (customer / rework / warranty / contract) | B, C, D | 8 revisit |
| Owner's money view and customer subject | B, C, D | 10 |

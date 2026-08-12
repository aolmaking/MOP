# Workshop D — SpeedLube Express

> **Scenarios 16–20 of 20.**

---

## The workshop

**SpeedLube Express** — a 6-branch quick-lube chain across Cairo and
Giza, franchised model, each branch nearly identical: 3 drive-through
pit bays, no appointments, aiming for a 15–20 minute in-and-out oil
change and inspection. Volume, not diagnosis.

| | |
|---|---|
| Branches | 6, franchise-operated but on one MOP tenant |
| Warehouses | 6 small branch stockrooms, no central warehouse — each branch reorders independently |
| Owner | A holding company; day-to-day run by a regional manager, Tarek |
| Branch managers | 6, high turnover — this role churns every few months |
| Technicians | 3–4 per branch, mostly young, mostly part-time, high turnover |
| Cars per day | 60–90 per branch — the highest volume of any workshop in this set |
| Work | Oil change, filter, wiper blades, basic fluid top-offs, a 21-point visual inspection, tyre pressure, battery test |
| Money | Card-heavy, upsell-driven (the inspection exists partly to sell wiper blades, air filters, etc.) |
| Records before MOP | A previous SaaS product, migrated in badly |

**Specializations:** the 21-point inspection checklist itself (identical
across the chain — franchise standard), pit-bay-based (not lift-based)
workflow, upsell tracking and conversion rate, technician certification
by SpeedLube's own internal 3-day training program, and — because
volume is everything here — a strict SLA clock the whole business model
depends on.

---

## SCENARIO 16 — Migrating from the old system

**SpeedLube brings six branches, existing customers, and a partial parts
catalog onto MOP, and there is no path to do that without hand-editing
the database.**

### What happens

Tarek signs the contract. He has, from the old SaaS product: a CSV
export of 34,000 customer records (name, phone, plate, last visit), a
CSV of 6,200 vehicle records, and a parts catalog of ~180 SKUs with
current pricing.

He asks: how do we import this? There is no answer in the product. **Add
Workshop Owner** creates a tenant from nothing — no import step, no CSV
upload anywhere in the onboarding flow, no bulk customer/asset/catalog
loader referenced anywhere in the API.

Someone (in practice, whoever built MOP) writes a one-off script against
`prisma` directly to load 34,000 customers, 6,200 assets with
ownership history, and 180 catalog items. This works, this one time, for
this one migration, and is not a capability SpeedLube — or any future
workshop migrating from a competitor — can use themselves, ever again, for
anything: adding a new branch's starting customer list, correcting a bad
import, or bringing on branch 7 next year.

Three weeks in, a data problem surfaces: 400 customer records were
imported with malformed phone numbers (a formatting difference between
the old system and MOP's phone validation). There's no bulk-correct tool
either — someone has to write another script.

### The core mistakes

**16.1 — There is no data import path into MOP at all, for anything.**

Every entity in the system — customers, assets, catalog items, even
staff (Workshop B's 6.2) — can only be created one at a time, through a
form, by a human, or by someone with direct database access writing a
script. For any workshop switching from an existing system (which is the
*majority* of realistic new customers — most workshops of any size
already run something, even if it's a spreadsheet), onboarding is
currently either "start from zero and re-type everything" or "get an
engineer to write you a script," neither of which scales as a product.

**16.2 — There is no bulk data correction tool.**

Once data is in, wrong at scale (400 bad phone numbers) has no
in-product fix. This is the same shape of gap as 16.1 — one-at-a-time
editing is the only tool MOP offers for any entity, anywhere.

**16.3 — Catalog import doesn't carry supplier/cost history.**

Even if catalog CSV import existed, SpeedLube's 180 items have pricing
history, supplier relationships and reorder points accumulated over
years. A naive import that only captures today's price loses the
`lowStockThreshold`/`criticalStockThreshold` tuning that actually reflects
real consumption patterns — meaning the new catalog starts "dumb" even
though better data existed and was simply not carried across.

---

## SCENARIO 17 — The 20-minute promise, six pit bays, and the SLA clock
that doesn't exist

**SpeedLube's entire business model depends on a promise MOP has no way
to track, alert on, or report against.**

### What happens

09:14. A car pulls into Bay 2 at the Mohandessin branch. The technician,
Amr, scans the plate (SpeedLube uses a barcode/plate scanner integrated
with the old system — MOP's `Asset` model has a `barcode` field on
`InventoryItem` but nothing on `Asset` itself for a plate-scan intake
shortcut, so Amr types the plate manually, slower than the old flow).

The whole franchise model is built on **20 minutes, in and out**. This is
marketed to customers, painted on the wall, and is literally what
differentiates SpeedLube from a regular workshop. Every branch manager's
bonus is tied to average cycle time and percentage of cars completed
under 20 minutes.

MOP's work order moves through states: `REGISTERED` →
`UNDER_INSPECTION` → ... → `CLOSED`. Nothing on the work order says "this
one has a 20-minute SLA, alert at 15, alert red at 20." The Attention
Center ranks by blockers and customer waits generically — it has no
concept of a **per-job SLA clock** that's central to Workshop D's
identity in a way it simply isn't for Workshop A (which wants a queue,
not a hard clock) or C (whose jobs are naturally multi-day).

09:37 — 23 minutes elapsed, car still in Bay 2. Nothing in MOP flagged
this. The branch manager finds out only because she happens to glance at
the bay. Multiply by 60–90 cars/day/branch across 6 branches, and
SpeedLube's core operating metric — SLA compliance rate — cannot be
measured by the software running the business, only estimated after the
fact from timestamps someone would have to query manually.

### The core mistakes

**17.1 — There is no per-job SLA/target-duration concept with active
alerting.**

This sharpens 3.3 and 4.1 from Workshop A (expected duration, over-run
signal) into the sharpest possible form: SpeedLube's entire brand promise
*is* the SLA. Without it as a first-class, workshop-defined, actively-
alerting concept, MOP cannot run the one thing this business is built
around — it can only replay history after the fact from raw timestamps.

**17.2 — No plate-scan / fast-intake path.**

Typing a plate by hand, even quickly, is friction a 20-minute SLA cannot
absorb at scale. This connects to Workshop A's "quick job" gap (4.3) but
for a different reason — Nafath wants less *form*, SpeedLube wants less
*time*, and both point at the same missing capability: an intake path
faster than the current form, this time specifically wanting barcode/
plate-scan hardware integration, which is a genuinely new integration
surface, not just a UI simplification.

**17.3 — SLA compliance is not a reportable metric anywhere.**

Even after the fact, "what percentage of our jobs finished under 20
minutes, per branch, per technician, per week" is not answerable — no
report surface computes it (Phase 12, and specifically depends on 17.1
existing to have the data to report on in the first place).

**17.4 — Bonuses and performance are tied to a number MOP cannot
produce.**

Branch manager compensation is explicitly tied to cycle-time metrics
SpeedLube's leadership needs from the software and currently gets from
nowhere — meaning People & Performance (Phase 10) has a real, business-
critical dependency on 17.1 that isn't visible from the phase map as
written.

---

## SCENARIO 18 — The 21-point inspection, identical across six branches,
built six different ways by six different managers

**A franchise standard checklist needs to be the same everywhere, and
MOP has no concept of a checklist that is defined once and enforced
everywhere.**

### What happens

SpeedLube's 21-point inspection is the franchise's actual product
differentiator — tyre tread depth at 4 points, wiper condition, battery
terminal corrosion, belt condition, all fluid levels, brake pad visual
thickness, etc. Every branch must run the *identical* checklist, in the
*identical* order, so a customer at any of the 6 branches gets the same
experience and so head office can compare conversion rates (how many
21-point findings turn into an upsell) across branches meaningfully.

MOP's inspection tools (Quick/Full Inspection) are not workshop-
configurable at all today (13.1/14.1's gap, hit here from the
standardization angle rather than the customization angle). Even
supposing Phase 15/17 delivers workshop-defined inspection fields —
Delta needed *one* hydraulic diagnostic form, defined once for their one
branch. SpeedLube needs **one checklist enforced identically across six
branches that don't share management**, where a branch manager must not
be able to quietly drop item #14 (brake pad thickness) because it slows
her branch down and her bonus is on cycle time (17.4) — a direct
incentive conflict between speed and thoroughness that the *system*
needs to hold the line on, not individual managers' judgment.

Today, in practice: each branch manager built their own ad hoc version
of "the 21 points" — one branch photocopies a paper checklist and keys
results into a MOP note per car, another does an abbreviated version from
memory when busy, a third stopped doing it altogether during the last
2-week peak Ramadan season, unnoticed by head office for a month.

### The core mistakes

**18.1 — Workshop-defined structures (once built) need to be
*network*-scoped, not just *workshop*-scoped, and centrally enforced.**

This is the sharpest possible test of the specialization idea the user
described: SpeedLube is *one tenant* with *six branches* that must NOT
independently define their own inspection — the definition belongs to
the network (Tarek/head office), and branches must inherit it without
being able to silently deviate. Phases 15–17, as sketched from Workshops
A/B/C, mostly imagined single-branch or loosely-networked customization.
SpeedLube proves the specialization engine needs a **network vs. branch
override policy** — some things (like this checklist) locked at network
level, others (a branch's local supplier list) legitimately branch-
level — which is closer to a second capability-engine-shaped problem
than a simple form builder.

**18.2 — There is no completion/compliance signal for a checklist that
must always run.**

Even with a defined checklist, nothing in MOP would have caught "branch 3
stopped doing the 21-point inspection during Ramadan." There's no
"required step skipped" flag, no compliance report, nothing that would
have surfaced this to Tarek in week one instead of month two.

**18.3 — Incentive conflicts between speed and thoroughness are
invisible to the system.**

The tension between "hit the 20-minute SLA" (17.1, tied to bonus) and
"complete all 21 checklist points" (18.1/18.2) is real and structural to
this business, and nothing in MOP's design has considered that two
metrics it might report could actively pull operators in opposite
directions. This isn't a missing feature so much as a missing awareness
that needs to shape how 17.1 and 18.1/18.2 get designed together, not
separately.

---

## SCENARIO 19 — The upsell that never gets tracked, and a customer who
complains about being "sold to"

**The inspection exists partly to generate upsell revenue, and MOP has no
concept of a recommendation, an accept/decline, or a conversion rate.**

### What happens

The 21-point inspection finds the rear wiper blades are cracked and the
cabin air filter is dirty. This is exactly the moment SpeedLube's
business model wants to capture: recommend, the customer says yes or
no, and if yes, it's an upsell line on top of the oil change.

MOP *has* a customer decision mechanism — and it is genuinely good: the
public decision link (`decision.service.ts`, `/decide/:token`), the
critical-warning acknowledgment gate, all built and reachable. But it is
built around **safety-relevant findings during a work order that's
already in progress**, phrased as "your car needs this, approve or
decline," with the tone and urgency of a real repair decision.

Using it for "would you like new wiper blades for 180 EGP" is the wrong
weight entirely — sending a customer a formal decision link, with its
serious tone and required acknowledgment flow, for a wiper blade upsell
is not how quick-service upselling works in practice: it happens
**verbally, at the counter, in the 20-minute window**, immediately, not
via a link the customer opens later.

So SpeedLube technicians upsell verbally, as they always did, and MOP
records nothing about it: not what was recommended, not what was
declined, not the conversion rate head office needs to evaluate whether
technicians are actually running the inspection thoroughly (a *good*
inspection finds more real issues, which is a leading indicator of
quality, separate from and complementary to the SLA/thoroughness tension
in 18.3).

A customer later complains to head office that "the guy tried to sell me
things I didn't need." There's no record of what was actually
recommended, what the finding was, or what was said — it's one
technician's word, unrecorded, against a complaint.

### The core mistakes

**19.1 — The customer decision mechanism is shaped for safety-critical
approval, not for lightweight point-of-sale recommendation.**

This is a genuine design-fit problem, not a missing feature: reusing
`customer_decision.*` for upselling would either weaken its seriousness
(bad — safety warnings need to stay weighty) or force upselling into an
inappropriately heavy flow (bad — kills the 20-minute promise). What's
missing is a **separate, lighter recommendation/upsell mechanism** — in-
person, recorded at time of counter conversation, not routed through a
customer-facing decision link.

**19.2 — There is no upsell/recommendation record at all.**

Whatever the mechanism, nothing today captures "technician found X,
recommended Y, customer accepted/declined, for Z EGP" as structured
data. This is a direct instance of the missing "service card /
structured finding" gap (1.2, 14.1) applied to sales rather than
technical work — recommendations are diagnostic findings with a sales
outcome attached.

**19.3 — Conversion rate — the metric the whole upsell strategy is
managed against — cannot be computed.**

Downstream of 19.2, obviously, but worth naming as its own reporting gap
(Phase 12) once the underlying data would exist.

**19.4 — There is no dispute/complaint record tied to a work order.**

The customer's complaint to head office exists nowhere in MOP —
customer service complaints, their resolution, and whether they relate
to a specific work order, are entirely outside the product. For a chain
managing reputation across six branches and needing to distinguish "one
bad technician" from "a pattern," this is a real operational gap, likely
belonging with People & Performance (Phase 10) or a new customer-service
surface entirely.

---

## SCENARIO 20 — Tarek tries to run six branches like one business, and
discovers MOP treats "branch" as a filter, not a business unit

**The regional manager needs branch-level P&L, staffing comparisons, and
franchise-standard enforcement, and MOP's branch concept is too thin to
support any of it.**

### What happens

Month-end. Tarek needs, for a board meeting:

- Revenue, cost, and margin **per branch**
- Technician headcount, turnover rate, and average tenure **per branch**
  (turnover is a known problem at SpeedLube and actively tracked)
- Inventory turns and stockout frequency **per branch** (each branch
  reorders independently, so this varies a lot)
- SLA compliance and upsell conversion **per branch** (17.3, 19.3 — both
  already found missing)
- Which branches are, and are not, running the full 21-point checklist
  correctly (18.2 — already found missing)

He also needs to know, structurally, whether MOP treats a "branch" as
something with its **own** staff roster, its **own** inventory, its
**own** performance — or merely as a tag that happens to be attached to
records that are otherwise all pooled at the tenant level.

Reading through the built system: `branchScope` exists on `StaffUser` as
an array (a person can be scoped to zero, one, or many branches — sound
so far). `Branch` itself is a real table. Work orders, intake, and
inventory's `WarehouseStockBalance` all carry branch/warehouse
associations. Structurally, the *data* is there.

But — as Workshop B already found for reporting (9.1) and Workshop A
found for the Owner role generally (5.1/5.2) — almost nothing **reads**
that structure back out as a branch-level view. Tarek is, again, back to
either raw SQL or a parallel spreadsheet, except now the underlying
question isn't "does the data exist" (mostly yes) but "does any page in
the product let a regional manager see six branches as six comparable
business units" (no, nothing does, anywhere).

### The core mistakes

**20.1 — Branch as a data association exists; branch as a managed
business unit, reportable and comparable, does not.**

This restates and confirms Workshop B's finding (9.1) from a sharper
angle: it isn't that branch-level *reporting* is merely unbuilt (Phase
12, understood) — it's that nothing in the *role model* represents "a
regional manager who oversees several branch managers" as a role at all.
`BRANCH_MANAGER` exists; there is no `REGIONAL_MANAGER` or equivalent
between branch manager and owner, even though a 6-branch franchise
structurally needs exactly that layer, and Tarek is currently squeezed
into either the owner role (too much, sees the whole tenant, not scoped
sensibly to "his" branches if the network ever grows beyond what one
person should own outright) or a branch manager role scoped to all six
branches (which the branch manager permission template and its pages
were never designed to aggregate across).

**20.2 — Staff turnover/tenure is not tracked at all.**

Nothing in the schema records when a `StaffUser` left, why, or computes
tenure. For a business where turnover is a named, tracked operational
problem, this is a real gap in People & Performance (Phase 10), not
merely a reporting gap — the underlying fact (an account being
deactivated) may not even distinguish "left the company" from
"temporarily suspended" from "role changed," which matters for a
turnover metric to mean anything.

**20.3 — Franchise-standard compliance (18.1/18.2) has no owner-level
enforcement view.**

Even if 18.1/18.2 were solved at the definition level (network-locked
checklist), Tarek still needs a dashboard answering "which branches are
actually compliant, right now" — which is a reporting/oversight surface
on top of the underlying compliance data, and needs to exist before
Tarek can do the part of his job that is literally "make sure all six
branches are the same business."

**20.4 — Inventory reorder independence across branches has no
network-level visibility.**

Each branch reordering independently is a legitimate operational choice
(local supplier relationships, local demand patterns) — but Tarek, at
the network level, has no way to see aggregate purchasing, compare
reorder discipline across branches, or catch a branch that's
chronically under-stocked versus one that's over-ordering. This is
Inventory Reports (built, Phase 7) scoped correctly for a *single*
inventory manager's warehouses — and, like everything else in this
scenario, simply has no equivalent rolled up to the network level.

---

## What Workshop D adds to the phase brief

| Finding | Recurs in | Phase that should own it |
|---|:--:|---|
| No data import path for any entity | B (bulk staff) | **17**, foundational onboarding gap |
| No bulk data correction tool | B | **17** |
| Catalog import losing tuned reorder history | — | **17** |
| Per-job SLA/target-duration with active alerting | A, C | **16**, sharpened to its hardest form here |
| Plate-scan / fast-intake hardware path | A (quick job) | new work, integration surface |
| SLA compliance as a reportable metric | — | Phase 12, depends on 17.1 |
| Network-scoped vs. branch-scoped specialization override | B, C | **15/17** — a second capability-engine-shaped problem |
| Compliance/completion signal for required checklists | — | **16** |
| Speed-vs-thoroughness incentive conflict, designed together | — | cross-cutting note for 16 + 10 |
| Lightweight recommendation/upsell mechanism, distinct from customer decisions | — | new work, distinct from Phase 11 |
| Recommendation/finding record with accept/decline outcome | A, C | **15/16** |
| Conversion-rate reporting | — | Phase 12 |
| Customer complaint/dispute record tied to a work order | — | Phase 10 or new surface |
| A regional-manager role between branch manager and owner | B | **17**, role model gap |
| Staff turnover/tenure tracking | — | Phase 10 |
| Owner/network-level compliance dashboard | B | Phase 12, depends on 16/18 |
| Network-level inventory visibility across branches | B | Phase 7/12 revisit |

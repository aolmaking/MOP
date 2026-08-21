# Workshop B — El-Makkawy Multi-Brand Service Centers

> **Scenarios 6–10 of 20.**

---

## The workshop

**El-Makkawy** — an authorized multi-brand dealership service network:
Cairo (flagship, 8 bays), Giza (5 bays), 6th of October (5 bays), Mansoura
(4 bays). 22 bays total.

| | |
|---|---|
| Branches | 4 |
| Warehouses | 4 branch warehouses + 1 central regional warehouse |
| Owner | Osama, does not visit branches weekly — reads reports |
| Branch managers | 4, one per branch |
| Technicians | 38 across all branches, organised into 9 teams |
| Team leaders | 9 |
| Inventory manager | 2 — one central, one who floats between branches |
| Data analyst | 1, reports to Osama directly |
| Cars per day | ~180 across the network |
| Work | Full dealership service: warranty work, recalls, major diagnostics, body-adjacent mechanical, insurance jobs |
| Money | Card, bank transfer, insurance billing, corporate fleet accounts |
| Records before MOP | A legacy DOS-era dealer system, still running in parallel for warranty claims |

**Specializations:** manufacturer warranty claim numbers, recall
campaign codes, insurance claim reference numbers, diagnostic trouble
codes (DTCs) per system, torque specs per fastener, fleet account
billing terms, technician OEM certifications per brand. None of these
exist in MOP as concepts.

---

## SCENARIO 6 — Onboarding a network, not a shop

**The super admin tries to set up a 4-branch, 38-technician workshop from
Add Workshop Owner.**

### What happens

The super admin opens **Add Workshop Owner**. The form asks for one name,
one slug, one country/city, one business type, one currency, one
timezone, one owner. There is exactly one address field's worth of
identity for the whole tenant.

Branches are created *after* the tenant exists, one at a time, through no
page that is built yet — Branch is a table with no CRUD surface anywhere
in the spec set beyond the platform drawer's read-only list. Someone has
to seed four branches directly against the database, because the product
has no page for "add a branch to an existing workshop."

38 technicians need accounts. There is no bulk-invite. Each one is either
seeded directly or would need 38 individual invites through a flow built
for a single owner (`invite.service.ts`'s `describe()`/`accept()`),
which was designed for one person to accept one link, not for an admin
to provision a roster.

9 teams need creating. **Team Setup** exists now (Phase 5.G), but it is
delegation-gated per branch manager and built for a manager adding
members to a couple of teams they can see on one screen — not for
standing up 9 teams across 4 branches from a spreadsheet the moment the
contract is signed.

Two inventory managers need `warehouseScope` set correctly: one to all
four branch warehouses plus central, one to none (floats). Nothing in
platform onboarding walks anyone through scope assignment; it is a raw
array on `StaffUser` set by whoever has database access.

By the time El-Makkawy's network is actually represented in MOP, three
different people did SQL, not three different people used the product.

### The core mistakes

**6.1 — Add Workshop Owner assumes a workshop is one location.**

The form has no concept of "how many branches, with what names and
capacities, on day one." A dealership network is set up wrong from the
very first screen, because the screen was designed for Nafath's shape
and dealerships pay for the same plan tier as quick-service shops with a
bigger number typed into "max branches."

*What is missing:* branch definition as part of onboarding, not an
afterthought — directly relevant to the user's "detected at creation"
idea, because a network's branches, their bay counts, and their initial
warehouse setup are exactly the kind of structural fact that should be
declared once, at creation, by someone who knows the deal.

**6.2 — There is no bulk staff provisioning.**

One invite link, one person, every time. A 38-technician onboarding
needs a CSV import or a bulk-invite screen that creates N accounts with N
roles and N branch/team assignments in one submission, each producing
its own invite link or SMS.

**6.3 — Team Setup does not scale to network onboarding.**

Team Setup (5.G) is correctly scoped for ongoing management by a branch
manager who already has a roster. It is the wrong tool for "stand up 9
teams from zero," which needs a different, bulk-oriented surface — likely
a platform-side or owner-side onboarding wizard, not the delegated
per-branch page.

**6.4 — Warehouse-to-branch topology is implicit and unverified.**

Nothing in the product checks that El-Makkawy's central warehouse is
reachable by all four branches for transfers, or flags that Mansoura (4
bays, furthest branch) might need its own buffer stock because transfer
lead time from Cairo central matters. The transfer mechanism (`Stock
Ledger`, Phase 7) exists; the *planning* of a multi-warehouse topology at
onboarding does not.

---

## SCENARIO 7 — A warranty claim and a recall, on the same car

**A Hyundai under manufacturer warranty comes in for an open recall
campaign, and the software has no concept of either.**

### What happens

A customer's Elantra, still under the manufacturer's 5-year warranty, is
booked into Cairo flagship for a recall — a wiring harness campaign the
manufacturer issued three months ago. The service advisor (functionally
a branch manager here) checks the VIN against the recall list… on the
legacy DOS system, because MOP has nowhere to record or check a recall
campaign.

Intake happens in MOP normally: plate, VIN (this workshop DOES capture
VIN properly — it matters for warranty), make, model, year. Complaint:
"Recall campaign HC-2026-014, wiring harness."

The technician, Karim, does the work. He needs to log:
- The recall campaign code, for the manufacturer's claim submission
- Labour hours against the manufacturer's flat-rate time (not what he
  actually took — dealership warranty billing is by *flat rate*, a
  concept MOP's finance system has never heard of)
- A warranty claim number issued by the manufacturer's portal (external
  to MOP entirely)
- Photos of the completed harness routing, required by the manufacturer
  for audit

None of this has a field. Karim writes the campaign code and claim
number into the work order's notes. The photos go into his phone's
camera roll, not the work order — MOP's work card has no photo/attachment
tool at all, on any workshop's card, for any purpose.

At month-end, the branch manager has to reconcile what MOP shows was
"invoiced" (nothing — warranty work isn't billed to the customer) against
what the manufacturer actually reimbursed, by re-typing everything from
notes into the manufacturer's own claim portal.

### The core mistakes

**7.1 — There is no warranty-claim billing party.**

MOP's finance model has exactly one payer concept: the customer, via
`InvoiceCandidate` and running balance. A dealership routinely bills the
**manufacturer** (warranty), an **insurer** (accident work), a **fleet
account** (corporate), or the **customer** (out-of-pocket) — often on the
same work order, different lines to different payers.

*What is missing:* payer as a first-class attribute per work item, not
just per invoice — the same "cost attribution" gap Workshop A hit from
the rework angle (3.1), now hit from the billing-party angle. This is
the same missing concept surfacing twice, which is itself a signal it
belongs in Phase 8's revisit, not as two separate patches.

**7.2 — Flat-rate labour billing does not exist.**

Dealership warranty and much retail service billing is by **flat rate**
(the manufacturer's published time for a job) not actual technician
time. MOP's running invoice bills what was worked. There is no concept of
a labour catalog with flat-rate hours per operation, separate from
actual elapsed time — which also means Karim's *performance* (fast vs.
flat rate) is unmeasurable, a People & Performance gap for Phase 10.

**7.3 — No attachment/photo capability anywhere in the product.**

Not on the work card, not on an inspection, not on a decision, not on an
invoice. For warranty and insurance work, photo evidence is not
optional — manufacturers reject claims without it. This is a flat gap
across every workshop type; Workshop D (below) hits it for a different
reason (proof of pre-existing damage at drop-off).

**7.4 — Recall campaigns and open service bulletins have no home.**

There is no concept of "this VIN has an open action" anywhere in the
Asset model. A dealership needs to know, at intake, whether a VIN has
open recalls — ideally surfaced automatically. MOP has no field for it
and no way to flag it even manually per asset.

---

## SCENARIO 8 — A technician who is only certified on one brand

**Karim is Hyundai-certified. A Kia comes in and the board does not know
he shouldn't take it.**

### What happens

The team leader for Bay 3, Rania, is short-staffed — two technicians out
sick. A Kia Sportage needs a transmission diagnostic. The only free
technician is Karim.

MOP's Work Orders board shows Karim as simply "TECHNICIAN," available,
idle. Nothing distinguishes that he holds Hyundai OEM diagnostic
certification and not Kia's — even though the two brands use different
diagnostic protocols on this platform generation, and El-Makkawy's
manufacturer agreements *require* certified technicians on certain job
types or the warranty claim is void.

Rania assigns him anyway, out of options. He does his best with a
generic OBD-II reader instead of the Kia-specific tool, misreads a
transmission code, and the car goes out with a partial fix. It comes
back four days later, now a comeback — a second job, second set of parts,
a customer who is now unhappy twice.

Rania has no way to have seen this coming from the board. There is no
"required certification" on the job, no "held certifications" on the
technician, and nothing that would have shown her — before assigning —
that this specific pairing was a risk.

### The core mistakes

**8.1 — Technician skill/certification is entirely unmodelled.**

This is 3.4 from Workshop A (Mido vs. Ashraf), but the dealership version
is sharper: it isn't "supervise the apprentice," it's "this exact
job/brand pairing requires a credential the workshop can name, expires,
and needs renewing." Both workshops need the same underlying concept —
**workshop-defined technician attributes, checked against
workshop-defined job requirements** — expressed at different levels of
formality.

**8.2 — Comebacks are invisible as a category.**

MOP has no concept of "this work order is a comeback related to that
closed work order." The Kia's second visit is just a new work order, with
no link back to the first, no flag, no signal to Osama's monthly reports
that this branch/technician pairing has a comeback problem. Comeback rate
is one of the most-watched metrics in any real service operation and MOP
cannot produce it because it cannot even *detect* the relationship.

**8.3 — The board shows availability, not suitability.**

Work Orders' assignment surface answers "who is free" — a scheduling
question. It never answers "who is right for this," which needs skill
data (8.1) plus a job-requirement declaration on the service/complaint
type. Assignment today is a capacity match; it needs to be a capability
match too.

**8.4 — Multi-brand identity on the asset itself is thin.**

`Asset.make`/`model` are free strings. There is no manufacturer-specific
data model — no per-brand service bulletin feed, no per-brand diagnostic
protocol flag, nothing that could even in principle drive "this job on
this brand needs that certification" automatically. It would have to be
manual, workshop-declared data, which again is the specialization engine
the user is describing.

---

## SCENARIO 9 — Osama looks at four branches at once

**The owner tries to compare his branches and cannot, because nothing in
MOP is built to be compared across branches.**

### What happens

Osama, from his Cairo office, wants to know: which branch is
underperforming? He has heard Mansoura is slow but wants numbers.

He signs in. Owner Home does not exist (5.3 from Workshop A, unchanged).
Audit & Change History exists — a single filterable list of
`AuditLog` rows across the *whole tenant*, with no branch column exposed
in the UI, no branch filter, and no aggregation. He can see that
`work_order.created` happened 4,200 times this month, tenant-wide, with
no way to break it down per branch without opening each row.

He tries Reports. There is no Owner-level Reports & Analytics page built
at all (Phase 12, not started). The only reports that exist are
Inventory Manager's own — warehouse-scoped, permission-gated to
`reports.inventory.view` which Osama, as owner, does not automatically
hold (permissions are role-template defaults; an owner's default role
permission set was written for governance actions, not for reading
inventory numbers he never explicitly granted himself).

He asks his data analyst, Yara, to pull it. Yara has role
`DATA_ANALYST`. Her landing page is `analytics-home` — which maps to
nothing; Phase 12 has not started, so she lands on the placeholder home
same as anyone whose role has no page yet. She has no dashboard, no
report builder, no export. She opens the database directly — she is
trusted with `psql` access, which is itself uncomfortable for a
"data analyst" role that was supposed to be scoped read access, not raw
SQL.

Osama gets his branch comparison, four days later, from a hand-written
query, not from the product he pays for.

### The core mistakes

**9.1 — Nothing in MOP is branch-comparable.**

Every report that exists (inventory) is scoped to warehouses in a
manager's own scope, by design — correctly, for that role. But there is
no equivalent at the owner/network level: nothing shows "branch A vs
branch B vs branch C vs branch D" for revenue, throughput, comeback
rate, technician utilisation, or customer retention. This is Phase 12's
entire job, and until it exists, a 4-branch network cannot use MOP for
the one thing multi-branch operators most need software for.

**9.2 — Audit & Change History has no branch dimension in the UI.**

The underlying data likely supports it (work orders and staff carry
branch associations), but the built page shows no branch column, no
branch filter, and no per-branch counts. For a single-branch workshop
this is invisible; for a 4-branch one it makes the one Owner page that
exists nearly useless for oversight.

**9.3 — The Data Analyst role has no product surface at all.**

A role exists in the permission manifest and the schema. Nothing is
built for it. That is an honest, disclosed gap (Phase 12 is simply not
started) — but it means a 4-branch dealership's data analyst, hired
specifically to do this job, currently does it by direct database
access, which is a governance problem MOP itself would flag if a
*customer* did it (see Workshop D's data-exposure scenario).

**9.4 — Comparable metrics do not exist yet to be compared.**

Even with a report builder, branch comparison needs branch-normalised
metrics: revenue per bay, jobs per technician, comeback rate. Several of
these depend on concepts this document has already found missing —
comebacks (8.2), promise time and throughput (Workshop A, 4.1) — so
Phase 12 is downstream of gaps found in Phases 15–17, not independent of
them.

---

## SCENARIO 10 — A fleet account and a corporate contract

**A logistics company with 40 vans on a service contract needs billing
MOP cannot do.**

### What happens

El-Makkawy holds a fleet contract with a logistics company: 40 vans, net-
30 invoicing, a 12% negotiated discount on parts and labour, one monthly
consolidated invoice instead of 40 separate ones, and a named account
contact who is not any single vehicle's "customer."

A van comes in for scheduled service. Intake needs a **customer**. The
model is `Customer` — a person, with a phone number, tied to assets by
ownership history. There is no **account** concept above the customer: no
"this asset belongs to Fleet Account X, bill Fleet Account X, apply
Fleet Account X's contract terms" layer.

The branch manager creates a `Customer` record for "شركة الشحن السريع
(Logistics)" and treats the company as if it were a person. Each of the
40 vans gets intake'd against this one "customer." The 12% discount has
to be applied manually, line by line, on every invoice, by memory,
because there is no contract-level pricing rule.

At month end, El-Makkawy needs ONE invoice covering all 40 vans'
visits that month. MOP's invoice model (Phase 9, not yet built, but
designed around `InvoiceCandidate` per work order) produces one invoice
per work order. There is no consolidation.

The finance team exports 40 separate invoice PDFs and manually builds a
summary spreadsheet to send the client, which is exactly the kind of
work MOP exists to eliminate.

### The core mistakes

**10.1 — There is no B2B account concept above Customer.**

`Customer` models a person. A dealership's largest, most valuable
customers are frequently *companies* — fleets, insurers, corporate
accounts — with their own billing terms, their own contact hierarchy
(one billing contact, several drivers), and their own contract pricing.
Modelling a company as a `Customer` with a phone number is a category
error the schema has no other option for.

*What is missing:* an **Account** entity, distinct from `Customer`, that
can own multiple assets, multiple contacts, and contract-level pricing
rules — directly relevant to Phase 8/9's pricing and invoicing revisit.

**10.2 — Contract-level pricing rules do not exist.**

Pricing today is per-item (`sellingPrice`) with per-line discount
percentages entered by hand. There is no concept of a **standing
discount** tied to an account, applied automatically to every line for
every visit under that contract, for the life of the contract. This is
exactly the kind of business rule a dealership's finance team assumes
software does for them.

**10.3 — Invoice consolidation across multiple work orders does not
exist.**

Every invoice concept in the spec, built or planned, is one-work-order-
to-one-invoice. A monthly consolidated invoice for a fleet account is a
different document shape entirely — a summary invoice referencing many
completed work orders in a billing period. Phase 9's `GenericBillingAdapter`
seam is the right place to decide whether this is in scope, but nothing
in the current design anticipates it.

**10.4 — Even if Account existed, there is no way to attach one at
intake without re-typing per vehicle.**

Forty vans, one account. Intake as currently designed asks for a
customer per asset every time. A fleet account needs "select the account,
select or add the van," not "type the company name as a customer, 40
times, hoping for consistent spelling" (and Mrs Nadia's returning-plate
match in Workshop A only worked because of exact plate matching — a
company name typed 40 times will not match itself reliably).

---

## What Workshop B adds to the phase brief

| Finding | Recurs in | Phase that should own it |
|---|:--:|---|
| Branch definition as part of onboarding | C, D | **17** |
| Bulk staff provisioning / CSV import | C, D | **17** |
| Payer as a first-class attribute (warranty/insurer/fleet/customer) | A (rework), C, D | Phase 8/9 revisit |
| Flat-rate labour billing, separate from actual time | C | Phase 8 revisit |
| Attachment/photo capability on work items | A, D | new work, pre-15 |
| Recall/campaign flags on assets | — | **16** |
| Technician certification vs. job requirement | A | **16** |
| Comeback detection and linkage between work orders | C, D | **16** |
| Branch-comparable reporting (Phase 12 prerequisite) | C, D | 12, blocked on 15–17 |
| Data Analyst role has no surface | — | 12 |
| B2B Account entity distinct from Customer | C | **17** / Phase 8 revisit |
| Contract-level standing pricing rules | C | Phase 8 revisit |
| Invoice consolidation across work orders | — | Phase 9 revisit |

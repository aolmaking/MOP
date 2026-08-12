# Scenario Findings — Synthesis

> Source: [`WORKSHOP_A_NAFATH.md`](./WORKSHOP_A_NAFATH.md),
> [`WORKSHOP_B_ELMAKKAWY.md`](./WORKSHOP_B_ELMAKKAWY.md),
> [`WORKSHOP_C_DELTA_HEAVY.md`](./WORKSHOP_C_DELTA_HEAVY.md),
> [`WORKSHOP_D_SPEEDLUBE.md`](./WORKSHOP_D_SPEEDLUBE.md) — 20 scenarios,
> 4 workshops chosen to be as different as possible in size, facilities,
> branch count, technician count and way of working: a 1-bay single-
> operator quick shop, a 4-branch 38-technician dealership network, a
> field-service heavy-equipment operation where most work happens off-
> site, and a 6-branch high-volume franchise chain.
>
> This document turns 78 individual findings into the three phases the
> user asked for. It exists so the phase docs don't repeat 20 scenarios'
> worth of reasoning — each phase doc below points back here for the
> "why," and forward to its own detail doc for the "how."

---

## The one finding underneath all the others

Every workshop in this set is the same six-system spine. None of them
needed a different spine. What they needed, over and over, in 78
different specific instances, was **the spine filled in with their own
vocabulary** — their own service types, their own fields on those
services, their own inspection checklists, their own blocker reasons,
their own position/component names, their own credential names, their
own SLA — declared once, ideally at the moment the super admin creates
the workshop, and enforced everywhere after that.

This is exactly the user's framing: *"every workshop has its own
specializations, hundreds of specializations, so all of them been
detected and edited from the beginning from the super admin."* The
scenarios were written to test that claim against 20 concrete days, and
it held up every time — the biggest, most repeated class of defect
across all four workshops is **the product hardcoding something that is
actually workshop-specific.**

---

## Findings grouped by shape

Reading all 78 findings together, they sort into five shapes, not
randomly — each shape is a different kind of missing thing.

### Shape 1 — Missing vocabulary (the specialization gap itself)

The literal thing the user named. Recurs in every single workshop:

- Service cards with workshop-defined fields (A 1.2, C 14.1, D 19.2)
- Intake field sets defined per workshop, not per product (A 1.4)
- Position/component taxonomies per category (A 2.4, C 14.1)
- Workshop-defined blocker reasons (A 3.2)
- Workshop-defined diagnostic/measurement forms (C 14.1)
- Warranty as a workshop-defined attribute (A 2.2)
- Skill/certification/authorisation defined by the workshop (A 3.4, B 8.1)
- Network-scoped vs. branch-scoped specialization override (D 18.1) —
  the sharpest version, because SpeedLube proved specialization needs
  its own small capability-engine, not just a form builder

### Shape 2 — Missing structural concepts (not a field, a whole idea)

Things no amount of custom fields would fix, because the underlying
model doesn't have the concept at all:

- Promise time, queue, appointments, scheduling (A 4.1 — the single
  largest gap in the whole document, found independently in all four
  workshops)
- Resources with workshop-defined types: lifts, bays, crews, pits (A 4.2)
- Multi-session/multi-day jobs at multiple locations (C 11.1)
- Work-order-to-work-order linkage: comeback, follow-up, parent/child
  (B 8.2, C 13.4, C 11.4)
- Payer as a first-class attribute, separate from the invoice (B 7.1,
  C 15.1) — warranty, insurer, fleet account, rework, customer
- B2B Account entity distinct from Customer (B 10.1)
- Location/site entity with persistent facts and travel time (C 12.1)
- Append-only addenda on closed work orders (C 13.1)
- A regional-manager role between branch manager and owner (D 20.1)
- One person holding several roles in a small workshop (A 1.1)

### Shape 3 — Missing capability, present nowhere in the product

Not workshop-specific at all — flat gaps that would help every
workshop, found because a scenario happened to exercise them:

- Attachment/photo capability on any work item (A 7.3, C 13.2)
- No data import path for any entity, ever (D 16.1)
- No bulk data correction tool (D 16.2)
- Outbound customer messaging with workshop-written templates (A 4.4)
- Direct-purchase parts that never touch a warehouse (A 2.1)

### Shape 4 — Finished-but-unreachable, and Owner starvation

Not a new finding — the pattern the project already knows about (see
`PROJECT_STATE.md`'s "finished systems with no door") — but the
scenarios prove it is *worse* for smaller and single-operator workshops,
because Owner is the only role in some of these businesses:

- The owner of a one-person workshop lands on an audit log (A 1.1, 5.1)
- Reporting is warehouse-shaped, not money-shaped or branch-shaped
  (A 5.2, B 9.1, D 20.1)
- No customer as a subject — only as a field (A 5.3)
- Data Analyst role has no product surface (B 9.3)

### Shape 5 — Design-fit problems (the right thing, wrong weight)

The rarest and most interesting class: not a missing feature, a feature
that exists but is shaped for the wrong situation:

- The customer decision link is correctly heavy for a safety warning
  and wrong for a wiper-blade upsell (D 19.1) — the fix is a *second*,
  lighter mechanism, not changing the first
- The delivery gate's "paid then released" is right for Nafath and
  wrong for Delta's net-30 B2B jobs (A 1.3 vs. C 15.1) — same gate,
  opposite complaints, resolved by making the policy workshop/account-
  configurable rather than picking a side

---

## Frequency table — what to build first

| Finding (shape) | A | B | C | D | Count |
|---|:--:|:--:|:--:|:--:|:--:|
| Promise time / queue / scheduling | ✅ | ✅ | ✅ | ✅ | **4** |
| Service cards / structured findings with workshop-defined fields | ✅ | | ✅ | ✅ | **3** |
| Work-order-to-work-order linkage | | ✅ | ✅ | | 2 |
| Payer as first-class attribute | | ✅ | ✅ | | 2 |
| Attachment/photo capability | ✅ | | ✅ | | 2 |
| Skill/certification as workshop-defined data | ✅ | ✅ | | | 2 |
| Resources with workshop-defined types | ✅ | | ✅ | | 2 |
| Expected duration / SLA / over-run signal | ✅ | | ✅ | ✅ | **3** |
| Branch/network-level comparable reporting | ✅ | ✅ | | ✅ | **3** |
| Bulk staff/data provisioning and import | | ✅ | | ✅ | 2 |
| B2B Account distinct from Customer | | ✅ | ✅ | | 2 |
| Owner starvation (no Owner Home, no money view) | ✅ | ✅ | | ✅ | **3** |

Four findings recur in every single workshop this document imagined.
Scheduling is the clearest case of all: no amount of capability removal,
no amount of field customization, fixes a product that has no idea a
job was promised for a time.

---

## The three phases

The user asked for three phases whose entire purpose is *discovery* —
"to discover what else we can add this feature to." Framed against the
findings above:

### Phase 15 — Specialization Discovery

Prove the specialization idea against real service types, real
measurement forms, and real category vocabularies, for a small number of
pilot workshops drawn from this document's four shapes. Output is a
**catalog of specialization primitives** (service card, measurement
form, position taxonomy, credential, blocker reason) with a schema
verdict for each, the same discipline Phase 2 applied to scenarios.
Detail: [`PHASE_15.md`](../phases/PHASE_15.md).

### Phase 16 — Specialization Structure

Where Phase 15 finds and names the primitives, Phase 16 builds the
structural concepts they depend on and that recur regardless of
specialization: scheduling/promise time, resources, work-order linkage,
payer attribution, SLA clocks, addenda on closed work orders. This is
the largest phase of the three, because Shape 2 above is the largest
category of finding. Detail: [`PHASE_16.md`](../phases/PHASE_16.md).

### Phase 17 — Specialization at Creation

Where Phase 15 names the primitives and Phase 16 builds their
foundations, Phase 17 is the one the user described most specifically:
the super admin, at Add Workshop Owner, declaring a workshop's
specializations — which service cards, which measurement forms, which
category vocabulary, which network-vs-branch override policy — as part
of creating the tenant, plus the bulk onboarding (staff, data import)
every multi-branch workshop in this document needed and none had.
Detail: [`PHASE_17.md`](../phases/PHASE_17.md).

**Order matters and is deliberate.** Discovery before structure before
creation-time configuration — building the configuration UI (17) before
knowing what it configures (15) or having anything underneath it to
configure (16) would repeat the exact mistake Phase 7 made once already:
building ahead of a settled schema question.

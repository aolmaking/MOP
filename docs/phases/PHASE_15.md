# Phase 15 — Specialization Discovery

> **Status:** ⬜ not started. Follows Phase 14 in sequence, but see
> `docs/PHASE_MAP.md`'s dependency note — 15–17 are discovery-and-
> foundation phases and may be pulled forward if a specific pilot
> workshop needs them sooner than the numeric order implies.
> **Source:** [`docs/scenarios/FINDINGS_SYNTHESIS.md`](../scenarios/FINDINGS_SYNTHESIS.md),
> Shape 1 findings across all 20 scenarios.

## Why this phase exists

Every one of the 20 scenarios in `docs/scenarios/` hit the same wall
from a different direction: MOP has one vocabulary — its own — and every
real workshop needs its own. Nafath needs an oil-change service card
with viscosity and litres. Delta needs a hydraulic pressure diagnostic
form with six test points. SpeedLube needs a 21-point checklist that is
identical across six branches and cannot be quietly shortened. These are
not the same feature wearing different labels; they're different
answers to one underlying, unbuilt question: **what does a workshop-
defined "thing to fill in" actually look like, generically, in the
schema?**

Phase 15 does not build the super-admin configuration screen (that's
Phase 17) and does not build the structural concepts specializations
attach to — scheduling, resources, linkage (that's Phase 16). It answers
the schema question first, the way Phase 2 settled schema questions
before Phase 4 built the lifecycle on top of them.

## What "specialization primitive" means here

Five kinds of workshop-defined vocabulary surfaced repeatedly enough to
name as distinct primitives, each needing its own schema verdict:

1. **Service card** — a named service ("Oil Change") with a set of
   typed fields (viscosity: enum, litres: decimal, filter type: text)
   filled in by a technician on a work item. Source: A 1.2, C 14.1's
   sibling need, D 19.2.
2. **Measurement/diagnostic form** — a named set of test points, each
   with a value type and unit (bar, volts, mm), filled in during
   inspection, comparable across visits once Phase 16's linkage exists.
   Source: C 14.1.
3. **Position/component taxonomy** — a per-category vocabulary for
   "where on the asset" (FL/FR/RL/RR for cars, cylinder number for
   generators). Source: A 2.4.
4. **Credential/skill** — a named, workshop-defined attribute a
   technician can hold, with an optional expiry, checked against a job
   requirement. Source: A 3.4, B 8.1.
5. **Blocker reason** — a workshop-defined reason mapped to a fixed,
   product-owned *behaviour* (pause the clock? escalate? notify?).
   Source: A 3.2.

## What this phase does

- **Audit each primitive against the existing schema** the way Phase 2's
  scenario matrix worked: for each of the five, is it representable
  today (no), with a small addition (maybe), or does it need new tables
  (mostly yes) — write the verdict down, don't guess.
- **Design the primitive as data, not as a feature per workshop.** A
  service card definition is itself data a workshop authors — not a new
  Prisma model per service type. This is the same discipline the
  capability engine already applies to the workflow graph: the *engine*
  is code, the *shape* is configuration.
- **Prove it against three of the four scenario workshops**, not all
  four and not a hypothetical — pick concrete cases already written up:
  Nafath's oil-change service card, Delta's hydraulic diagnostic form,
  SpeedLube's 21-point checklist (which also needs Phase 16's network-
  vs-branch override, so its full implementation may straddle 15/16).
- **Explicitly defer the authoring UI.** Phase 15's exit is "the data
  model is settled and a service card can be created via API/seed,"
  not "a super admin can build one by hand" — that's Phase 17.

## What this phase deliberately does not do

- No super-admin creation-time UI (Phase 17)
- No scheduling, resources, SLA clocks, or work-order linkage
  (Phase 16), even though several primitives above will eventually
  attach to them
- No retrofitting existing pages (Technician's work card, Inventory
  Manager's catalog) to *use* the new primitives beyond what's needed to
  prove the schema — that's follow-on work once 15–17 land

## Exit criteria

Each of the five primitives has a written schema verdict (representable
now / small addition / new tables) with the addition made where small,
and a migration where not. At least one real service card, one
measurement form, and one credential are proven end-to-end (created as
data, filled in by a technician, stored, read back) against a seeded
version of one of the four scenario workshops. No open "needs schema
change" markers remain, matching Phase 2's own exit bar.

## Open questions to settle during the phase, not before it

- Does a service card definition version — i.e., if a workshop edits
  the "Oil Change" card's fields after 200 have already been filled in,
  what happens to the old 200? (Likely: definitions are versioned,
  filled cards keep the version they were filled against — the same
  pattern capability profiles use for historical interpretation.)
- Are position taxonomies global-per-category or workshop-overridable
  per-category? (Scenario evidence leans toward category defaults with
  workshop override, not fully free-form per workshop — otherwise two
  workshops' data becomes incomparable for no reason.)

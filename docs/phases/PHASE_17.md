# Phase 17 — Specialization at Creation

> **Status:** ⬜ not started. Depends on Phase 15 (primitives exist as
> data) and Phase 16 (structures the primitives attach to exist).
> **Source:** [`docs/scenarios/FINDINGS_SYNTHESIS.md`](../scenarios/FINDINGS_SYNTHESIS.md),
> the user's core framing: *"the details of the card will be detected
> — the fields he will fill — while making a new workshop account, from
> the super admin."*

## Why this phase exists

This is the phase the user described most literally. Phases 15 and 16
build the *thing that can be specialized* and the *structures it
attaches to*. Phase 17 is where the **super admin, creating a new
workshop, declares what that workshop's specializations actually are** —
which service cards it starts with, which measurement forms, which
position taxonomy, which blocker reasons, which resource types, whether
specializations are locked network-wide or branch-overridable — as part
of `Add Workshop Owner`, not as a settings page discovered later.

Scenario 6 (Workshop B) proved why order matters: El-Makkawy's 4-branch,
38-technician onboarding was done partly through SQL because nothing in
the product handles bulk structure at creation time. Scenario 16
(Workshop D) proved the same for data migration. Phase 17 is where both
get fixed together, because they are the same underlying problem —
*creating a real, already-shaped workshop is not a form with eight
fields*, whatever `Add Workshop Owner` currently assumes.

## What this phase builds

### 17.A — Specialization declaration at workshop creation

Extends `Add Workshop Owner` (or replaces it with a wizard — this
phase's own first decision) so the super admin, at creation time, picks
or authors:
- starting service cards (from a library of common ones — "Oil Change,"
  "Brake Service" — plus custom)
- starting measurement forms if the workshop's category implies them
  (heavy equipment, generators)
- the category's position/component taxonomy, with override
- initial blocker reasons beyond the product defaults
- initial resource types (lifts, bays, pits, crews) and instance counts,
  informed by 16.B
- whether this workshop's specializations are network-locked (multi-
  branch chains, per Phase 16's 16.I) or branch-editable

This is explicitly **not** "one giant form" — the scenarios showed
Nafath and El-Makkawy need almost none of the same declarations. The
UI should offer a small number of **starter profiles** (quick-service,
dealership, field-service, franchise-chain) that pre-select sensible
defaults, editable afterward — the same "starter template" idea the
codebase already uses for the Builder Control (`starterBuilderTemplate`
on `CreateWorkshopPayload`), extended to cover specialization, not only
capabilities.

### 17.B — Branch definition as part of onboarding

B 6.1. A multi-branch workshop declares its branches — name, address,
initial resource counts — during creation, not by direct database
access afterward.

### 17.C — Bulk staff provisioning

B 6.2, D 16.1 (staff half). CSV or structured bulk import producing N
accounts with N roles, N branch/team assignments, N invite links in one
submission — replacing the one-link-at-a-time invite flow for this
specific use case (the single-invite flow itself is correct and stays,
for the ongoing case of hiring one person).

### 17.D — Bulk data import: customers, assets, catalog

D 16.1, 16.3. A structured import path for the three entities every
migrating workshop needs: customers (with phone/name/last-visit),
assets (with ownership history), and catalog items (carrying price,
cost, and *tuned* reorder thresholds where the source system has them —
not just today's price). Validation errors surface per-row, not as a
single opaque script failure (this is where D 16.2's "bulk correction"
need is actually best solved — get the import validation right rather
than building a separate correction tool for bad imports after the
fact).

### 17.E — A regional-manager role

D 20.1. Between branch manager and owner: scoped to a subset of
branches (not all, not one), with the reporting/oversight surfaces
Phase 12 will eventually need to serve — this phase adds the role and
its scope; Phase 12 builds what it sees.

## What this phase deliberately does not do

- No new specialization *kinds* beyond what Phase 15 already designed —
  this phase is about *declaring instances* of primitives, not
  inventing new primitive types
- No general-purpose "import any entity" framework — the three entities
  named in 17.D are the ones the scenarios actually needed; a generic
  importer is a possible future phase, not this one
- No retrofitting existing workshops (the seed-demo tenant, any real
  workshop already onboarded) — this phase's exit is that *new*
  onboarding uses it; migrating already-onboarded workshops onto the new
  structures is separate, deliberate follow-on work, recorded here if it
  slips

## Exit criteria

A super admin can create a workshop matching each of the four scenario
shapes — Nafath (single-operator, minimal), El-Makkawy (multi-branch,
bulk staff, network-locked nothing), Delta (field-service resource
types, measurement forms), SpeedLube (network-locked checklist, bulk
customer import) — using only the product, with zero direct database
access, and the result is indistinguishable in the running product from
a workshop that had been manually configured by an engineer today.

## The dependency this phase does not get to skip

Phase 17 building the configuration UI before Phase 15 has a settled
schema, or before Phase 16 has built scheduling and resources, would
repeat Phase 7's own history: the inventory engine got ahead of a
settled schema question and lost time to it (see `PROJECT_STATE.md`'s
account of Phase 7's partial-fulfilment question, and the page-count
audit that found Phase 7 declared complete at half its owed pages).
15 → 16 → 17 is the order for the same reason waterfall exists in this
project at all: foundations first, because everything after inherits
them.

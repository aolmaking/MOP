# Phase 17 — Specialization at Creation

> **Status:** 🟠 17.A's backend seam shipped (starter-profile seeding at
> creation time); the full multi-shape wizard and 17.B–17.E are owed —
> see "What actually shipped" below.
> **Source:** [`docs/scenarios/FINDINGS_SYNTHESIS.md`](../archive/discovery/scenarios/FINDINGS_SYNTHESIS.md),
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

## What actually shipped

`CreateWorkshopDto.starterSpecializationProfile` (`NONE | QUICK_SERVICE | FIELD_SERVICE`, optional, defaulting to `NONE`) plus `PlatformService.seedStarterSpecializations()`, called inside the same transaction as tenant/owner/role-permission creation. `QUICK_SERVICE` seeds Nafath's oil-change service card; `FIELD_SERVICE` seeds Delta's hydraulic diagnostic form — the exact two cases Phase 15 already proved end-to-end, now reachable from workshop creation rather than only from a direct service call. `SpecializationService.defineCard()` gained an optional `tx` parameter so the seed participates in the same atomic transaction as the rest of `attemptCreateWorkshop` — a tenant created without its starter data (or vice versa) would be exactly the kind of partial-creation bug `attemptCreateWorkshop`'s existing one-transaction discipline already exists to prevent. Proven by two new integration tests over real HTTP: a chosen profile seeds a real, correctly-shaped definition; `NONE` seeds nothing (a real empty result, not a stub).

This is the backend seam 17.A needs, not the wizard UI. No "small number of starter profiles" *picker* was built on `Add Workshop Owner`'s form — the DTO field exists and is real, but nothing in `apps/web` sends it yet.

## What was deferred, with reasons

- **17.A's remaining scope** — the starter-profile UI (a picker on `Add Workshop Owner`), authoring a *custom* service card at creation time (vs. picking a pre-built one), position-taxonomy override at creation, initial blocker reasons, initial resource types/instances (blocked on 16.B, itself deferred), and the network-lock choice (blocked on 16.I, itself a design spike not an implementation). Each of these is real UI/product-design work distinct from the backend seam this pass proves.
- **17.B — Branch definition at onboarding.** Real, scoped, and independent of the rest of 17.A — a reasonable next slice, not started this pass for budget reasons alone.
- **17.C — Bulk staff provisioning** and **17.D — Bulk data import.** Both are substantial features (CSV parsing, per-row validation surfacing, N-account/N-record creation) that deserve their own pass with real test coverage of the validation-error path specifically, per the phase document's own emphasis that "validation errors surface per-row, not as a single opaque script failure."
- **17.E — Regional-manager role.** A new `StaffRole` touches `default-role-permissions.ts`, the permission manifest, `ScopeResolverService`, and `AuthService`'s session-resolution branch (the same shape Phase 10's `TEAM_LEADER` work touched) — real, scoped work for a future pass, not a one-line addition to squeeze in here.

## Exit criteria

**Not met this pass**, and not claimed to be: a super admin can create a workshop matching each of the four scenario shapes using only the product, with zero direct database access, indistinguishable from an engineer-configured workshop. What this pass proves is narrower and named precisely: the *backend* can already produce Nafath's and Delta's starter specialization data atomically at creation time. El-Makkawy (multi-branch, bulk staff) and SpeedLube (network-locked, bulk import) need 17.B–17.D and 16.I/16.B first — the exit criteria's own dependency chain (15 → 16 → 17) is why this pass did not attempt to force those through ahead of their prerequisites.

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

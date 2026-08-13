# Phase 15 — Specialization Discovery

> **Status:** ✅ schema settled and three of five primitives proven end-to-end;
> see "What actually shipped" below for the precise split.
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

## What actually shipped

Schema and services under `apps/api/src/specialization/`, migration `20260813010000_specialization_primitives`:

- **Service card & measurement form** — one shared pair of tables, `SpecializationDefinition` (`kind: SERVICE_CARD | MEASUREMENT_FORM`, `fields: Json` field-spec array, `version`) and `SpecializationEntry` (`values: Json`, `definitionVersion` pinned at fill time — the versioning open question below, answered). `SpecializationService` validates a filled entry's values against its definition's field types/required/enum-options at write time. **Proven end-to-end** against a seeded Nafath/Delta-shaped tenant in `specialization.integration.spec.ts`: an oil-change service card and a six-point hydraulic diagnostic form are each defined, filled by a technician, and read back with real stored values; a definition revision is proven to leave already-filled entries pinned to their old version.
- **Credential** — `CredentialDefinition` + `StaffCredential` (with `expiresAt`), `CredentialService`. **Proven end-to-end**: defined, granted to a technician, read back, and an expired grant correctly reports `isExpired`.
- **Position taxonomy** — `PositionTaxonomyEntry`, `tenantId: null` rows as the platform default, a workshop row overriding the whole list for its tenant rather than merging with the default (the open question below, answered). `PositionTaxonomyService` proven by test for both the fallback and the override case, but not wired into any consuming page yet — schema-and-read-path only, per this phase's own explicit deferral of retrofitting existing pages.
- **Blocker reason** — `BlockerReasonDefinition` (workshop-owned `code`/`label`, mapped to a fixed `BlockerBehavior` enum: `PAUSE_CLOCK | ESCALATE | NOTIFY | NONE`). **Schema only.** `TaskBlocker.reason` still uses the pre-existing fixed `BlockerReason` enum — retrofitting it to read from `BlockerReasonDefinition` touches a live, tested workflow path (`TaskBlocker`, the Team Leader blocker-visibility queries from Phase 10, the Attention Center) and was judged out of this phase's budget. Named here rather than silently done.

No controller/HTTP surface was built. The exit criteria explicitly separates "created via API/seed" from "a super admin can build one by hand" (Phase 17) — a direct service-level integration test satisfies the former exactly, and adding an HTTP layer with no consuming page yet would be exposing an endpoint nothing calls.

## Open questions — settled during the phase

- **Does a service card definition version?** Settled as predicted: yes. `SpecializationDefinition.version` bumps on every `reviseFields()` call, and `SpecializationEntry.definitionVersion` pins the version at fill time. Editing "Oil Change" after 200 entries exist leaves all 200 reading as version 1; the 201st reads as version 2. Proven by test.
- **Are position taxonomies global-per-category or workshop-overridable?** Settled as predicted: category defaults (`tenantId: null`) with a full-list workshop override, not a merge. Proven by test in both directions.

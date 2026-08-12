# Phase 16 — Specialization Structure

> **Status:** ⬜ not started. Depends on Phase 15's schema verdicts for
> anything that attaches a primitive to a structural concept (e.g. an
> SLA clock attached to a service card's expected duration).
> **Source:** [`docs/scenarios/FINDINGS_SYNTHESIS.md`](../scenarios/FINDINGS_SYNTHESIS.md),
> Shape 2 and Shape 3 findings.

## Why this phase exists

Phase 15 names the vocabulary. This phase builds the *structures* that
vocabulary lives inside — and these structures are not workshop-specific
at all. All four scenario workshops, independently, hit the absence of
scheduling. Three of four hit missing SLA/duration tracking. Two of four
hit missing work-order linkage and missing payer attribution. These are
gaps in the product's core model, found through the specialization lens
but not specialization problems themselves — every workshop in the
world needs to know when a job was promised for.

This is the largest of the three phases by a wide margin, because Shape
2 (missing structural concepts) is the largest and most consequential
finding class in the synthesis.

## What this phase builds

Ordered by how many scenarios depended on it, per the frequency table
in `FINDINGS_SYNTHESIS.md`:

### 16.A — Scheduling: promise time, queue, appointments

Found independently in all four workshops (A 4.1, B — implicit in
dealership booking, C 11.1's session scheduling, D 17.1's SLA clock).
The single highest-value addition in this entire document. Minimum bar:
a work order can carry a promised time; a queue view can order by it;
Nafath's walk-in queue and SpeedLube's SLA clock are both special cases
of the same underlying concept at different time granularities (queue
position vs. hard minute-level SLA).

### 16.B — Resources: lifts, bays, crews, pits, workshop-defined types

A 4.2, C 12.1. A workshop declares its resource types and instances at
setup (ties to Phase 17); work orders/sessions occupy a resource for a
span of time; the board can show "which lift is this on" and refuse to
double-book one.

### 16.C — Work-order linkage: comeback, follow-up, parent/child sessions

B 8.2, C 11.4, C 13.4 — three different reasons to link two work orders
together, converging on one relationship model: a work order can
reference another with a typed relationship (comeback-of, follow-up-of,
session-of-parent-job). Read paths (asset history, reports) use it; the
lifecycle does not need to change.

### 16.D — Payer attribution

B 7.1, C 15.1. A work item's cost is attributed to a payer — customer,
warehouse-rework, warranty, insurer, fleet account — as a field
alongside the existing money model, not a replacement for it. This
directly feeds Phase 8/9's revisit and should be designed jointly with
whoever owns that revisit, not independently.

### 16.E — SLA / expected-duration with alerting

A 3.3, C 11.3, D 17.1 (sharpest form). A service card (Phase 15) or work
order can carry an expected duration; the Attention Center gains an
over-run signal alongside its existing blocker/wait weighting; alerting
threshold (e.g. 15/20 minutes) is workshop-defined.

### 16.F — Location/site entity

C 12.1, C 12.4. A site distinct from the branch — persistent facts
(access notes, coordinates), used by field-service work orders. Travel-
time estimation is explicitly out of scope for this phase (it implies a
mapping integration, a separate, larger decision) — the entity and its
facts are in scope; routing is not.

### 16.G — Append-only addenda on closed work orders

C 13.1. A closed work order's outcome stays immutable; a new addendum
type allows attributed, timestamped additions after close (a delayed
lab result, a follow-up note) without reopening the lifecycle.

### 16.H — Attachment/photo capability

A 7.3, C 13.2. Flat gap, no workshop-specific angle. A generic
attachment on a work item, an inspection, or an addendum. Build once,
reuse everywhere it's needed rather than bolting it onto each surface
separately.

### 16.I — Network-scoped specialization override

D 18.1. The sharpest finding in the whole document: a chain needs a
specialization (SpeedLength's checklist) locked at the network level
so no branch manager can quietly weaken it, while other specializations
stay branch-local. This is closer in shape to the capability engine
than to a form builder — it may reuse capability-engine machinery
(profiles, an override-and-lock pattern) rather than invent a second one
from scratch. Flagged for early design spike, not blind implementation.

## What this phase deliberately does not do

- No super-admin authoring UI for any of the above (Phase 17)
- No mapping/routing/travel-time calculation (16.F is deliberately an
  entity plus facts, not a logistics engine)
- No B2B Account entity (that's judged to belong with Phase 8/9's
  revisit, since it's fundamentally a finance/billing concept that
  happens to also matter for scheduling — Account should be designed by
  whoever owns invoicing, informed by this phase's payer work, not
  built twice)

## Exit criteria

Each of 16.A–16.I has either shipped or has an explicit, reasoned
deferral recorded in this document with the phase that will carry it —
matching the project's stated discipline that a task not completed is
recorded with a reason, never silently dropped. At minimum, 16.A
(scheduling), 16.E (SLA), and 16.H (attachments) — the three findings
that recurred in three or more of the four scenario workshops — ship in
this phase; 16.I gets at least a design spike and a written recommendation
even if implementation slips to a follow-on phase, given its structural
resemblance to the capability engine and the risk of building it wrong
twice.

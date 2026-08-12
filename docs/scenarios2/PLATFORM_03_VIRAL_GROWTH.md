# Platform Scenario Set — Workshop 3: TuneUp (viral growth)

> **Scenarios 11–15 of 40.**

---

## The workshop

**TuneUp** — starts as a single Cairo branch, identical in shape to
Nafath (Workshop A, first scenario set). Chosen not for what it *is* but
for what happens to it: a viral social-media video about its owner
diagnosing a fault in ninety seconds sends business up 40× in six weeks,
and the owner franchises fast, badly, using MOP as the only system of
record throughout. This scenario set is about **the platform's own
elasticity**, not the workshop's day-to-day work.

| Week | Branches | Technicians | Notes |
|---|---|---|---|
| 0 | 1 | 2 | Identical to Nafath |
| 2 | 1 | 5 | Owner hires fast, no process |
| 4 | 3 | 14 | First franchise branches, self-funded, opened in a rush |
| 8 | 9 | 40 | A franchise investor gets involved, wants oversight the product has never modeled at this speed |
| 12 | 9 | 40, but 6 of them have already quit | Growth outpaced hiring discipline |

---

## SCENARIO 11 — A plan's hard ceiling is hit mid-shift, not during
onboarding

**`Plan.maxBranches`/`maxUsers`/`maxWarehouses` are enforced somewhere.
TuneUp is the first scenario to hit a ceiling live, not on day one.**

### What happens

Week 2. TuneUp is still on the Starter plan (3 branches, 3 users,
1 warehouse — whatever the actual seeded Starter numbers are; the
scenario's point doesn't depend on the exact figures). The owner, mid-
hiring-spree, tries to create the 6th `StaffUser` account for the week.

Somewhere in the stack — `PlanEntitlementLayer` is documented as a true
ceiling in the permission resolver (layer 2, locks on any definitive
answer) — a check presumably exists that would refuse this. But **the
owner is not calling `EffectiveAccessService.can()` to create a staff
account; some other part of the system (invite flow, staff-creation
endpoint) has to independently enforce the plan's numeric ceiling**, and
nothing in the codebase as documented shows *where* that enforcement
lives, whether it's checked at invite-send time or at invite-accept
time (meaning six invites could be sent and only the plan's actual limit
of accepted accounts enforced later, silently discarding the rest), or
what the **user experience** is when it's hit — does the owner get a
clear "you're at your plan's limit, upgrade or remove someone" message,
mid-hiring-spree, at exactly the worst possible moment for a confusing
error?

Separately: the owner needs to **upgrade the plan himself**, right now,
without waiting for platform support to notice and manually reassign
it — and there is no self-service plan upgrade path described anywhere
in the product. Every plan assignment in every scenario so far has been
the super admin's action at `Add Workshop Owner` time. **Changing plans
after creation, especially self-service and especially urgently, has
never been designed.**

### The core mistakes

**11.1 — Plan-limit enforcement's exact location (invite-send vs.
invite-accept vs. staff-creation) is unspecified, and the failure mode
of "6 invites sent, plan allows 3 more seats" — does the 4th, 5th, 6th
invite silently fail at acceptance time, with an already-excited new
hire staring at an error, or does something block it earlier — has
never been decided or tested.**

**11.2 — There is no self-service plan upgrade path anywhere in the
product; every plan assignment described in any scenario is a
platform-side, super-admin action, meaning a workshop hitting its
ceiling mid-operation has no in-product way to fix it themselves and
must wait on human platform support — a real operational bottleneck at
the exact moment (rapid, urgent growth) when speed matters most.**

**11.3 — There is no soft-warning tier below the hard ceiling — "you are
at 5 of 6 users" is a genuinely useful thing to surface well before the
wall is hit, and nothing in the plan/entitlement model distinguishes
"approaching the limit" from "at the limit," despite `PlanEntitlementLayer`
being exactly the layer that would need to carry this signal.**

---

## SCENARIO 12 — Nine branches, opened in a rush, and the platform has
no idea any of this happened until someone looks

**Franchise branches open weeks apart, self-funded by local partners the
owner barely vetted. Nothing in MOP surfaces this pattern of growth to
the platform, even though it's exactly the kind of change a governance-
minded platform should want visibility into.**

### What happens

Branches 4 through 9 are created over five weeks by the owner directly
(assuming `Add Workshop Owner`'s branch-creation gap, named in
`docs/scenarios/`'s Workshop B, scenario 6, has been fixed by then and
an owner-side branch-creation flow exists — if it hasn't, this scenario
simply can't happen through the product at all, which is its own
finding, restated). Each new branch inherits the tenant's capability
profile, role templates, and specialization configuration wholesale —
there is no concept of a **branch maturing into full configuration
gradually**; it's either fully configured from hour one (unrealistic
for a rushed franchise opening with no trained staff yet) or it opens
mis-configured and stays that way until someone notices.

**Nothing about this rate of change is visible to the platform at all.**
The Workshops list (now built) shows branch count as a static number per
tenant — 9 today, no trend, no "this tenant added 6 branches in 5 weeks"
signal, even though a growth rate this fast is exactly the kind of thing
a platform operator managing risk (support load, fraud risk, a tenant
about to outgrow its infrastructure allocation) would want to know
without having to notice it by chance while scrolling the list.

The `WorkshopHealthService`'s health signal — Healthy / At Risk /
Critical — has no dimension for "this tenant is changing unusually
fast," only for the owner-inactivity and failed-login signals named in
the spec. **Rapid, unmanaged growth is not unhealthy in the sense MOP's
health model currently measures, but it is exactly the situation most
likely to produce support tickets, mis-configuration, and eventually
churn** — and the product cannot distinguish it from a boring, stable,
slowly-growing tenant.

### The core mistakes

**12.1 — There is no concept of "branch opened, not yet fully staffed/
trained/configured" — every branch is treated as immediately, fully
live from creation, with no gradual-activation or "provisional branch"
state, despite this being exactly how real rapid expansion works.**

**12.2 — The Workshops list shows point-in-time counts, never trend —
"9 branches" carries no information about whether that's been stable
for a year or happened in five weeks, and the two situations warrant
completely different platform attention.**

**12.3 — `WorkshopHealthService`'s signal set (owner login recency,
failed logins, freeze history) has no dimension for growth velocity,
meaning the single most operationally significant thing happening to
TuneUp right now is invisible to the exact system built to flag things
worth the platform's attention.**

---

## SCENARIO 13 — The franchise investor wants oversight of nine branches
that MOP has never modeled as a group

**A franchise investor now has money in 8 of the 9 branches (not the
original one) and wants a login that shows exactly those 8, no more, no
less — and MOP's role model has no shape for this at all.**

### What happens

This restates and sharpens `docs/scenarios/`'s Workshop D finding
(20.1, "a regional manager role between branch manager and owner") from
an entirely different angle: not an *employee* who needs a subset of
branches, but an **external investor** who needs financial visibility
into a subset of branches he has a stake in, without operational control
over any of them, and — critically — **without visibility into the
original founding branch he has no stake in at all**, which every
existing role (`TENANT_OWNER`, `BRANCH_MANAGER` scoped by `branchScope`)
assumes is either fully in-scope or fully invisible based on employment,
not investment.

There is no `Account`/stakeholder concept at the tenant level (the same
gap `docs/scenarios/`'s Workshop B found for B2B customers, 10.1, now
recurring for a completely different reason — external financial
stakeholders in the workshop itself, not customers of it). The owner
ends up sharing his own login credentials with the investor — a
direct, serious security regression that MOP's entire permission
architecture exists to prevent, forced into existence by the product
having no role that fits.

### The core mistakes

**13.1 — There is no concept of an external, non-operational stakeholder
with financial-only, branch-scoped visibility — the role model's only
axis of "how much do you see" is operational scope
(`branchScope`/`warehouseScope`), and financial-stakeholder visibility
is a genuinely different axis that has never been designed.**

**13.2 — The absence of a fitting role produced actual credential
sharing — a security failure the permission-layer architecture is
explicitly built to prevent, defeated not by a bug but by the complete
absence of the role someone legitimately needed, which is arguably
worse than a bug because nothing in the product will ever flag it.**

**13.3 — This is the second scenario set in a row (`docs/scenarios/`
Workshop D, 20.1, and now this) independently finding the same gap from
different angles — a strong signal that "roles beyond the fixed seven
in `StaffRole`" is not an edge case but a structural limitation of a
closed enum trying to model an open set of real organizational
relationships.**

---

## SCENARIO 14 — Six technicians quit inside a month, and nothing in MOP
notices, records why, or protects what they knew

**Rapid, undisciplined hiring is followed — predictably — by rapid
attrition. This tests the offboarding path for staff, which (unlike
tenant offboarding, Workshop 1's scenario 5) has actually been exercised
by every scenario workshop's normal operation, but never stress-tested
at this speed or scrutinized for what it fails to capture.**

### What happens

Six technicians leave across four weeks — two fired for the safety
issues Workshop A's Scenario 3 already found MOP has no vocabulary for
(3.2), one for cause after a dispute, three simply quit for better pay
elsewhere as the franchise's rushed hiring produced predictably bad
working conditions. Each departure is (presumably) handled by
deactivating their `StaffUser` — `isActive: false` — the only offboarding
mechanism visible in the schema.

What is lost, silently, with each deactivation:

- **Why they left.** No field, no required exit reason, nothing —
  meaning "6 technicians quit this month" is a fact the owner has to
  remember and report manually to the investor (13), because MOP has no
  record of it at all, only the absence of 6 people from the active
  staff list.
- **Whether they're re-hireable, and any history that should follow
  them if a franchise elsewhere later wants to hire them** — a
  technician's certifications (once Phase 15/16 build the credential
  concept), work history, and performance record are all tenant-scoped
  and gone from view the moment they're deactivated, with no
  "alumni" or "eligible for rehire" distinction from "fired for cause,
  never rehire."
- **Any work order they were mid-task on.** `WorkOrderAssignment` exists,
  but nothing in this scenario set (or the first) verified what happens
  to an *in-progress* task when the assigned technician is deactivated
  mid-shift, walking out — does it silently sit assigned to a now-
  inactive account forever, invisible to the board (because the board
  presumably filters to active staff), a stuck job nobody notices until
  a customer calls asking where their car is?

### The core mistakes

**14.1 — There is no exit-reason capture on staff deactivation at all —
the single most basic HR fact (why did this person leave) that
People & Performance (Phase 10) would need to report anything
meaningful about turnover — which Workshop D of the first scenario set
(20.2) already flagged as missing tenure tracking; this scenario adds
that the *reason* is missing too, and turnover rate without a reason
breakdown (quit vs. fired vs. fired-for-cause) is a much weaker signal
than the investor in Scenario 13 actually needs.**

**14.2 — There is no rehire-eligibility distinction on a deactivated
account — "fired for a safety violation, never rehire" and "quit
amicably for a better offer, welcome back anytime" are both currently
just `isActive: false`, indistinguishable, which matters both for this
tenant and — if a cross-tenant reputation concept ever existed — for
any franchise elsewhere considering the same person.**

**14.3 — Whether an in-progress work order survives its assignee's
deactivation gracefully (reassigned, flagged, surfaced to the manager)
or silently becomes an orphaned, invisible task has never been tested
against a real deactivation-mid-shift scenario — every scenario in
either set so far involving a technician assumed they stayed employed
for the whole story.**

---

## SCENARIO 15 — TuneUp's 40 concurrent technicians, at peak, and the
attention-ranking algorithm nobody has load-tested at this scale

**The Attention Center's ranking algorithm (score with age escalation,
per `PROJECT_STATE.md`'s decisions table) was designed and tested against
Nafath-scale usage: 2 technicians, ~40 cars a day. TuneUp, at week 12, is
9 branches doing what TuneUp's own viral growth implies is a much
higher combined volume — and nobody has checked whether the ranking
algorithm, or the page rendering it, still works at this scale.**

### What happens

A single branch manager, scoped (per `branchScope`) to just her own
branch, opens Attention Center. This is fine — her working set is still
small, bounded by her own branch's volume, same as every branch manager
in every prior scenario.

But the **owner**, once Owner Home exists (still not built, per
`PROJECT_STATE.md`'s ongoing Owner-starvation finding, now compounded by
9 branches instead of 1), would need a view that aggregates across all
9 — and nothing in the Attention Center's design, built and tested
against one branch's queue, has ever been evaluated for whether "items,
not count tiles" (the stated design decision, chosen specifically to
avoid the vagueness of a bare number) **still holds up at 9 branches'
combined volume**, where a single unified item-list might just become a
different kind of overwhelming, unreadable wall — the same failure mode
count-tiles were rejected for, reappearing at a different scale via a
different mechanism.

Separately, and more concretely testable today: does the age-escalation
scoring, computed presumably per-tenant across all open items, become
measurably slower or behave differently once the item count is 9
branches' worth instead of 1's — has anyone run this against a seeded
dataset shaped like TuneUp's week 12, or has every test of this feature
used data shaped like a single quiet branch?

### The core mistakes

**15.1 — The Attention Center's core design decision ("items, not count
tiles," chosen to avoid vagueness) has never been evaluated at anything
beyond single-branch scale, and there's a real, unresolved design
question — not yet a confirmed bug, but a genuinely open risk — about
whether it degrades gracefully or simply relocates the same overwhelm
problem to a different presentation.**

**15.2 — No owner-level, multi-branch aggregate view of attention items
exists at all (this is Owner Home again, restated with a sharper edge:
it isn't merely "the owner has no home page," it's "the owner of a
9-branch business has no way to see what needs attention across all 9
without opening 9 separate branch-manager views one at a time").**

**15.3 — Nothing in the test suite seeds a dataset at TuneUp's actual
scale (9 branches, 40 technicians, weeks of accumulated history) to
verify the ranking algorithm's performance or correctness characteristics
hold — every existing test, per this project's own stated discipline
about testing against real data (the seed's two differently-shaped
tenants), has still never tested at genuine multi-branch volume, only at
multi-*tenant*-but-single-branch-each volume.**

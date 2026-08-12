# Platform Scenario Set — Workshop 1: Apex Motorsport Prep

> **Scenarios 1–5 of 40.** Second scenario set. Where `docs/scenarios/`
> tested MOP from inside a workshop's daily operation, this set tests it
> from the **super admin's desk and the server's own machine room**: can
> a workshop this specialized be stood up using *only* MOP, with no
> engineer touching a database — and what does the platform do when this
> workshop's traffic collides with everyone else's?

---

## The workshop

**Apex Motorsport Prep** — a single-location race-car preparation shop
in New Cairo serving track-day and amateur racing clients. This is
deliberately the **most specialized, least "typical repair shop"**
tenant in either scenario set, chosen to stress-test whether the
specialization idea (Phases 15–17) is real or only works for ordinary
service work.

| | |
|---|---|
| Branches | 1 |
| Work | Roll cage inspection, corner-weight balancing, suspension geometry (camber/caster/toe to 0.01°), brake bias tuning, data-logger installation, FIA/national-federation homologation paperwork, dyno tuning |
| Customers | ~40 total, most under a season-long retainer, not a per-visit relationship |
| Money | Season packages, not per-job invoices — a customer pays once for "eight track-day preps," drawn down over the season |
| Regulatory | Every roll cage inspection must produce a signed document referencing a specific FIA technical regulation article, retained for 5 years for scrutineering |
| Categories | None of MOP's `CategoryCode` values (`CARS`, `MOTORCYCLES`, `HEAVY_EQUIPMENT`) describe this. A race car is not a "car" in MOP's own taxonomy sense — it has no VIN in the ordinary sense (many are chassis-numbered, un-plated) |

---

## SCENARIO 1 — Standing up Apex using nothing but the product

**The super admin tries to create this tenant using only `Add Workshop
Owner` and the specialization tools envisioned for Phase 17, and finds
out how much of "using only MOP" is currently a fiction.**

### What happens

The super admin opens **Add Workshop Owner**. Country: Egypt. City: New
Cairo. Business type: free text — she types "Motorsport Preparation."
Primary category: a required enum select, and **none of the three
options fit**. She picks `CARS` because it's the closest, knowing it's
wrong the moment she picks it, because every downstream default (intake
fields, VIN requirement, the eventual position taxonomy from Phase 15)
will now silently assume Apex is an ordinary car workshop.

She reaches the specialization step envisioned for Phase 17: pick a
starter profile (quick-service, dealership, field-service,
franchise-chain — the four profiles the phase doc names, all drawn from
`docs/scenarios/`'s first set). **None of them is "motorsport prep."**
There is no fifth option, and no path to author a fifth from scratch at
creation time — Phase 17 as drafted assumes the super admin picks from a
library, not that she builds a wholly new category of workshop on the
spot.

She needs, at minimum: a season-package billing model (not per-job), a
roll-cage inspection service card whose fields reference FIA regulation
articles, a document-retention requirement of 5 years tied to a specific
service type (not a general retention policy), and a chassis-number
identity field instead of VIN/plate. **Every one of these is a genuine
first occurrence** — no other workshop in either scenario set needed a
regulatory citation field or a non-calendar, draw-down billing model.

She cannot finish onboarding Apex through the product. She has to ask
an engineer to hand-author the service cards and the season-package
logic directly, exactly the SQL-script failure mode `docs/scenarios/`
already found for bulk data (Workshop D, 16.1) — except this time it
isn't *volume* defeating the product, it's **novelty**.

### The core mistakes

**1.1 — The starter-profile library (Phase 17) has no path for the
workshop that fits none of the profiles.**

Four profiles, drawn from four scenario workshops, will always
under-cover reality — a library grows one workshop at a time and Apex
proves day one that the fifth workshop already doesn't fit. Phase 17
needs an explicit **"start from nothing" path**, not just profile
selection, and it needs to be a first-class option, not a fallback
apologized for in the UI.

**1.2 — `CategoryCode` is a closed enum standing in for something that
needs to be open.**

`CARS`, `MOTORCYCLES`, `HEAVY_EQUIPMENT` are a fixed Prisma enum. Every
downstream system that branches on category (thresholds, taxonomies,
eventually Phase 15's position vocabulary) inherits this closedness.
Apex is proof the list will never be complete, because "what kind of
thing gets worked on" is precisely the axis of variation the whole
specialization idea exists to open up — and it is currently the one
axis still hardcoded at the database level, underneath everything Phases
15–17 propose to build on top of it.

**1.3 — Billing assumes per-job settlement; a season package is not
representable at all, in the schema, today.**

This is sharper than anything in the first scenario set: Delta's net-30
terms (Workshop C, 15.1) still bill *per work order*. Apex's model is
"customer pays once, work is drawn down against a balance across many
unrelated visits over months." Nothing in `packages/shared/src/money`
or the Finance Core schema represents a **standing credit balance**
consumed by future, not-yet-created work orders. This is a real gap in
Phase 8/9, not merely an onboarding-form gap.

**1.4 — Regulatory-citation and retention requirements are per-service,
and nothing in the specialization model anticipated compliance
metadata, only operational fields.**

Phase 15's service-card idea (viscosity, litres) was designed around
*operational* data — what was done. Apex needs *compliance* data on the
same card: which regulation was checked against, a mandatory 5-year
retention flag that must survive tenant offboarding (see Scenario 5),
and a requirement that the card cannot be marked complete without a
named, credentialed inspector — closer to Workshop B's certification gap
(8.1) than to a simple field, but sharper because it's legally load-
bearing, not just a quality concern.

---

## SCENARIO 2 — The super admin tries to preview the impact of a
capability change on a workshop she does not understand

**Control Center's impact preview is generic. Apex proves "generic" can
be actively misleading.**

### What happens

Months later, the platform decides to disable the `INVENTORY` module
tenant-wide for workshops on the Starter plan, Apex included, as part of
a pricing restructure. The super admin opens the (eventually built)
Control Center, targets Apex, and previews disabling Inventory.

The impact preview (per the capability model's stated guarantee) is
supposed to show live counts: open part requests, pending stock, and
prove every reachable state still has a path to terminal. For Apex,
inventory is barely used — a handful of consumables (brake fluid,
safety wire) — so the preview shows a reassuringly small number and the
reachability check passes cleanly.

**What the preview cannot show, because nothing in the capability model
represents it, is that disabling Inventory silently removes the ability
to log which specific batch of brake fluid was used on a car that will
race at 200 km/h next weekend** — a fact Apex's insurance and, in a
serious incident, a national federation's post-incident investigation
would need. The reachability guarantee ("every state can still reach a
terminal state") is a *workflow* guarantee. It says nothing about
**information loss** that has consequences entirely outside MOP's own
state machine — a regulatory and liability concern the capability
engine was never designed to reason about, because no scenario before
Apex needed it to.

### The core mistakes

**2.1 — The reachability guarantee is a workflow property, not a
data-retention or liability property, and nothing in the platform
distinguishes the two.**

`docs/CAPABILITY_MODEL.md`'s central promise — every reachable
non-terminal state has a path to a terminal one — is real and valuable,
and it is *silent* on whether removing a capability destroys information
a workshop is legally or contractually obligated to keep. Apex is the
first workshop in either scenario set where this distinction is not
academic. The capability change pipeline needs a second, separate
check: does this change affect any data under an active retention
requirement (from 1.4), and if so, block or require explicit override
with recorded reasoning — not just a workflow reachability check.

**2.2 — Impact previews are computed from "how much does this workshop
use the feature," which is the wrong measure for a low-volume,
high-consequence workshop.**

A small number in the preview reads as "low risk" to whoever is
approving the change. For Apex, small volume and high consequence are
not correlated — this is the platform's version of the incentive-
conflict problem `docs/scenarios/`'s Workshop D found between speed and
thoroughness (18.3): a metric that looks reassuring can be actively
hiding the risk that matters.

**2.3 — There is no way for a workshop to declare "this module is
load-bearing for compliance, refuse to let anyone disable it without a
named override."**

This is the platform-level mirror of Phase 15's per-service retention
flag (1.4): a *tenant-level* flag, set by the owner or by the super
admin on the tenant's behalf, that participates in the capability
change pipeline's precondition checks and cannot be silently bypassed
by a bulk, cross-tenant plan change.

---

## SCENARIO 3 — Two hundred workshops get a plan change at once, and
Apex's owner is asleep

**The platform's control settings are per-tenant, evaluated per-request.
What happens when the super admin needs to change many tenants at once,
and one of them is mid-transaction?**

### What happens

The platform runs a pricing migration: every tenant on the legacy
"Growth" plan (200+ tenants, Apex among them) is moved to a new plan
with different `allowedModules` and different `maxUsers`. The super
admin's tooling (however it eventually gets built — nothing in the
current spec describes a bulk-tenant operation at all) needs to apply
this to 200+ tenants.

At 03:14 Cairo time, the migration job runs. Apex is asleep — nobody is
using the product. But **a scheduled task IS running**: Nafath-style
overnight processes aren't relevant to Apex specifically, but the
platform-wide `PermissionContextService` reads `tenant.plan.allowedModules`
fresh on every request (deliberately — Phase 1 rejected caching this for
correctness reasons). If the plan swap happens mid-way through any
in-flight request for **any** of the 200 tenants — not just Apex — a
`PlanEntitlementLayer` check could read the OLD plan's modules while a
`ModuleEnabledLayer` check three lines later in the same resolution
reads the NEW ones, because nothing makes a tenant's plan-migration
step atomic with respect to concurrently-resolving permission checks.

This was never tested, because every scenario so far involved one
tenant's data changing at a time, evaluated against one session's
requests. **Nothing in the codebase or its test suite exercises "a
tenant's foundational configuration changes while requests for that
tenant are actively resolving."**

### The core mistakes

**3.1 — There is no bulk-tenant operation tooling at all, and the
platform has never had to reason about doing the same change to 200
tenants at once.**

Every platform action described anywhere in the spec — freeze, capability
change, plan assignment — operates on one tenant, one confirmation
dialog, one impact preview. A pricing migration affecting 200+ tenants
either happens through 200+ manual clicks (absurd) or through tooling
that doesn't exist yet and has no design.

**3.2 — Permission resolution reads live tenant configuration with no
transactional boundary around a tenant-level configuration change.**

`PermissionContextService.load()` issues several queries in parallel
(`Promise.all`) against tenant, plan, capability, and control-setting
tables. If a plan reassignment (an `UPDATE tenants SET planId = ...`)
lands between two of those parallel reads for the same in-flight
request, the resolved context can be **internally inconsistent** —
built from a mix of old and new configuration. This has never been
provable as a bug because no test exercises concurrent tenant
mutation against in-flight permission resolution; it is a genuine,
previously-undiscovered correctness question the codebase has been
silently trusting Postgres's read-committed isolation to paper over.

**3.3 — There is no tenant-level "maintenance window" or config-freeze
primitive.**

Even accepting that atomic multi-table tenant reconfiguration is hard,
the platform has no mechanism to briefly reject or queue new requests
for a specific tenant while its configuration is being migrated —
something as simple as a `configuring: true` flag `SessionGuard` could
check would close most of the actual risk window, and nothing like it
exists.

---

## SCENARIO 4 — A super admin support engineer needs to see what Apex's
owner sees, right now, to debug a complaint

**Apex's owner calls in confused about a page. The super admin has no
way to see what he sees without becoming him.**

### What happens

Apex's owner calls the platform's support line: "the Reports page shows
the wrong number for my March revenue." A support engineer, logged in
as `PLATFORM_SUPER_ADMIN`, needs to reproduce this.

There is no "view as" or session-impersonation concept anywhere in the
permission model. `PlatformControlLayer` sits at layer 1 and is a
**ceiling**, not a lens — platform sessions either bypass tenant
permission checks entirely (for platform-scoped actions like freeze) or
have no tenant context at all (`session.tenantId === null` for a
platform account, per `permission-context.service.ts`'s own early
return). There is no third mode: "resolve permissions and render pages
exactly as this specific tenant user would see them, for support
purposes, with every action taken while impersonating clearly and
separately audited."

The support engineer's only options are: ask the owner to screen-share
(slow, and Apex's owner is not always available), or query the database
directly to reconstruct what the page *should* show (exactly the
SQL-escape-hatch failure mode this whole scenario set keeps finding, now
for support rather than onboarding).

### The core mistakes

**4.1 — There is no impersonation/support-view mode, anywhere in the
permission model, despite every SaaS platform this size needing one.**

This is a structural gap, not a missing page. It needs to be a session
mode that resolves permissions and renders UI **as the target user
would see it**, while every write action taken during impersonation is
either blocked outright or specially audited (`actorType` needs a value
for "platform, acting as tenant user," which does not currently exist
in `AuditActorType`). Building this without designing it carefully
would be a serious security regression — it's exactly the kind of
capability that, done carelessly, becomes the biggest hole in the whole
permission model documented in `CLAUDE.md`.

**4.2 — There's no distinction between "platform session with no
tenant" and "platform session temporarily scoped to one tenant for
support," and the codebase's early-return-on-null-tenantId pattern
(used in at least the permission context loader and the capability
resolver) assumes the former is the only shape a platform session ever
takes.**

**4.3 — Reproducing a tenant-specific bug currently requires either
trusting a customer's verbal description or reading the database
directly — there's no safe, audited, first-class way to just look.**

---

## SCENARIO 5 — Apex's owner cancels, and MOP has never had to answer
"what happens to five years of legally-required data"

**The retention requirement from Scenario 1 collides with tenant
offboarding, which does not exist as a designed process at all.**

### What happens

Two years in, Apex's owner sells the business and cancels his MOP
subscription. The tenant needs to be **archived**, not deleted —
`TenantStatus.ARCHIVED` exists as an enum value, and the audit-boundary
and money disciplines this codebase already enforces suggest deliberate
care about data — but nothing describes what "archived" actually means
operationally:

- Can Apex's former owner still retrieve the FIA-regulation-citation
  documents from Scenario 1, which are under a legally mandated 5-year
  retention **that outlives his subscription**? There is no described
  mechanism for a former customer to access archived data at all.
- Does archiving free the plan's user/branch/warehouse allocation for
  reuse by other tenants, and if the super admin later needs to
  **unarchive** Apex (a federation audit requests the roll-cage records
  three years after cancellation), does anything in the schema or the
  capability model support un-archiving a tenant that has been dormant
  for years, possibly across several platform schema migrations that
  happened while it was archived?
- Does `slug` uniqueness get released on archive? If a new "Apex Motors"
  (unrelated) wants to sign up two years later, is the old slug free?
  Nothing decides this.

The super admin, asked to close Apex's account, discovers the platform
has a *status value* for this situation and no *process*.

### The core mistakes

**5.1 — Tenant offboarding is an enum value (`ARCHIVED`), not a designed
lifecycle, and no scenario in either set has needed it before now
because every prior scenario is about a *live* workshop.**

This is the platform's own version of the "silent stub" the project
elsewhere treats as a defect (`CLAUDE.md`'s explicit rule): a status
that implies a capability without one existing.

**5.2 — Legally-mandated retention (1.4/2.1) has no answer for what
happens when the *tenant itself* stops existing as a paying customer,
which is precisely when retention obligations matter most — a
subscription ending is not the same event as a legal record's
retention window ending, and nothing in the schema distinguishes the
two clocks.**

**5.3 — There is no described un-archive path, and every migration and
schema change made while a tenant is archived is an implicit hazard —
`TenantConfiguration`, `RolePermission`, and capability rows all carry
assumptions about the "current" schema shape that a multi-year-dormant
tenant's data would not have been migrated alongside.**

**5.4 — Slug/identity reuse after archival is undecided, and is exactly
the kind of small unresolved question that becomes a production
incident the day it first actually happens, unannounced, to whichever
engineer is on call.**

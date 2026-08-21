# Platform Scenario Set — Workshop 8: Masar Capital (holding company)

> **Scenarios 36–40 of 40, closing this scenario set.**

---

## The "workshop"

**Masar Capital** — not a workshop at all. A private investment group
that has, over three years, bought controlling or full stakes in **11
separate, unrelated workshop brands already running on MOP** —
including, in this imagined timeline, Nafath (Workshop A, first set)
and several others. Each remains its own legally separate company, its
own MOP tenant, its own brand, its own local staff. Masar wants one
thing: **oversight across all 11, without merging any of them** (the
opposite request from Workshop 6, which tested actual merger). Chosen
to close this scenario set by testing whether MOP's tenant model can
represent **ownership as a relationship between tenants**, distinct from
either "these are the same business" (Workshop 6) or "these are
unrelated" (every other scenario).

| | |
|---|---|
| Tenants owned | 11, fully independent MOP tenants |
| What Masar wants | One login, portfolio-wide financial visibility, the ability to compare performance across the 11, and the ability to occasionally install one of its own people as an interim manager at a struggling one — without controlling day-to-day operations at the healthy ones |
| What Masar does NOT want | Any of the 11 workshops to know Masar can see their data, in most cases (a quiet, minority-stake, financial-only oversight relationship at several of them) |

---

## SCENARIO 36 — Masar asks for "one login across all 11," and discovers
`Account`/`Tenant` is a strictly one-to-one relationship at the type
level

**The single most basic request — one person, one login, visibility
into 11 tenants — turns out to be something the schema was never built
to represent at all.**

### What happens

Every `Account` in the schema belongs to exactly one `Tenant` (via
`StaffUser.tenantId`, non-nullable, or via the platform account type,
which has **no** tenant at all — `session.tenantId === null` for
`PLATFORM_SUPER_ADMIN`, per the permission-context loader's own early
return). There is no third shape: an account that belongs to **several**
tenants at once, each with its own (probably narrower, financial-only)
role.

Masar's representative needs 11 separate accounts, one per tenant, each
with its own separate password, its own separate login flow, and — per
Workshop 3's Scenario 13 finding, which already identified this exact
gap from the angle of a single-tenant franchise investor — **no role in
any of the 11 tenants' own `StaffRole` enum that describes "external
financial stakeholder, not an employee, no operational permissions"** at
all. Masar's person ends up either:

- Logging into 11 separate accounts, in 11 separate browser sessions,
  manually cross-referencing 11 separate Owner-home dashboards (once
  built) by hand, which does not scale past a handful of tenants and
  provides no actual **portfolio** view, only 11 individual ones, or
- Being given `TENANT_OWNER`-equivalent credentials directly by each of
  the 11 owners — full operational control, wildly beyond what a
  minority, financial-only stakeholder should have, and, per Workshop 5's
  Scenario 21 finding about separation of duties, a serious governance
  regression at 11 businesses simultaneously.

### The core mistakes

**36.1 — This is Workshop 3's Scenario 13 finding (13.1, "no external,
non-operational stakeholder role"), now recurring at a scale that makes
its severity unmistakable — one franchise investor at one workshop was
already a real gap; 11 tenants at once makes clear this is not a niche
edge case but a **structural absence of an entire category of platform
relationship** (financial ownership, distinct from operational
employment) that the schema has simply never modeled.**

**36.2 — There is no multi-tenant account concept anywhere in the
system — `StaffUser.tenantId` is a required, singular foreign key, the
platform account type has no tenant at all, and nothing in between
represents "one identity, several tenant-scoped roles, each
independently governed" — which is precisely what every holding
company, franchise investor, or multi-brand operator (a real and
common business structure) needs.**

**36.3 — Absent a real solution, the two available workarounds (11
separate manual logins, or handing out full owner credentials 11 times)
are respectively unusable at scale and a serious security regression —
there is no safe middle path, which is the same shape of problem
Workshop 5's Scenario 24 found for platform-level partial control
(freeze is too big, `isActive` is invisible to the platform): **the
product's permission model offers only extremes, with nothing between
them, again.**

---

## SCENARIO 37 — Masar wants portfolio-wide financial comparison, and
discovers every tenant's financial data is, correctly, completely
isolated — which is exactly what makes comparison impossible

**Even granting Scenario 36's identity problem solved somehow (say,
Masar accepts 11 separate logins for now): Masar wants to compare
"which of my 11 workshops is most profitable this quarter," and MOP has
no way to answer this even in principle, because it was never supposed
to.**

### What happens

Every financial figure in MOP — revenue, part costs, invoice totals — is
computed, correctly and deliberately, **per tenant**, using that
tenant's own currency (`Tenant.currency`), its own plan, its own
capability configuration. Masar's 11 workshops are not even all in the
same currency, market, or country (this is the natural extension of
Workshop 2's finding that MOP's country-handling is currently thin — a
holding company's portfolio is, in the real world, very likely to span
several of exactly the country-specific gaps Workshop 2 found).

There is no cross-tenant aggregation or comparison capability anywhere
in the platform — not even at the **platform's own** level. The super
admin's Workshops list (built, real, per this project's recent work)
shows each tenant's numbers in its own row, but **the platform itself
has never needed, and does not offer, a "sum/compare across a specific
subset of tenants" view** — every existing aggregate (plan-wide counts,
health-status filters) operates on the whole platform's tenant
population, not on an arbitrary, business-meaningful **group** of
tenants defined by real-world ownership.

Building this for Masar means building, for the first time, a concept
of a **tenant group** — a set of tenants related to each other for
reporting purposes, entirely orthogonal to any of the isolation
machinery the rest of the platform depends on, and requiring careful
thought about currency conversion, differing fiscal periods, and
whether Masar's visibility into this aggregate should be able to drill
back down into any individual tenant's row-level detail (which would
re-open Scenario 36's access-control question) or should be
deliberately, permanently summary-only.

### The core mistakes

**37.1 — Tenant isolation, correctly enforced everywhere in the product
for security and correctness reasons, has the direct and unavoidable
side effect of making **any** legitimate cross-tenant business question
— even a read-only, aggregate one like "which of my workshops is most
profitable" — structurally unanswerable without new, carefully-scoped
tooling that does not exist and has never been designed.**

**37.2 — There is no "tenant group" concept anywhere in the platform —
neither for Masar's ownership-based grouping here, nor, more broadly,
for any other reason a set of tenants might need to be reasoned about
together (a franchise brand's owned-vs-licensed locations, a regional
rollup, anything) — every platform-level view operates on either "one
tenant" or "all tenants," with nothing in between.**

**37.3 — Currency and country variation across a real portfolio (per
Workshop 2's finding that country-handling is currently thin) makes
even the arithmetic of cross-tenant comparison non-trivial once it IS
built — "compare profitability" silently assumes comparable units,
which, the moment more than one currency or tax regime is involved
(entirely plausible for any real multi-brand holding structure), it
is not.**

---

## SCENARIO 38 — Masar installs an interim manager at a struggling
workshop, and the platform has no vocabulary for "temporary, external,
operational control granted by the owner of a different tenant"

**One of the 11, struggling, needs an experienced operator brought in
fast. Masar wants to install its own person as a temporary branch
manager — someone who is an employee of Masar, not of the struggling
workshop, and who needs real operational permissions there for a few
months.**

### What happens

The interim manager needs `BRANCH_MANAGER`-level permissions at the
struggling tenant. But he is not, and should not become, a permanent
`StaffUser` of that tenant in the ordinary sense — Masar wants this to
be clearly temporary, clearly external, and clearly revocable the
moment either the turnaround succeeds or Masar decides to pull him out,
without any of the ordinary "employee offboarding" ambiguity Workshop 3's
Scenario 14 already found MOP handles poorly even for genuine employees
(no exit-reason capture, no rehire-eligibility distinction).

Creating him as an ordinary `StaffUser` at the struggling tenant makes
him permanently, indistinguishably "an employee of this workshop" in
every report, every audit-log actor-name, every team-membership record
— exactly the same "one person, one tenant, permanently" assumption
Workshop 6's Scenario 27 found breaks down the moment a person's
relationship to a tenant is meant to be temporary or partial rather than
permanent and total.

There is no "guest operator" or "externally-installed, time-bounded
manager" concept anywhere in the role model, and — sharpest of all —
**nothing distinguishes, in the audit trail, "this branch manager
action was taken by a genuine long-term employee" from "this branch
manager action was taken by an external operator installed by the
parent company for a specific, time-limited turnaround."** An owner or
future investor reviewing that tenant's history months later has no way
to know which actions came from which kind of person, even though the
distinction is exactly the kind of context `docs/CAPABILITY_MODEL.md`'s
own governance philosophy treats as important — the audit trail's
purpose is to make MOP "never silently lie to anyone" about what
happened and who did it, and a temporary, externally-installed operator
recorded identically to a permanent employee is a quiet failure of
exactly that promise.

### The core mistakes

**38.1 — This is the third distinct scenario (after Workshop 3's
Scenario 13 and Workshop 6's Scenario 27) to independently find that
`StaffUser`'s "one person, one tenant, indefinitely" model cannot
represent a real, common category of relationship — external
stakeholder (36), person moving between tenants over time (27), and now
temporary externally-installed operator (38) are three different real-
world needs, and all three are blocked by the exact same schema
assumption, which is now, across both scenario sets, the single most
frequently rediscovered structural gap in the entire platform.**

**38.2 — The audit trail cannot distinguish an externally-installed,
time-bounded operator's actions from a genuine long-term employee's —
which directly undermines the specific governance promise
`docs/CAPABILITY_MODEL.md` states as MOP's core purpose ("make sure a
repair never silently lies to anyone"), because in this case, the
identity and context behind an action IS part of what the record
should honestly convey, and currently cannot.**

**38.3 — There is no time-bounded permission grant anywhere in the
permission model — every permission, at every layer, from platform lock
down to user override, is granted and held indefinitely until someone
manually revokes it; nothing supports "grant this access, automatically
expiring on this date, without anyone having to remember to clean it
up," which is exactly what an interim-manager arrangement needs and
exactly the kind of access grant most likely, in practice, to be
forgotten and left in place long after it should have ended.**

---

## SCENARIO 39 — A struggling workshop in the portfolio is being
considered for closure, and Masar needs to know exactly what winding
down looks like — which turns out to be Workshop 1's unanswered
question, now asked under real financial pressure

**Six months into the interim manager's tenure, the turnaround fails.
Masar decides to close this workshop. This is the archival/offboarding
question Workshop 1's Scenario 5 already found MOP has no real process
for — recurring here with sharper, financially consequential stakes.**

### What happens

Closing a workshop for good, as opposed to Workshop 1's Apex (sold to a
new owner who presumably kept it running), means Masar needs to know:
what happens to the customer data (does MOP retain it, and for whom, if
there's no new owner to hand a retention obligation to)? What happens
to the staff — the genuine, permanent local employees, not the interim
manager — whose employment record, tenure, and any eventual reference
information lives entirely inside this one tenant's data, which is now
about to be archived, per Workshop 1's finding, into a process the
platform has never actually designed (5.1)? Does Masar, as the
**owning entity but not the `Tenant.id` itself** (recalling Scenario
36's finding that Masar has no formal platform-level relationship to
this tenant at all, only informal, real-world ownership), even have any
standing, within the product, to request or authorize this closure — or
does it have to go through whichever local `TENANT_OWNER` account
technically holds the tenant, who may, in a failing-business scenario,
be exactly the person least motivated to cooperate quickly?

### The core mistakes

**39.1 — Workshop 1's Scenario 5 finding (5.1–5.4, tenant offboarding as
an undesigned process) recurs here with materially higher stakes — a
struggling business's closure, under financial pressure, with real
former employees and real customer data at stake, is precisely the
worst possible moment to discover the process was never actually
designed, and precisely the moment it is most likely to actually
happen.**

**39.2 — Because Masar's ownership relationship to this tenant has no
platform representation at all (36.2), Masar has **no formal standing**
within the product to even initiate or authorize the closure it, in
reality, has every right to decide — the only account with platform-
recognized authority over this tenant is the local `TENANT_OWNER`, who
in a failing, contentious closure may not act quickly or cooperatively,
and the platform has no mechanism to resolve this gap between real-
world authority and in-product authority.**

**39.3 — Every gap named across this scenario set's earlier workshops —
retention obligations outliving a subscription (Workshop 1), the
absence of a tenant-group concept (37), no time-bounded access (38) —
converges at exactly this moment, closure, which is arguably the single
highest-stakes, lowest-frequency, and therefore most under-tested event
in a tenant's entire lifecycle, and the one the platform is currently
least prepared for of any event examined across either scenario set.**

---

## SCENARIO 40 — Closing both scenario sets: the super admin, asked to
explain Masar's entire arrangement to a new colleague, realizes the
platform has no single place that represents "how these tenants relate
to each other" at all

**The last scenario, deliberately reflective rather than narrative: a
new platform support hire asks a simple onboarding question, and the
honest answer reveals the shape of everything this 80-scenario project
(40 + 40) has found.**

### What happens

A new support engineer joins the platform team and asks: "Is there a
page where I can see that Masar owns these 11 tenants, that Al-Fanar
used to include Delta Precision before the split (Workshop 6), that
Apex Motorsport's tenant is archived-but-legally-retained (Workshop 1),
and that Cedar Motors had a fraud incident on its record (Workshop 5)?"

The honest answer, given everything found across both scenario sets, is
**no**. Every one of these facts, if it exists in the system at all,
exists as scattered rows in `AuditLog`, informal knowledge held by
whichever support engineer originally handled it, or — in Masar's and
Al-Fanar's cases — **nowhere in the product at all**, because the
relationships themselves (ownership across tenants, historical lineage
through a merge/split, a tenant's true operational status beyond the
`TenantStatus` enum's seven values) have no schema representation.

The Workshops list — genuinely well-built, real, and exactly what the
spec asked for — shows 11+ independent rows for Masar's portfolio with
**nothing connecting them**, the same way it would show any 11
completely unrelated tenants. The platform's own understanding of its
own tenant population is, structurally, a flat list, when the real
population these two scenario sets uncovered is a **graph** — tenants
related by ownership, by historical lineage, by shared people moving
between them, by group-level governance concerns — and nothing in the
product, from the schema up through every page built so far, represents
that graph at all.

### The core mistakes

**40.1 — The platform's entire data model treats tenants as a flat,
unrelated set — every relationship this scenario set found a real
business needing (ownership, lineage, shared identity, temporary
cross-tenant access) is currently either unrepresented or represented
only informally, outside the product, in institutional memory — which
does not scale, does not transfer to a new hire, and does not survive
the original engineer leaving.**

**40.2 — This is the single organizing finding of the entire 40-
scenario set: nearly every "hard, unclear, or sensitive" gap this set
was asked to find — separation of duties (21), historical permission
reconstruction (23), platform-witnessed partial control (24), tenant
merge/split (26–30), multi-tenant identity (36, 27, 38), time-bounded
access (38), and tenant offboarding under real stakes (39) — is a
symptom of the same root cause: **MOP's entire architecture, correctly
and rigorously, treats a tenant as the fundamental, isolated, permanent
unit of everything** (data, identity, governance, audit), and every
scenario in this set that felt hard was hard specifically because it
asked the platform to reason about something **crossing, changing, or
relating across that boundary** — which the boundary, by design, was
never built to do.**

**40.3 — This is not, on its own, a case for weakening tenant isolation
— Workshop 6's Scenario 30 already found real tension there, and the
isolation discipline is one of this project's most carefully-built and
most valuable properties. It is a case for the roadmap to explicitly
decide, deliberately and in the open rather than by accretion under
deadline pressure the way this scenario set kept finding these gaps get
discovered, **which of these cross-tenant relationships the platform
intends to support, in what form, and which it intends to permanently
refuse** — because right now, no such decision has been made at all,
and the absence of a decision is quietly being decided by default,
every time a real Masar, a real Al-Fanar, or a real Apex asks for
something the platform was never designed to say yes OR no to.**

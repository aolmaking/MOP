# Platform Scenario Set — Workshop 2: Al-Safwa Auto Care, Riyadh

> **Scenarios 6–10 of 40.**

---

## The workshop

**Al-Safwa Auto Care** — Riyadh, Saudi Arabia. MOP's first tenant
outside Egypt. Chosen specifically to test whether "multi-country" is a
real, engineered property of the platform or a currency dropdown wearing
the word "international."

| | |
|---|---|
| Branches | 2, both Riyadh |
| Country | Saudi Arabia — VAT-registered, ZATCA (Zakat, Tax and Customs Authority) e-invoicing mandatory by law |
| Currency | SAR |
| Language | Arabic primary, but **Gulf-dialect business Arabic and formal invoice Arabic differ from Egyptian usage** in ways that matter for a legal document |
| Weekend | Friday–Saturday, not Friday only — the work week itself is shaped differently than the Egypt-seeded tenants MOP has only ever been tested against |
| Legal identity | A Saudi Commercial Registration (CR) number and a VAT registration number, neither of which the schema has a field for |

---

## SCENARIO 6 — Onboarding the first non-Egyptian tenant, and finding
the platform was never actually written to be country-agnostic

**The super admin creates Al-Safwa and discovers "country" has been a
free-text convenience field wearing the costume of a real
internationalization boundary.**

### What happens

`Add Workshop Owner`'s form has a `country` field. The super admin types
"Saudi Arabia" — or selects it, if it's a dropdown; either way, nothing
downstream branches meaningfully on the value. Currency: SAR, accepted.
Timezone: Asia/Riyadh, accepted (`Tenant.timezone` is a real column and
this at least works, per the Workshops-list drawer's timezone-aware
timestamp display already built).

But: the CR number and VAT registration number — legally required for
**any** Saudi business document, and specifically for what ZATCA demands
appear on an e-invoice — have no field anywhere in `Tenant`,
`TenantConfiguration`, or the onboarding DTO. `create-workshop.dto.ts`
validates an Egyptian-shaped phone number pattern
(`/^\+[1-9]\d{1,14}$/` is E.164-general, so phone format happens to
work) but nothing about the *business identity fields* a Saudi tax
authority requires.

The Billing/Invoicing system (Phase 9, not yet built) is specified with
`GenericBillingAdapter` as the default and a country-adapter seam for
markets that need one — Egypt's ETA and Saudi's ZATCA are both named
explicitly in `PROJECT_STATE.md`'s Phase 9 notes. **But the seam is a
Phase 9 concept, and Al-Safwa needs to exist as a tenant now**, in
Phase 5–8's world, where invoicing is unconditionally the
`GenericBillingAdapter`'s shape — meaning every invoice Al-Safwa issues
before Phase 9 ships is, by construction, **not ZATCA-compliant**, and
nothing in the product tells anyone that. A workshop can be fully
onboarded, fully operational, and silently non-compliant with the tax
law of the country MOP itself let it register in.

### The core mistakes

**6.1 — `country` is stored but not acted on anywhere outside display
formatting — it is not a real configuration axis yet, despite looking
like one.**

Every other scenario workshop in both sets is Egyptian. This is the
first time the gap between "we have a country field" and "we behave
differently per country" gets tested, and it fails immediately: no
required-field set changes per country, no legal-identity fields exist
for a second country, and nothing warns a super admin that a country
they're onboarding into has requirements the product doesn't yet meet.

**6.2 — There's no mechanism for the platform to say "this tenant is
compliant-blocked" — operational but not legally allowed to issue
invoices under local law until Phase 9 ships.**

This is a sharper, country-scoped version of the retention-flag gap
found in Workshop 1 (2.3): a **capability-adjacent but not
capability-shaped** flag, because it isn't "Al-Safwa chose to disable
invoicing" — it's "the platform cannot yet offer Al-Safwa a legally
sufficient invoice," which is a platform limitation, not a tenant
choice, and nothing distinguishes those two very different reasons a
feature might be unavailable.

**6.3 — Legal business-identity fields (CR number, VAT number) are
absent from the schema entirely, not merely from the onboarding form —
`Tenant` has `country`/`city`/`currency`/`timezone` but nothing for
jurisdiction-specific registration identifiers, which will differ again
for the next country (a UAE Trade License number is a different shape
again).**

**6.4 — Onboarding into a country the product doesn't fully support yet
produces no warning, no block, and no record — a super admin can
create a non-compliant tenant with the same confidence as a fully
compliant one, and only discovers the gap when a customer complains
about an invoice, or worse, when a tax authority does.**

---

## SCENARIO 7 — Friday–Saturday collides with every "weekday" assumption
baked into the product

**Al-Safwa's weekend is Friday–Saturday. MOP has never had to represent
"weekend" as anything other than an assumption.**

### What happens

Nothing in the schema or the scheduling-adjacent code (SLA windows once
Phase 16 exists, "last activity" relative-time formatting on the
Workshops list, attention-ranking age escalation) has a concept of a
**tenant-configurable working week** at all. Every "N days since" or
"business hours" calculation implicitly assumes a 7-day continuous
clock, which is *correct* for elapsed-time arithmetic but *wrong* the
moment any feature needs to reason about "is this workshop currently
open" or "how many working days has this been waiting" — which several
already-built features do, or will:

- The `WorkshopHealthService`'s "owner hasn't logged in for N days"
  warning does not know Al-Safwa is closed Friday and Saturday, so a
  perfectly normal weekend produces the exact same warning signal a
  genuinely absent Egyptian owner would trigger on a Friday alone (a
  1-day gap, which is nothing, versus a systematic pattern) —
  **the health signal cannot tell "closed for the weekend" from "the
  owner has gone quiet," because it has no concept of the weekend at
  all.**
- Once Phase 16's SLA/expected-duration work lands (drafted, not yet
  built), "days since promised" arithmetic will need to know whether a
  day was a working day, and nothing in either scenario set's discovery
  of scheduling concepts considered this — the first set's four
  workshops were all Egyptian and all closed Friday, so the gap was
  invisible until a second-country tenant existed to expose it.

### The core mistakes

**7.1 — "Working week" is nowhere in the schema — every time-based
signal in the product implicitly assumes the same weekend as whichever
workshop it was originally tested against, which has so far always been
Egypt's.**

**7.2 — `WorkshopHealthService`'s day-count signals cannot distinguish
"closed" from "concerning," because closedness is not represented, and
this will get systematically worse, not better, as more countries with
different weekends onboard — Egypt (Fri–Sat historically, increasingly
Fri only depending on sector), Saudi (Fri–Sat), and a hypothetical
future Western-market tenant (Sat–Sun) each need a different answer, and
the health service currently has exactly zero.**

**7.3 — This was discoverable only by testing a second country, which
this scenario set is the first to actually do — a strong signal that
`SCENARIOS.md`'s existing matrix, however thorough on capability
combinations, has never varied geography, and geography turns out to
change more assumptions than capability configuration does.**

---

## SCENARIO 8 — The server under real multi-tenant load: an Egyptian
rush hour and a Saudi rush hour overlap

**Cairo and Riyadh are in different, close timezones (Africa/Cairo,
Asia/Riyadh — one hour apart), and their business peaks nearly
coincide. What does the platform actually do when many tenants hit peak
load at the same moment, and has anyone ever measured it?**

### What happens

09:00 Cairo / 10:00 Riyadh. Nafath, El-Makkawy, Delta, SpeedLube (all
four workshops from the first scenario set, now imagined as real,
concurrently-live tenants) are all in their own morning rush. Al-Safwa's
Riyadh branches are simultaneously mid-morning. Every one of them is
issuing `EffectiveAccessService.can()` calls, intake writes, work-order
status transitions, and — critically — every one of those permission
resolutions calls `PermissionContextService.load()`, which the codebase
proudly documents as "resolving twenty keys costs the same six queries
as resolving one," **per tenant, per request**.

**Nothing in the codebase or its test suite has ever measured what
happens when this six-query cost is paid concurrently by hundreds of
simultaneously-active tenants against one shared Postgres instance.**
The optimization story (Phase 1's stated fix: "5 DB queries per `can()`"
reduced to a per-request cached context) is real and well-reasoned for
**one tenant's one request**. It says nothing about connection-pool
exhaustion, query-planner contention, or noisy-neighbor effects when
tenant A's large `ControlSetting` table (built up over years of platform
governance actions) makes tenant A's permission-context load
measurably slower than newly-onboarded tenant B's, and both are
competing for the same Postgres connection pool at the same instant.

There is no load test anywhere in the repository. There is no
documented connection-pool sizing strategy. There is no per-tenant rate
limiting (the rate limiting that exists, per `PROJECT_STATE.md`'s
Phase 1 notes, is auth-endpoint-scoped, aimed at the scrypt DoS vector —
not general API throughput fairness across tenants).

### The core mistakes

**8.1 — There is no load or concurrency test anywhere in the test
suite, despite the entire product being multi-tenant SaaS by design —
every test in the repository, including the integration tests that
correctly insist on a real Postgres, tests ONE tenant's behavior at a
time, sequentially.**

This is the platform-scale version of `CLAUDE.md`'s own stated rule
that "the seed creates two differently-shaped tenants... a single-
tenant database makes isolation bugs invisible" — the project already
understood this principle for *data* isolation and applied it
rigorously. It has not yet applied the same principle to
**performance** isolation, and nothing in the roadmap currently plans
to.

**8.2 — There is no per-tenant fairness or throttling mechanism —
one tenant's usage pattern (a large audit history, many concurrent
staff sessions, a burst of bulk operations once Phase 17's bulk import
exists) can degrade every other tenant sharing the same database and
connection pool, with no isolation between them at the request-handling
layer.**

**8.3 — Connection-pool sizing, query-plan behavior under concurrent
multi-tenant load, and the actual real-world cost of "six queries per
permission resolution, times every concurrent request, times every
active tenant" have never been measured — the Phase 1 optimization
that reduced this from "5 per call" to "6 total per request" is a real
and valuable improvement in isolation, and an entirely unverified claim
at the scale the product is actually meant to run at.**

---

## SCENARIO 9 — Al-Safwa's owner reads his invoices in Gulf Arabic, and
discovers the RTL/i18n foundation from Phase 1 was tested against one
dialect

**The i18n foundation exists — logical CSS, `dir` handling, bidi
isolation for plate numbers, per `PHASE_MAP.md`'s Phase 1 description.
Al-Safwa is the first tenant to actually stress it against a different
Arabic-speaking market than the one it was built against.**

### What happens

Al-Safwa's owner reads an invoice. The numerals, the currency symbol
placement, and several business terms differ in convention between
Egyptian and Gulf commercial Arabic — plate-number formatting
conventions differ meaningfully between Egypt and Saudi Arabia (a
different character set convention and a different physical plate
layout entirely), and the bidi-isolation work described in Phase 1 was
necessarily written and tested against **the plate format of whichever
tenant existed when it was built** — which, per every scenario in the
first set, was always Egyptian.

Separately: Saudi Arabia's weekend, VAT rate, and legal invoice language
requirements are governed by Saudi regulation specifically, not by "is
this in Arabic" generally — `docs/PHASE_MAP.md`'s Phase 14
("Internationalization & Release Readiness") describes "Arabic
translation pass" and "country invoice adapters as needed" as if they
were one problem with two sub-tasks. Al-Safwa proves they are **two
almost entirely separate problems**: translation is about language;
country-adapter work is about law, tax, and business convention, and a
workshop can need one without the other (a Gulf-Arabic-speaking UI is
not the same deliverable as a ZATCA-compliant invoice).

### The core mistakes

**9.1 — The i18n foundation has been built and tested against exactly
one Arabic-speaking market's conventions, and "Arabic" is not one
convention set — plate formats, numeral conventions, and formal
business register genuinely differ by country, and nothing in Phase 1's
foundation or Phase 14's plan currently distinguishes them.**

**9.2 — Phase 14 bundles translation and legal/tax country-adaptation
into one phase as though they were one task, when Al-Safwa demonstrates
they are separable and differently-paced — a tenant can need the tax
adapter (Phase 9's ZATCA work) years before it needs a dialect-accurate
UI, or vice versa, and treating them as one phase risks blocking the
one on the other for no real reason.**

**9.3 — There has been no design decision yet about whether plate-
number formatting, numeral display, and business-register vocabulary
are tenant-configurable, country-derived, or hardcoded assumptions
inherited from whichever tenant was seeded first — and until a second
country's tenant actually existed, in a scenario, this question had
literally never been asked.**

---

## SCENARIO 10 — A dispute between Al-Safwa and a customer escalates to
a Saudi regulator, who asks for records MOP cannot produce in the
required form

**Saudi Arabia's consumer-protection and ZATCA audit requirements ask
for specific things from a business's records. This scenario tests
whether MOP's audit trail, built for MOP's own internal governance, can
actually serve as a legal record when a government asks.**

### What happens

A customer disputes an invoice with the Saudi consumer protection
authority. The authority asks Al-Safwa's owner for: the original signed
invoice (in ZATCA's required e-invoice format, with a QR code and
cryptographic stamp — none of which the `GenericBillingAdapter` produces,
because it's generic by design, and Phase 9's ZATCA-specific adapter,
per Scenario 6, does not exist yet), a complete change history for that
invoice (does `AuditLog` capture invoice-level changes with enough
fidelity, and can Owner's Audit page — now built, per this project's
recent work — actually filter to "everything touching invoice #4471"
specifically, rather than only by action-category and actor?), and
proof of who approved the underlying repair (the customer decision link
flow, which is real and auditable, but was designed for the *branch
manager's* operational needs, never reviewed against what a regulator's
evidentiary bar actually requires).

Al-Safwa's owner discovers that MOP's audit trail is a genuinely good
**internal governance tool** — exactly what `docs/CAPABILITY_MODEL.md`
and the audit-boundary linter were built to guarantee — and an
**unproven legal evidentiary record**, because nobody has ever checked
whether "every risky action writes an `AuditLog` row" satisfies what a
specific country's specific regulator specifically requires as proof.

### The core mistakes

**10.1 — The audit trail's design goal (internal governance,
`docs/CAPABILITY_MODEL.md`) and its potential second use (legal
evidence for a regulator) have never been reconciled, and nothing has
verified the first actually satisfies the second — they may well be
compatible, but "may well be" is not the same as "verified," and this
is the first scenario in either set where the difference matters.**

**10.2 — There's no query surface on the Owner's Audit page scoped to
"everything about this one invoice/work order/customer," only to
category/actor/time-range filters — reconstructing a single record's
full history for a regulator currently requires manually cross-
referencing several filtered views rather than one direct lookup.**

**10.3 — The customer-decision-link flow, genuinely well-built for its
original operational purpose, has never been evaluated against what
counts as valid consent/approval evidence under a specific
jurisdiction's consumer-protection law — a gap invisible until a real
regulator, in a real country, actually asks.**

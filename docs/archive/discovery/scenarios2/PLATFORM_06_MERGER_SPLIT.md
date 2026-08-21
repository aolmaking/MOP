# Platform Scenario Set — Workshop 6: Al-Fanar / Delta Precision (merger and split)

> **Scenarios 26–30 of 40.**

---

## The workshop(s)

Two existing tenants, both already live on MOP for over a year:

- **Al-Fanar Motors** — 3 branches, Cairo.
- **Delta Precision** — the same dealership-style workshop from the first
  scenario set's Workshop C, 2 branches, Alexandria.

Al-Fanar's owner buys Delta Precision outright. Six months later, in an
unrelated development, **one of Al-Fanar's own three branches is sold
off** to a completely different, unrelated new owner who wants to keep
running it independently on MOP. This scenario set tests something no
prior scenario has: **tenant identity is not permanent, and the schema
treats `tenantId` as though it were.**

---

## SCENARIO 26 — Merging two tenants that have each been operating
independently for a year

**Al-Fanar's owner now owns Delta Precision too, and wants "one login,
one view of both businesses" — which is not the same request as "make
Delta Precision a new branch of Al-Fanar," and MOP has no vocabulary for
either.**

### What happens

The simplest-sounding request — "combine them" — immediately fractures
into questions nothing in the schema or the product's design has ever
had to answer:

- **Do the two tenants become one `Tenant` row, with Delta's branches
  becoming additional `Branch` rows under Al-Fanar's `tenantId`?** If
  so, every `tenantId`-scoped foreign key across the entire schema —
  `WorkOrder`, `Customer`, `Asset`, `AuditLog`, `InventoryItem`,
  `StaffUser`, everything — needs to be rewritten for every row that
  ever existed in Delta Precision, a migration touching potentially
  hundreds of thousands of rows across a live production tenant, with
  **no described procedure, no tooling, and enormous risk of exactly
  the kind of partial-failure/rollback problem Workshop 4's Scenario 19
  already found has no answer even for a much smaller, single-branch
  case.**
- **What happens to Delta's `slug`?** Both tenants have their own slug,
  used (per this project's own recent work on the Workshops list) as a
  visible, presumably URL-relevant identifier. Does Delta's slug
  survive as an alias, disappear, or collide?
- **Customers who have visited both workshops** — say, someone who had
  their car serviced at an Al-Fanar branch and separately owns a second
  car serviced at Delta — are currently two entirely separate `Customer`
  records in two separate tenants' data, with no cross-tenant identity
  concept anywhere in the schema (customers are tenant-scoped by
  design, correctly, for isolation). Merging the tenants does **not**
  merge these two people into one customer record automatically, and
  nothing decides whether it should, or how to safely detect that
  they're the same person without a false-positive merge (wrongly
  combining two different people who happen to share a phone number
  format) being worse than leaving them separate.
- **AuditLog history**, per `CLAUDE.md`'s single-writer-boundary rule,
  is tenant-scoped and was never designed to be reparented — every
  historical audit row for Delta says `tenantId: <delta's old id>`;
  changing that after the fact to point at Al-Fanar's id would be
  **rewriting audit history**, which the entire audit-boundary
  discipline exists specifically to prevent, even when the rewrite is
  for a legitimate business reason.

### The core mistakes

**26.1 — There is no tenant-merge concept anywhere in the platform, and
the schema's `tenantId` foreign key, used for correct and rigorous
isolation everywhere (the exact discipline `CLAUDE.md` praises), is
structurally the single hardest thing to safely rewrite after the fact
— isolation and mergeability are in direct tension, and the platform has
only ever built for the former.**

**26.2 — Cross-tenant customer identity has no representation at all —
two `Customer` rows in two different tenants that are, in reality, the
same human being are invisible to each other by design, correctly, for
isolation reasons, and there is no safe mechanism to link or merge them
when a legitimate business reason (a merger) later requires it.**

**26.3 — Rewriting `AuditLog.tenantId` for historical rows to reflect a
merger directly conflicts with the audit-boundary discipline's purpose
(an immutable, trustworthy governance record) — any merger tooling has
to choose between historically accurate-but-now-orphaned audit trails,
or edited history, and nothing has ever decided which, because no
scenario before this one required a `tenantId` to ever change for an
existing row.**

---

## SCENARIO 27 — Splitting off one branch into its own independent
tenant, live, without disrupting the other two

**Six months later: Al-Fanar sells one of its three branches (now
including whatever came from the Delta merger, so possibly a Delta-
originated branch) to a new, unrelated owner. This branch needs to
become its OWN tenant, with its own login, its own data — and the other
branches must be completely unaffected.**

### What happens

This is the exact inverse of Scenario 26, and inherits every one of its
problems in mirror image, plus new ones specific to *splitting*:

- **Every row scoped to the departing branch** — its work orders, its
  customers (who may have ALSO visited a sibling branch, meaning
  they're now supposed to exist, split, in two different tenants at
  once, which the schema's one-`tenantId`-per-`Customer` design cannot
  represent without literally duplicating the row and picking which
  tenant "owns" the shared history), its inventory, its staff — needs
  to be re-parented to a brand-new `tenantId`, live, on a production
  system, without downtime for the two branches staying behind.
- **The departing branch's technicians and branch manager** need new
  `Account`/`StaffUser` records under the new tenant, or their existing
  ones need re-parenting — and if any of them ALSO occasionally covered
  shifts at a sibling branch (not unusual in a small chain), their
  single identity now needs to exist, correctly scoped, in two
  completely separate tenants, which is not how `StaffUser.tenantId`
  (a required, non-nullable foreign key) was ever designed to work —
  **one person, one tenant, is baked into the schema at the type
  level.**
- **The new owner needs a plan, a `Tenant` row, and — critically —
  wants to keep the branch's accumulated customer history and
  reputation**, not start from zero the way every tenant in every other
  scenario has. This is `docs/scenarios2`'s import problem (Workshop 4,
  Scenario 17) again, except this time the "import" source is **MOP's
  own data**, which should be the easy case and currently has no
  tooling at all, easy or otherwise.

### The core mistakes

**27.1 — `StaffUser.tenantId` (and the equivalent single-tenant
assumption on `Account`) is a hard, non-nullable, one-to-one
relationship at the schema level — the entire idea of "one person,
potentially working across, or moving between, more than one tenant
over time" has no representation, and a branch split is the first
scenario to actually need it.**

**27.2 — Splitting a live branch out of a multi-branch tenant is, if
anything, a harder version of the merge problem in Scenario 26 — it
requires the SAME re-parenting machinery (which doesn't exist), PLUS a
decision about shared customers across the split boundary (which the
merge case doesn't even have to face, since a merge only ever
*combines* scope, never divides it).**

**27.3 — MOP's own historical data, when a branch needs to carry it
into a brand-new tenant, has no "export myself, re-import as a fresh
tenant" tooling — the platform cannot even migrate ITS OWN data between
two of its own tenants cleanly, which is a sharper version of Workshop
4's external-import gap: there, at least the source format was foreign
and some friction was expected; here, the data was MOP's own, correctly
shaped, and there is STILL no path.**

---

## SCENARIO 28 — During the split, a customer's asset ownership history
becomes ambiguous, and `AssetOwnershipHistory` was never designed for
this

**A specific, concrete data-integrity question buried inside Scenario
27: what happens to `AssetOwnershipHistory` — the exact mechanism this
project's own earlier work built to fix "returning customers showed no
vehicles" — when the branch that originally recorded an asset's history
is the one being split off?**

### What happens

A customer's Hyundai was first serviced at the departing branch three
years ago (`AssetOwnershipHistory` row created then, correctly, at the
time) and has been serviced at a SIBLING branch (staying with the
original tenant) for the last year, after the customer moved house. The
`Asset` record and its ownership history currently live under the
original tenant's `tenantId`. If the departing branch becomes a new
tenant, does this asset's history:

- **Stay with the original tenant** (technically correct, since the
  asset's *most recent* service relationship is with the branch
  staying behind) — meaning the new tenant, despite being where this
  car's relationship *originated*, has no record of it at all, an
  amputation of exactly the "returning customer" continuity this
  project fixed a schema bug specifically to preserve?
- **Split, with the new tenant getting a copy of the historical rows up
  to the split date, and the original tenant keeping everything after**
  — which requires a point-in-time data fork nothing in the schema or
  any migration tooling has ever been asked to do, and which,
  done incorrectly, could silently duplicate or drop history exactly
  the way `AssetOwnershipHistory`'s original bug did before it was
  fixed?

Nobody decided, and there is no principled way to decide from the schema
alone, because `AssetOwnershipHistory` — like every other historical
table in the product — assumes the `tenantId` it was written under is
permanent.

### The core mistakes

**28.1 — This is a concrete, worked example of Scenario 27's abstract
finding: `AssetOwnershipHistory`, built and fixed specifically to solve
a real continuity bug, has an entirely new and unanticipated failure
mode the moment tenant boundaries themselves become mutable — a fix for
one bug can become the setup for a different one under conditions the
original fix never considered.**

**28.2 — There is no point-in-time tenant-data-fork capability
anywhere in the schema or tooling, and a branch split fundamentally
requires one for any table with history that predates the split — this
is a genuinely hard, not-yet-attempted class of migration that neither
scenario set's earlier findings (bulk import, bulk provisioning) fully
anticipated, because those were about data flowing IN to a tenant, not
about a tenant's own history needing to be divided.**

---

## SCENARIO 29 — Reports and financials that already ran now cover data
that has moved between tenants

**Every monthly report Al-Fanar's owner has ever pulled, for the
combined (post-merger) or now-divided (post-split) entity, referenced
data that has since changed which tenant it belongs to. This is
Workshop 5's Scenario 25 retroactive-correction finding, recurring for
an entirely different reason.**

### What happens

Before the split, Al-Fanar's owner ran (once Owner Home and the money
view eventually exist) a report showing combined revenue across all
three branches, Delta-merger included, for the quarter. After the
split, the departing branch's revenue for that same historical quarter
now, strictly, belongs to a business the original owner no longer owns
at all.

Does the historical report the original owner already generated and
possibly acted on (paid taxes against, reported to an investor) silently
become wrong retroactively, because the underlying data it drew from has
moved tenants? Does MOP have any concept of a **report as a frozen,
point-in-time artifact**, immune to later reparenting of its underlying
data, or does every report — as every report in the product currently
does — recompute live from whatever the current tenant boundary happens
to be?

### The core mistakes

**29.1 — Every report in the product (inventory reports, and every
report envisioned for later phases) computes live from current data
with no "frozen at generation time" semantics — this was a reasonable,
even correct design choice for a world where data doesn't move between
tenants, and Scenario 26–28 establish that world no longer describes
reality once mergers and splits are real, live operations the platform
has to support.**

**29.2 — This is the third scenario set finding (after Workshop 5's
Scenario 25) independently arriving at "reports need an immutable,
point-in-time snapshot concept, not live recomputation" — from a fraud-
correction angle there and a tenant-boundary-mutation angle here, which
is strong evidence this is a genuine, structural gap in the reporting
architecture rather than either scenario's own peculiarity.**

---

## SCENARIO 30 — The super admin realizes neither operation
(merge or split) has ever been performed, tested, or even scoped, and
the contract with Al-Fanar's owner is already signed

**Zooming out: this entire scenario, from the owner's first phone call
asking "can you combine my two workshops" through the split six months
later, assumed the platform COULD do this. It cannot, today, at all —
and the commercial conversation already happened before anyone checked.**

### What happens

The super admin, asked to execute the merger, discovers there is no
tooling, no documented procedure, no prior instance of this ever having
been done, and — per Scenarios 26–29 — several genuinely hard, unsolved
data-modeling questions standing between "the owner wants this" and "this
is possible." The honest answer is that fulfilling this request safely
requires new schema design, new migration tooling, and new product
decisions (does MOP even want to support tenant merge/split as a
first-class operation, given how deeply it cuts against the isolation
discipline that is otherwise one of the project's strongest, most
carefully-enforced properties?) — none of which exists, and none of
which can be improvised safely under the pressure of an already-signed
business commitment.

### The core mistakes

**30.1 — Sales and commercial conversations about what MOP can do
(explicitly named in the user's own framing of this scenario set — "how
the server handles many different requisites from many workshops") can
currently outrun the platform's actual, verified capabilities with
nothing in the product to catch the gap before a contractual promise is
made — this is an organizational risk as much as a technical one, and
neither scenario set has surfaced it as sharply as this one does.**

**30.2 — Tenant merge and split cut directly against the isolation
discipline `CLAUDE.md` treats as foundational ("the seed creates two
differently-shaped tenants... a single-tenant database makes isolation
bugs invisible") — building merge/split capability well means
deliberately, carefully punching controlled holes in a boundary the
rest of the architecture is built to keep absolute, which is a genuine
design tension, not a simple feature to add, and deserves to be decided
consciously rather than discovered under deadline pressure the way this
scenario found it.**

**30.3 — This closes Workshop 6's arc: five scenarios, one underlying
finding — `tenantId` is treated everywhere in the schema and every
piece of governance built on top of it (audit, capability, reporting,
staff identity) as a **permanent, load-bearing fact about a row**, and
nothing in either scenario set until this workshop ever needed that
assumption to be false. It is false, for real businesses, on a long
enough timeline, and the platform currently has no story for when it
is.**

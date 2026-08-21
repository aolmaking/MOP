# Scenario Set 2 — Synthesis

> Cross-reference index for `docs/scenarios2/` (Scenarios 1–40, platform
> layer) against `docs/scenarios/` (Scenarios 1–20, workshop-floor
> layer). Read this after both sets, before `PHASE_MAP.md`.

---

## The two sets ask different questions

`docs/scenarios/` put a technician's hands on a car and asked: *does MOP
have a word for what just happened?* It found MOP has almost no
vocabulary of its own — no service cards, no warranty, no queue, no
resources, no owner's money view — because the product was built as one
generic spine with no per-workshop specialization layer on top of it.

`docs/scenarios2/` put a super admin at the platform console and asked:
*can this be built, changed, governed, and trusted using only MOP, at
the scale and under the pressures a real platform actually faces?* It
found something different in kind, not degree: MOP's tenant boundary —
correct, rigorous, and one of the project's best-built properties for
the case it was built for — has **no accommodation for anything that
crosses, changes, or relates across it.** A tenant is treated as a
permanent, isolated, unchanging unit everywhere in the schema, the
audit model, and the permission layers. Real businesses do not stay
that shape.

## The one finding that dominates scenario set 2

Traced through Workshops 1, 3, 5, 6, and 8, the same root cause recurs
under five different names:

| Where it appeared | What it looked like |
|---|---|
| Workshop 1, Scenario 5 | Tenant offboarding is a status enum, not a process |
| Workshop 3, Scenario 13 | No external, financial-only stakeholder role |
| Workshop 5, Scenario 24 | No platform-witnessed, single-account-scoped control |
| Workshop 6, Scenarios 26–30 | No tenant merge, split, or historical reparenting |
| Workshop 8, Scenarios 36–39 | No cross-tenant ownership, no time-bounded access, no tenant group |

**`StaffUser.tenantId` and `Tenant.id` are treated as permanent, 1:1,
unchanging facts everywhere in the schema.** Every one of these five
findings is that assumption breaking against a real business event: a
sale, an investment, a merger, a split, a closure, a temporary
secondment. None of it is exotic — these are ordinary things that
happen to ordinary companies on a long enough timeline, and the
platform has never had to represent any of them because no scenario
before this set ever needed a tenant relationship to be anything but
permanent and singular.

## The second-largest finding: correctness assumes a live connection

Workshop 7 found that every guarantee this project is proudest of —
`WorkOrderLifecycleService` as sole writer, gate-checked transitions,
money idempotency, the capability model's reachability proof — was
proven against a world where actions happen in the order they're
requested, against current server state. Offline queueing, if ever
built, doesn't extend these guarantees; it requires **re-proving** them
against out-of-order, stale-state replay, which is new work, not a
client feature.

## The third: governance was designed for good-faith actors

Workshop 5 found that separation of duties, factual-vs-procedural
integrity, dispute states, and historical permission reconstruction are
all missing — not because anyone built them wrong, but because no
scenario before a fraud investigation ever needed the platform to
suspect the person holding a valid permission. The entire layered
permission model answers "is this allowed," never "should one person be
allowed to do all of this alone."

## Full cross-reference table

| Scenario 2 finding | First appeared | Recurs at |
|---|---|---|
| No fifth starter profile / open categorization | 1.1, 1.2 | — |
| Reachability guarantee is workflow-only, not data-retention-aware | 2.1 | 39.1 |
| No self-service plan upgrade / soft ceiling warning | 11.1–11.3 | — |
| No branch-provisional/maturing state | 12.1 | 16.1 |
| No external financial-stakeholder role | 13.1–13.3 | 36.1–36.3, 38.1 |
| No exit-reason / rehire-eligibility on deactivation | 14.1–14.2 | 22.3, 25.1 |
| Attention Center untested at multi-branch scale | 15.1–15.3 | 20.2 |
| No bulk-provisioning tool | 16.1–16.3 | 17.1 |
| No data-import concept, historical-invariant fabrication | 17.1–17.4 | 27.3 |
| Auth path untested at concurrent-mass-onboarding scale | 18.1–18.3 | — |
| No branch-scoped cascade / import-batch rollback | 19.1–19.3 | 28.2 |
| Single shared DB untested at 40×-tenant-size skew | 20.1–20.3 | 8.1–8.3 |
| No separation-of-duties concept anywhere | 21.1 | — |
| Audit proves actions, not facts | 21.2–21.3 | — |
| No dispute state distinct from lifecycle status | 22.1 | — |
| No forensic-reason refund taxonomy | 22.2 | — |
| No "restricted pending investigation" account state | 22.3 | 24.3 |
| No historical/point-in-time permission reconstruction | 23.1–23.3 | — |
| No platform-level, single-account-scoped control | 24.1–24.3 | 36.3 |
| No retroactively-corrected reporting period | 25.2 | 29.1–29.2 |
| No tenant-merge capability, `tenantId` rewrite conflicts with audit | 26.1–26.3 | 30.2 |
| `StaffUser.tenantId` is a hard 1:1, no split/multi-tenant identity | 27.1–27.3 | 36.2, 38.1 |
| No point-in-time tenant-data-fork | 28.1–28.2 | — |
| Reports have no frozen/point-in-time snapshot | 29.1–29.2 | 25.2 |
| Commercial promises can outrun platform capability | 30.1 | — |
| No offline-capable client anywhere | 31.1–31.3 | 33.1–33.3, 34.1–34.3 |
| Identity bound to session, not to person-at-device | 32.1–32.3 | — |
| Session revocation has no guaranteed timely delivery | 33.1–33.3 | — |
| Offline replay threatens lifecycle, money, and reachability guarantees | 34.1–34.3 | — |
| No bandwidth-cost design consideration anywhere | 35.1–35.3 | — |
| No multi-tenant account / cross-tenant identity | 36.1–36.3 | 27.1, 38.1 |
| No tenant-group / cross-tenant aggregate reporting | 37.1–37.3 | — |
| No time-bounded permission grant | 38.3 | — |
| Tenant closure under real stakes has no designed process | 39.1–39.3 | 5.1 (set 1) |
| Tenants are a flat set; the real relationships form a graph | 40.1–40.3 | — |

## What this changes about the roadmap

Scenario set 1 justified Phases 15–17 (specialization engine) as
drafted. Scenario set 2 does something scenario set 1 could not: it
shows that **specialization alone does not make MOP a platform capable
of running as a business**, independent of what any one workshop needs.
Three entirely new concerns, none reducible to "add a field the
workshop can configure," now have to be added to the plan:

1. **Tenant relationships** — ownership, lineage, temporary access,
   grouping. A new data model, sitting beside the tenant table, not
   inside it.
2. **Governance depth** — separation of duties, historical
   reconstruction, dispute states, point-in-time reporting. An
   extension of the permission and audit systems' actual guarantees,
   not new pages.
3. **Operational resilience at scale** — bulk provisioning, load
   testing, offline behavior, bandwidth cost. Infrastructure and
   architecture work, largely invisible in any UI, and the least
   glamorous, most likely to be deprioritized, and — per Workshop 4 and
   7 — the most likely to actually break a real deployment first.

See `PHASE_MAP.md`'s rebuilt phase list for how these three are now
sequenced against the original 14 phases and the specialization work.

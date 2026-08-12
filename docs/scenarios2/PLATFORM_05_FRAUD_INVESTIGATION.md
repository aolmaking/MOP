# Platform Scenario Set — Workshop 5: Cedar Motors (fraud investigation)

> **Scenarios 21–25 of 40.**

---

## The workshop

**Cedar Motors** — a 2-branch Cairo tenant that looks entirely ordinary
until a pattern emerges: an inventory manager has been issuing parts
against fabricated work orders and reselling them, and a customer has
reported being charged for work never performed. Chosen to stress the
platform's **governance, forensics, and dispute-resolution machinery**
under conditions that assume good faith everywhere else in the product.

| | |
|---|---|
| Branches | 2 |
| The suspect | Inventory manager, 14 months tenure, trusted, `inventory.request.issue` and `inventory.request.approve` both granted (a role-template default this project's own `default-role-permissions.ts` grants together) |
| What's alleged | Parts issued against work orders for cars that were never actually in the shop; a customer billed for a full brake job that photographic evidence (his own dashcam, coincidentally) shows never happened |
| Who's asking | The workshop owner, escalating to the platform, escalating toward possible law enforcement involvement |

---

## SCENARIO 21 — The owner tries to prove fraud using the audit trail
built for governance, not for forensics

**`AuditLog` records every risky action. The owner discovers "records
every action" and "supports a fraud investigation" are not the same
claim.**

### What happens

The owner, now that Audit & Change History is a real page, filters to
the inventory manager's actions over the suspect period. He sees a
stream of `inventory.request.issue` and `inventory.request.approve`
rows — but notices something specific: **the same account both
requested-on-behalf-of a technician (or received an already-approved
request) and approved it.** Nothing in the `PartRequestService` or the
permission model as documented prevents one person holding both
`inventory.request.approve` and `inventory.request.issue` from
approving and issuing against a request they effectively control end to
end, with **no second-person check anywhere in the part-request
lifecycle** — the "safe" pattern the product otherwise cares deeply
about (deny-by-default, layered permissions, the reachability
guarantee) has nothing to say about **separation of duties**, a
completely different security property that has simply never come up in
either scenario set because every prior story assumed the person with a
permission was using it honestly.

Worse: the fabricated work orders themselves. `WorkOrderLifecycleService`
is, per `CLAUDE.md`, "the only writer of `WorkOrder.status`" — a real,
enforced guarantee. But **nothing enforces that a work order corresponds
to a real car that was actually physically present.** Intake writes an
`Asset` record from whatever plate/VIN a person types in; nothing
cross-checks it against, say, the asset's last-known location, an
odometer-continuity check, or literally anything that would catch "this
plate was typed in by someone who invented it." The state machine's
integrity (no hardcoded transitions, gate-checked progression) is a
guarantee about **process**, not about **factual truth** — and this is
the first scenario in either set to expose that MOP has never needed to
distinguish the two, because until now nobody had a reason to lie to it.

### The core mistakes

**21.1 — There is no separation-of-duties concept anywhere in the
permission model — a single account holding both `approve` and `issue`
permissions (which the role template grants together to
`INVENTORY_MANAGER` by default) can request, approve, and fulfill in a
closed loop with no second person ever required to look at it, and the
permission layers (platform, plan, tenant status, capability, module,
feature, workshop config, delegation, role template, user override) have
no concept of "requires a second, different person's sign-off," only
"is this one person allowed."**

**21.2 — The audit trail proves *what actions were taken*, not *whether
the underlying facts were true* — a fabricated work order for a car
that was never present generates a completely normal-looking audit
history, indistinguishable from a real one, because nothing in the
system ever checks a work order's claims against any independent
signal.**

**21.3 — `WorkOrderLifecycleService`'s integrity guarantee (no hardcoded
transitions, always gate-checked) is a guarantee about the *state
machine*, and this scenario is the first to reveal it was never meant
to be, and cannot be stretched to be, a guarantee about the
*truthfulness of what's recorded* — which is a real, previously
unstated limit on what "the only writer of `WorkOrder.status`" actually
protects against.**

---

## SCENARIO 22 — The customer's evidence contradicts MOP's record, and
there is no dispute/correction workflow at all

**The customer says the brake job never happened. MOP's record says it
did, complete, invoiced, paid. Something has to be able to record "this
record is disputed" without simply overwriting history.**

### What happens

The customer's dashcam shows his car parked, untouched, during the exact
window MOP's work order says the brake job was performed and completed
by the (now-suspect) inventory manager acting through a compromised or
complicit technician account. The owner needs to:

- **Mark this specific work order as disputed**, visibly, without
  deleting or silently editing its history — deleting it would destroy
  evidence; silently correcting it would be exactly the kind of quiet
  rewrite the audit-boundary discipline exists to prevent everywhere
  else in the product.
- **Refund the customer** for a job that MOP's finance system treated as
  a normal, closed, paid transaction — and Finance Core, as built,
  assumes refunds are a *rare, exceptional* path (the summary notes
  "deferred refunds/credit notes" as a known Phase 9 gap), not a
  *forensic* one requiring a documented reason, a link back to the
  fraud case, and its own audit trail distinguishing "customer changed
  their mind" from "this was fraudulent and being refunded as part of
  remediation."
- **Flag the technician's account** whose credentials were used, without
  yet knowing whether the technician was complicit or simply had a
  shared or stolen login — the account needs a state between "active,
  trusted" and "deactivated, gone" that doesn't currently exist: **under
  investigation, restricted, but not yet concluded.**

None of these three things — dispute marking, forensic-reason refund,
or a provisional "restricted pending investigation" account state — has
a place in the schema or the workflow anywhere.

### The core mistakes

**22.1 — There is no dispute state for a work order, distinct from its
lifecycle status — `WorkOrderStatus` has states for the normal
operational flow (registered, in progress, awaiting approval, closed,
etc.) and nothing for "this closed record's factual accuracy is now
under formal question," which needs to be visible everywhere the
original record is visible without altering the original record.**

**22.2 — Refunds have already been named, in this project's own prior
work, as a deferred gap ("deferred refunds/credit notes" in the Phase 9
notes) — but this scenario shows the gap is sharper than "refunds
aren't built yet": even once built, a refund needs a *reason
taxonomy* that distinguishes routine reversal from forensic remediation,
because the two have entirely different audit, reporting, and
(potentially) legal-disclosure implications, and nothing in the
Finance Core design as described considers this distinction at all.**

**22.3 — Account states are binary (`isActive: true`/`false`) with
nothing between them — there is no "restricted pending investigation"
state that would let the owner cut off further actions from a
potentially-compromised account without prematurely declaring guilt by
fully deactivating (and thereby, per Workshop 3's Scenario 14 finding,
losing exit-reason and rehire-eligibility nuance) before an
investigation concludes.**

---

## SCENARIO 23 — The platform is asked to help, and discovers its own
support tooling gap (Scenario 4) is now a legal liability, not just an
inconvenience

**The owner escalates to the platform: "I need help proving this."
Everything Workshop 1's Scenario 4 found missing (impersonation/support-
view mode) now matters for a completely different, much higher-stakes
reason.**

### What happens

The platform's support engineer needs to reconstruct exactly what the
inventory manager saw and could do, at each point in the suspect period,
to establish whether the fraud was **possible only because of a genuine
permission gap** (which would implicate the platform's own design) or
was **a deliberate circumvention of correctly-designed controls** (which
would not). This is a materially different, much higher-bar question
than Workshop 1's "help a confused owner see what he sees" — it is now
potentially **evidence in a legal proceeding**, and the platform has:

- **No impersonation mode** (already found, 4.1) to reconstruct the
  suspect's exact view at a point in time.
- **No way to reconstruct "effective permissions at a past moment"** —
  `EffectiveAccessService` resolves permissions **live, against current
  state** (`PermissionContextService.load()` reads the tenant's
  *current* role templates, *current* capability profile, *current*
  overrides). If the inventory manager's permissions were changed at any
  point during the investigation period — the owner may well have
  already revoked access reactively, the moment suspicion arose — **the
  system can no longer accurately answer "what could this person do on
  the day the fabricated work order was created,"** because permission
  resolution has no historical mode at all, only "what can this session
  do right now."
- **`AuditLog` rows exist**, which is good — but reconstructing "the
  effective permission set at time T" from a stream of individual
  `capability.changed` / role-permission-change events requires
  correctly replaying every relevant change in order, a non-trivial
  reconstruction that nothing in the product currently automates or
  even anticipates needing.

### The core mistakes

**23.1 — Permission resolution has no historical/point-in-time mode —
`PermissionContextService` is explicitly, deliberately built to read
*current* state for correctness and performance reasons (Phase 1's
per-request caching decision), and nothing about that architecture
anticipated ever needing to answer "what could this account do on this
past date," which is now revealed as a real, unmet need with genuine
legal weight, not a hypothetical one.**

**23.2 — Even with a complete `AuditLog`, reconstructing a past
effective-permission state requires replaying every relevant historical
change correctly, in order, against the *system's own historical rule
logic* (which may itself have changed via platform updates in the
interim) — and no tool, script, or documented procedure for doing this
reconstruction exists anywhere in the project.**

**23.3 — The support-impersonation gap (Workshop 1, Scenario 4),
previously framed as a customer-service inconvenience, is now shown to
have a second, much more serious dimension: without it, the platform
cannot even offer to *look* at what happened without either trusting
the suspect tenant's own (possibly compromised) account access or
building forensic tooling from scratch, under time pressure, during an
actual live investigation — precisely the wrong moment to be designing
security-sensitive tooling for the first time.**

---

## SCENARIO 24 — The owner wants to freeze one person's access without
freezing the whole workshop, and the platform's only lever is a tenant-
wide one

**Freeze/reactivate, as specified and as this project's own recent
work built it, is a whole-tenant action. The owner does not want to
freeze Cedar Motors — the other branch is innocent and needs to keep
operating — he wants to stop one person.**

### What happens

The owner asks the platform: "can you lock out just this one account
while we sort this out?" The freeze mechanism that exists — the one this
project's own recent Workshops-list work implemented, with its live
impact preview and required-reason dialog — operates on `Tenant.status`,
revoking **every active session for the entire tenant**. That is the
right tool for "this whole workshop is a risk to the platform" and
entirely the wrong tool for "one specific person is a risk, and 40
other people at this workshop need to keep working, including the other
branch that has nothing to do with this."

The owner already has the ability to deactivate a `StaffUser`
(`isActive: false`) himself, without any platform involvement — which
is the *tenant-side* lever, correctly scoped to one person. But that is
not what he's asking the platform for: he wants **platform-level
backing** — a record, potentially useful evidentially, that the
platform itself was notified and took the situation seriously, separate
from "the owner quietly clicked deactivate on his own dashboard," which
carries no independent weight if this ends up in front of a court or an
insurer.

### The core mistakes

**24.1 — The only platform-level control lever (freeze/reactivate) is
tenant-scoped, all-or-nothing — there is no platform-level, single-
account-scoped control action, meaning "help me contain the damage
from one bad actor without punishing forty innocent employees" is a
request the platform's own governance tooling cannot fulfill at all,
even though the tenant-side `isActive` flag technically could achieve
the narrow effect.**

**24.2 — There's no concept of a platform-witnessed, platform-recorded
action taken *at a tenant's request but affecting only part of that
tenant* — the freeze mechanism's audit trail (real, `riskLevel: HIGH`,
proper) is the platform's own evidentiary record precisely because it's
the platform acting; a tenant-side `isActive` toggle produces a tenant-
scoped audit row with no independent platform corroboration, which is
exactly what would carry more weight in a dispute.**

**24.3 — This is a sharper, platform-level restatement of Scenario 22's
"account states are binary" finding: the gap isn't only that a tenant
needs a middle state between active and deactivated, it's that the
*platform itself* has no way to participate in, witness, or lend
institutional weight to that middle state — freeze is too big a hammer,
and a tenant-side toggle is invisible to the platform entirely.**

---

## SCENARIO 25 — The investigation concludes, and MOP has no concept of
"restore, but not quite as it was"

**The inventory manager is confirmed to have acted alone; the
technician's account was genuinely compromised, not complicit. The
account needs to come back — differently than it left.**

### What happens

Three weeks later: the technician is cleared, wants his account back and
his reputation restored inside the product (his `TeamMembership` history
and performance record, if Phase 10 ever builds one, should not carry a
permanent, unexplained gap that looks exactly like the fraud itself).
The inventory manager's account needs to be **permanently deactivated
for cause**, distinctly from the routine attrition Workshop 3's Scenario
14 already found MOP has no vocabulary for (quit vs. fired vs. fired-
for-cause) — except now the distinction isn't a nice-to-have for a
turnover report, it is the specific, load-bearing fact that determines
whether this person can ever work at another MOP-run workshop again, if
any cross-tenant reputation or reference-check concept were ever built
(it isn't, per Workshop 3's finding, 14.2).

Separately: every fabricated work order and every fraudulently-issued
part needs to be **corrected in the reports and financials that already
ran** — the owner's monthly revenue report for the affected months
included fabricated income; the inventory reports counted fraudulently-
issued stock as legitimate movement. Nothing in the reporting or
financial-close model has a concept of **retroactive correction of a
closed period** — every report built so far (inventory reports, the
still-unbuilt Owner money view) computes fresh from current data, with
no notion of "this month was already closed and reported, and now needs
a formally recorded, visible correction" the way real accounting
requires a restated period, not a silent edit to history.

### The core mistakes

**25.1 — Account deactivation has no "for cause, confirmed" state
distinct from ordinary attrition, and no mechanism to formally,
visibly clear an account that was suspected but exonerated — the
technician's record, absent this, permanently and ambiguously looks
like something happened, with no way for the product itself to say
what actually concluded.**

**25.2 — There is no concept of a retroactively-corrected reporting
period anywhere in the product — every number MOP has ever shown
(inventory reports, and eventually the Owner's money view) is computed
live from current data, with no accounting-style "restated" concept for
when a previously reported period turns out to have included fraudulent
or erroneous data, which is precisely the moment real financial
reporting discipline (and likely tax/regulatory obligation, echoing
Workshop 2's Scenario 10) requires one.**

**25.3 — This closes the loop on the entire scenario: a fraud
investigation, from first suspicion to final resolution, touches
separation of duties (21), factual-vs-procedural integrity (21),
dispute states (22), refund taxonomy (22), historical permission
reconstruction (23), platform-witnessed partial action (24), and
retroactive correction (25) — seven genuinely distinct gaps, none of
which overlaps with anything either scenario set found before, because
every prior scenario, across 25 stories now, assumed every actor in the
system was acting in good faith. This one wasn't, and almost nothing in
MOP was built with that possibility in mind.**

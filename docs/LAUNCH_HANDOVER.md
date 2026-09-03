# Launch handover — what this product does, and what it does not

> Acceptance criterion 8 of [`14-DAY-LAUNCH-SCOPE.md`](./14-DAY-LAUNCH-SCOPE.md):
> "Known-limitations handover doc lists every DEFERRED item with its plan
> reference (nothing silent)."
>
> Written 2026-09-02 against `develop`. Every claim below is either
> traceable to a passing test named here, or listed as not proven.
> If you find something this document does not mention, that is a defect
> in this document.

---

## 1. What a workshop can actually do today

Proven end to end over real HTTP against real Postgres, on the launch
capability profile, in `apps/api/src/testing/walkthrough.http.spec.ts`
(21 assertions), `parts-loop.http.spec.ts` (14) and
`decision-deadlock.http.spec.ts` (6):

A Super Admin creates a workshop through the real creation path. The
owner redeems an invite link and signs in, and is **refused** intake —
deliberately, because that is not their job. They invite a branch
manager, who redeems their own link. The manager books a walk-in customer
and car in. A technician starts the inspection, records it, logs a fault
and prices it. The customer opens the link, is recorded as having seen
it, and approves. The job becomes approved for work; the technician
starts. The manager adds a task the customer mentioned at the desk. The
technician needs a part; the store approves and issues it off a real
shelf; a partial issue deliberately does not finish the request. The
technician receives it, sends the wrong one back, answers the store's
question, and the store accepts the return — restoring both the stock and
the bill. The job finishes only once every part is accounted for. The
owner issues the invoice; the delivery board names the car as held and
hands over the invoice that is holding it; the counter takes payment (a
replayed idempotency key records one payment, not two), the board stops
offering to take money that is no longer owed, and the manager releases
the car. It closes.

An ask the customer never answers does not strand the job: staff withdraw
it from the approvals list, and the finish gate reopens.

The same code, on a workshop with nothing switched off, routes FINISH
into team review and then QC before the money
(`walkthrough-contrast.http.spec.ts`). That is the capability engine
deciding, not a hardcoded path.

### The live journey (added 2026-09-03)

Every one of those moves is now visible, as it happens, to the three
people who care: the technician holding the spanner, the team leader
chasing the job, and the customer waiting for the car. One work order has
one journey; the same projection serves all three, in three vocabularies,
so they can never be told different stories about the same repair.

It is a **projection, not a store**. There is no journey event table:
every event is read back from the record that already proves it happened
and is dated by that record's own timestamp — the inspection row, the
hand-over row, the payment row. Nothing is inferred from current status,
so a job sitting in WAITING_PARTS with no part request on it shows no
"part requested" event. The workflow remains the only state machine; the
journey reads, interprets and projects it, and never decides.

Proven over real HTTP in `apps/api/src/testing/journey.http.spec.ts` (12
scenarios) — intake through CLOSED with a parts loop in the middle,
asserting at every transition that the event appeared, carried the
record's own timestamp, and that the previous stages stayed historical —
and in `journey-events.integration.spec.ts` (8) for the projection rules
themselves. Three concurrent cars keep three separate journeys; a
technician with no assignment, a team leader outside the roster, and
another workshop's manager are all refused, the last two as not-found so
the ids cannot be enumerated. The customer's copy is missing the internal
events rather than rewording them: 17 events where staff see 23, with no
staff name, no warehouse and no shop-floor reason anywhere in it.

Verified in a browser on all three surfaces against one real work order:
the strip auto-scrolls to where the car actually is, the "Now" panel
gives since / duration / who is owed / why / what next, the history
renders in order with real actors, and issuing a part from a separate
session moved the open journey from "Waiting for parts / 23 events" to
"In progress / 25 events" with no page reload. The manager's one offered
action moved the job for real and then disappeared, because the server
stopped offering a move that was no longer available.

---

## 2. Deferred by the plan — nothing here is broken, all of it is switched off

Each row is deferred by [`14-DAY-LAUNCH-SCOPE.md`](./14-DAY-LAUNCH-SCOPE.md)
§DEFERRED. The pages, APIs and tests exist; the launch surface does not
offer them.

| Deferred | Plan reference | State of the code |
|---|---|---|
| Country billing adapters / legal e-invoices | §0 fact 2, T3 post-M5 | `ADAPTER_COVERED_COUNTRIES` is empty by design; launch runs `BILLING = EXTERNAL`, an officially designed capability state |
| Automatic customer notifications (WhatsApp/SMS/email) | T4 | No sender exists. Decision links and invites are delivered by hand |
| Policy setter UI / governance runtime | T5, M4 | Policies are set at creation and not editable after |
| Specialization-driven behavior | T6 | Packs are stored; nothing consumes them |
| Data Analyst role (7 pages, saved views, CSV export) | §Hidden | Complete and tested. Held back by `runtime/launch-surface.ts`; the role lands on Access Denied |
| Team Leader role (4 pages) | §Hidden | Complete. TEAMS/TEAM_REVIEW are off in the launch profile, so the capability layer denies it anyway |
| Multi-branch / multi-warehouse | §Hidden | Capabilities exist and validate; off at launch |
| Review / QC journeys | §Hidden | Proven working on the contrast profile; off at launch |
| Owner forms, messages, workflow-health, audit view, reports | §Hidden | Pages exist; rails do not offer them, and in-page links to them are gated by the same manifest |
| Platform reports sections 3-6, live view | §Hidden | Kept internal-only |
| Arabic string translation | §Hidden | Layout is RTL-ready and enforced by `lint-directional-css.mjs`; the strings are not translated |
| Attachments / photos | §DEFERRED | Not built |
| Transfers, supplier orders | INVENTORY-EXECUTION-MAP §B | States exist in the enum, dormant, reachable later without migration |
| Disputes, staff-restriction routes, realtime | §DEFERRED | Not built |

---

## 3. Known gaps found during the build — read this section before the pilot

These were found while proving the above, and none of them is fixed.

### 3.1 There is no way to put opening stock on a shelf (no plan reference — found in Wave 4)

Catalog deliberately does not set quantity, and no receiving, adjustment
or stock-take endpoint exists anywhere. The harness seeds
`WarehouseStockBalance` directly because it has no alternative. **A pilot
workshop hits this on its first morning**: they can create every part in
their catalogue and none of them will have a quantity.

Until it is built, opening stock has to be inserted into the database by
hand. That is a real operational dependency on you, not on them.

### 3.2 A part can be billed and off the shelf while the job closes

`board/reviews/F-007`. `parts.received_used_or_returned` counts requests
in ARRIVED and RECEIVED_BY_TECHNICIAN but not ISSUED — and issuing is the
transaction that both decrements stock and creates the billable line. In
the window between the counter handing a part over and the technician
confirming it, a job finishes, invoices and closes normally.

Not changed because gate-evaluator semantics are on the sprint's
FORBIDDEN list, and widening the gate without a "received on the
technician's behalf" path would strand jobs wherever technicians do not
reliably tap.

### 3.3 A job waiting on a mid-work question still reads "in progress"

`board/reviews/F-008`. `ASK_CUSTOMER` (IN_PROGRESS -> WAITING_CUSTOMER)
has no production caller, so a technician's mid-job question leaves the
work order reading IN_PROGRESS on the board, in the dossier and in the
customer's own journey. Only the finish gate knows.

Wiring it was tried and reverted because it makes things strictly worse:
WAITING_CUSTOMER's only exits are the customer answering and an
unintented edge to CANCELLED, and FINISH leaves only IN_PROGRESS -- so a
customer who goes quiet strands the job with no way out at all. Leaving
it IN_PROGRESS keeps M-3's withdraw guard working. Closing it needs a
staff exit from that state, which is a workflow-graph change.

**The live journey does not paper over this.** WAITING_CUSTOMER has full
labels in all three vocabularies and would draw correctly the moment
something moved a job there — but nothing does, so the journey shows what
is actually true: the work order reads IN_PROGRESS, and the outstanding
decision appears as an unanswered `decision.asked` in the history and as
"a customer decision is still outstanding" on the headline. A strip that
invented a WAITING_CUSTOMER stage the workflow had never entered would be
the second state machine the journey exists not to be.

### 3.4 ~~"The customer opened the link" is a state, not a time~~ — FIXED 2026-09-03

`CustomerDecisionRequest` now has `viewedAt`, written in the same update
that sets the `VIEWED` status (`CustomerDecisionService.read`), so the
journey can say *when* the customer opened the request and not only that
they did. Two sibling columns were added for the same reason and are
covered by the same migration
(`20260903090000_journey_event_timestamps`): `PartRequest.approvedAt`,
because `updatedAt` on a request that was later issued and used is a
different moment entirely, and
`PartReturnRequest.clarificationAskedAt`/`clarificationAnsweredAt`, so a
clarification cycle reads as the pair of dated events it actually is.
Proven in `journey.http.spec.ts` — the event's timestamp is asserted
equal to the column, not merely present.

### 3.4b Three write-only fields and a permanently-wrong health check — FIXED 2026-09-03

Found while building the journey, all three the same shape: a field that
something reads and nothing writes.

`IssuedItem.arrivedAt`, `receivedAt` and `usedAt` have existed since the
model was written and **nothing ever set any of them**, while two places
read them. The technician's "I've got it" and "it's fitted" moved the
request's status and left the hand-over row undated, so the only
per-hand-over record of when each step happened was permanently null.
`PartRequestService` now stamps them at the single transition choke point
every path goes through — including `resolveRejectedReturn`, which
reaches USED without going through `move()`.

The consequence was worse than a missing timestamp. The Owner's
workflow-health check `PART_ARRIVAL_UNCONFIRMED` filtered on
`arrivedAt: null` with **no status filter**, so it reported every part
the workshop had ever issued — fitted months ago, on closed jobs — as an
unconfirmed arrival, forever. That page filled with permanent noise,
which is how a real warning stops being read. It is now scoped to
requests genuinely still in transit; the filter is still required even
with the stamping, because the graph deliberately lets an in-house
hand-over go ISSUED -> RECEIVED_BY_TECHNICIAN without writing "an ARRIVED
nobody witnessed".

Separately, the customer's journey used to be scoped through
`currentService` — the list of jobs in a *live* status — so a customer
watching their repair was refused with a 403 the moment it closed, on the
one screen whose whole purpose is telling them it finished. Access is now
scoped by ownership of the work order, which is the actual question.

### 3.5 Nothing is pushed, so CI has never been observed green

The workflow is correct and merged (`a4371b4`) and runs on `main`,
`develop`, `track/**` and `infra/**`. Nothing has been pushed to GitHub
and there is no `gh` on this machine, so **M-12 cannot be closed**. The
full gate is green locally and that is all anyone can currently say.

### 3.6 No deployment target (blocker B-002)

No Docker, no administrator rights. What exists instead:
`tools/staging/` runs a real TLS edge over the LAN in front of a
production-mode API, and its smoke suite passes 12/12 including the
assertions that matter (`Secure; HttpOnly; SameSite=Lax` on a session
cookie after a real login through the proxy hop). What does not exist: a
VPS, public DNS, a real certificate, a process supervisor, automated
redeploy, edge rate limiting. **M-9 is not closed.**

Backups: `tools/staging/backup.sh` and `restore-drill.sh` work and the
drill has been executed — 78 tables, 2 tenants, 16 accounts, 20 work
orders, 31 migrations, restored in 2 seconds, with all three refusal
modes watched. There is no scheduling, rotation, encryption or offsite
copy. **M-10's drill is done; its automation is not.**

### 3.7 SHOULD items not shipped

S-2 security TTL/refresh-cap pair, S-3 Owner Reports tab, S-4 decision
expiry sweeper, S-5 dossier polish. S-1 (Attention row actions) IS
shipped -- its buttons were live no-ops and now navigate to the surfaces
that perform them. M-3's cancel endpoint plus read-computed
expiry covers the deadlock S-4 would otherwise address.

### 3.8 M-14 is not an engineering task and is not done

The pilot workshop has not been created through the wizard with its real
catalogue, staff and policies, and no administrator has been trained.
Both need the pilot. (M-13, the seed's own honesty, IS done -- see the
note in §1.)

---

## 4. What we will not claim

MOP does not produce a government-compliant tax invoice — the workshop's
existing tax process is unchanged, and MOP holds the money truth beside
it. It does not notify customers automatically. It does not offer QC,
team review, multiple branches or warehouses, analytics, photos,
post-creation policy editing, or an Arabic interface.

None of those are missing walls. They are switched-off rooms in a house
whose electricity works — every one of them is configuration or a
scheduled track, and the pages behind them already exist and are tested.

---

## 5. How to check any of this yourself

```bash
corepack pnpm lint          # 7 checks incl. audit boundary, money, dead links
corepack pnpm typecheck
corepack pnpm test          # shared + api + web
corepack pnpm build
```

The two files worth reading before trusting anything else:

- `apps/api/src/testing/walkthrough.http.spec.ts` — the golden journey,
  HTTP only, nothing pinned.
- `apps/api/src/testing/parts-loop.http.spec.ts` — the inventory loop,
  including what the customer is *not* allowed to see.

Board evidence lives in `E:\mop-fleet\board\` — `status/` for card
outcomes, `runs/` for gate and journey records, `reviews/` for findings,
`decisions.md` for anything that changed shape.

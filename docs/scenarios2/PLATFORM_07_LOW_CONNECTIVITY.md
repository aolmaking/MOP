# Platform Scenario Set — Workshop 7: Wadi Auto (low connectivity)

> **Scenarios 31–35 of 40.**

---

## The workshop

**Wadi Auto** — a single branch in a small town in the New Valley
governorate, several hours from Cairo, served by unreliable mobile data
and no fixed broadband. Chosen to test an assumption that has been
silent and universal across every scenario in both sets so far: **MOP
is a web application that assumes a connection.**

| | |
|---|---|
| Branches | 1 |
| Connectivity | 3G, frequently degraded to 2G-equivalent speeds; outages of 20–90 minutes are a weekly, not exceptional, occurrence |
| Technicians | 3, all using a shared workshop tablet plus their own phones |
| Work | General repair, similar in shape to Nafath (Workshop A, first set), but the entire premise of this workshop's scenarios is the network, not the trade |

---

## SCENARIO 31 — A work order is started, the connection drops mid-task,
and the technician keeps working with his hands while the app has
nowhere to put what's happening

**Ashraf-equivalent technician is mid-oil-change. The signal drops. He
has already, verbally, told the customer it's a 5W-30. He finishes the
job. The app has not received a single event from him in nineteen
minutes.**

### What happens

The technician's work card, per this project's own architecture
(Angular, HTTP-backed, no offline story described anywhere in
`docs/DEVELOPMENT.md`, `PROJECT_STATE.md`, or any phase document), is a
live page talking to `apps/api` over HTTP. There is no service worker,
no local write queue, no optimistic local state that reconciles later —
every action (start task, add note, request part, complete) is,
architecturally, a request that either succeeds against the live server
or does not happen at all from the product's point of view.

When the connection drops:

- **He cannot mark the task started**, if he hadn't already, so the
  work order's actual start time (which several already-built features
  depend on — attention-ranking age, the SLA/expected-duration work
  drafted for Phase 16) will, once connectivity returns, show whatever
  time he happens to be able to tap the button, not when the work
  genuinely began — a silent, systematic clock skew for every
  connectivity-affected job.
- **He cannot log the service-card fields** (the very feature Workshop
  A's Scenario 1 identified as the single most important missing
  capability, 1.2) as he goes — he has to remember them and enter them
  all at once when signal returns, reintroducing exactly the "wrote it
  down on paper, transcribed later, details got fuzzy" failure mode the
  whole service-card idea exists to eliminate, except now it's not a
  process failure, it's the product's own connectivity assumption
  forcing it.
- **If he finishes the job entirely offline and the connection never
  comes back before the customer wants to leave**, there is no way to
  complete the work order, take payment, or release the car through
  MOP at all — Sameh-equivalent has to do what Nafath already sometimes
  does under different pressure (Workshop A, 1.3): let the customer go,
  settle up on trust, and catch the system up whenever signal returns,
  which means **MOP was, for that transaction, not the system of record
  at all** — a spoken-word arrangement was, and the product never finds
  out until later, if ever, that this happened.

### The core mistakes

**31.1 — There is no offline-capable client anywhere in the
architecture — every write is a live HTTP request with no local queue,
no service worker, no reconciliation strategy, meaning any connectivity
gap doesn't just slow the product down, it makes it **completely
unusable** for the exact duration of the outage, for a workshop where
outages are a weekly, unremarkable fact of life rather than a rare
emergency.**

**31.2 — Timestamps that matter for real product features (task-start
time feeding attention-ranking age, and the expected-duration/over-run
signal Workshop A's Scenario 3 found missing) are captured at
**tap time, not event time** — for a connectivity-degraded workshop,
this silently and systematically corrupts exactly the signal a
service-quality feature like SLA tracking would need to be trustworthy,
in a way that's invisible unless someone specifically compares tap
time against when the work actually happened.**

**31.3 — When connectivity fails entirely during a transaction, the
workshop's only recourse is to fall back to a verbal, off-system
arrangement — meaning the product's reliability floor, for a workshop
like Wadi Auto, is not "MOP is slow sometimes," it's "MOP periodically
stops being the source of truth for what actually happened," which is
a fundamentally different and more serious failure mode than a
performance problem.**

---

## SCENARIO 32 — Two technicians, one shared tablet, and a login session
that assumes one continuous, individual, online identity

**Wadi Auto cannot afford a device per technician. Three people share
one workshop tablet, handing it back and forth, sometimes mid-task.**

### What happens

MOP's session model — `SessionContext`, resolved per-request, tied to
one `Account` — assumes one logged-in identity uses one device for a
continuous stretch. In practice, Ashraf-equivalent logs in on the shared
tablet, starts a task, hands it to a colleague to look something up
while he goes back under the car, and the colleague, still logged in as
Ashraf, adds a note under Ashraf's name for something the colleague
actually did.

Nothing in the audit trail, the work-order history, or anywhere else in
the product can tell the difference — every action attributed to
"Ashraf" via `session.accountId`/`session.displayName` may, on a shared-
device workshop, actually have been performed by whoever was holding
the tablet, and MOP has no way to know or record which.

This directly undermines exactly the guarantees the audit-boundary
discipline (`CLAUDE.md`) and the whole permission model are built to
provide: "who did what" is one of the most basic questions the audit
log exists to answer, and on a shared-device workshop, **the answer MOP
records is routinely wrong**, not because of a bug, but because the
product's identity model assumes a one-person-one-device relationship
that simply doesn't hold for a workshop too small or too poor to afford
one device each.

### The core mistakes

**32.1 — Identity is bound to a login session, not to a person actively
using the device at a given moment — there is no re-authentication
prompt on hand-off, no lightweight "confirm it's still you" check, and
no design anywhere that anticipated a shared-device workshop, despite
this almost certainly being **the most common hardware reality** for
the smallest tier of workshop MOP is meant to serve.**

**32.2 — Every audit and attribution guarantee the product makes ("who
approved this," "who performed this task") is quietly, systematically
unreliable for any workshop sharing devices across technicians — this
is not a rare edge case, it is a predictable consequence of the
product's pricing and target market including workshops too small to
equip everyone individually.**

**32.3 — This is a genuinely different failure mode from Workshop 5's
fraud-adjacent credential-sharing finding (a security failure caused by
a missing role) — here, sharing is not a workaround for a missing
feature, it's the **ordinary, expected, blameless way a resource-
constrained workshop operates**, and the product's identity model has
no accommodation for a legitimate use case, only for the illegitimate
one it happens to resemble.**

---

## SCENARIO 33 — A super admin platform action (freeze, capability
change) targets Wadi Auto while it's mid-outage, and the "impact
preview" and "session revocation" both assume the tenant is reachable

**This connects directly to the Governance & Control scenarios
(Workshop 5) from a totally different angle: what does "freeze this
tenant, revoking all active sessions" even mean for a tenant that is,
at this exact moment, unreachable due to its own local connectivity?**

### What happens

Suppose, unrelated to anything Wadi Auto did, the platform needs to
freeze it (a billing dispute, unrelated to any wrongdoing — simplest
case). The freeze flow's impact preview computes "live" session counts
at dialog-open time — but Wadi Auto's technicians, mid-outage, may have
app instances that *appear* logged in locally (a stale, cached client
state, since there's no offline architecture per Scenario 31 to
distinguish "genuinely still connected" from "hasn't been told yet") but
have no live connection to actually receive a session-revocation signal
until connectivity resumes.

When connectivity DOES resume — possibly hours later, mid-task, mid-tap
on a form — does the client discover, abruptly, that its session was
revoked hours ago, losing whatever the technician was in the middle of
entering, with no warning, because the revocation happened silently on
the server side while the client had no way to know? This is a sharper,
platform-governance-flavored version of Scenario 31's connectivity gap:
there, the workshop's own operations were disrupted by outages; here,
**the platform's own governance actions land at an unpredictable,
disruptive moment entirely disconnected from when they were actually
issued**, because nothing bridges "the server decided this" and "the
client, eventually, finds out."

### The core mistakes

**33.1 — Session revocation (used by freeze, and presumably by any
future forced-logout governance action) is a server-side state change
with no guaranteed, timely delivery to a client that may be
intermittently connected — for a reliably-connected workshop this is
invisible (the next request just gets rejected, cleanly, immediately);
for Wadi Auto it means a governance action's real-world effect is
delayed and unpredictable, landing at whatever moment connectivity
happens to resume, potentially destroying in-progress local work with
no warning.**

**33.2 — The freeze impact preview's "live session count," explicitly
designed (per this project's own recent work) to be accurate at dialog-
open time rather than cached, has an unstated assumption baked into
what "live" even means — a session that is technically active in the
database but belongs to a device with no current network path is
neither cleanly "live" nor cleanly "gone," and the preview has no
concept of this third state, "will be affected eventually, whenever it
reconnects."**

**33.3 — Nothing in the platform's governance tooling was designed with
intermittent connectivity as a first-class condition to reason about —
every action (freeze, reactivate, capability change) is built and
tested against tenants assumed to be continuously online, which,
combined with Scenario 31's finding that no client-side offline
architecture exists at all, means Wadi Auto experiences every platform
governance action with a layer of unpredictability that a reliably-
connected tenant never does.**

---

## SCENARIO 34 — Wadi Auto's owner asks for the product to work "even
when the internet is down," and this collides directly with the
architecture's core correctness guarantees

**This scenario names, explicitly, the tension the previous three only
implied: building real offline support is not a small feature addition
— it directly threatens several of the project's own load-bearing
guarantees.**

### What happens

Suppose the platform commits to building genuine offline support for
Wadi Auto (and, implicitly, every similarly-situated tenant). This
immediately runs into:

- **`WorkOrderLifecycleService` as the sole writer of `WorkOrder.status`**
  (a rule `CLAUDE.md` calls load-bearing) assumes every status
  transition goes through one service, synchronously, with gate checks
  evaluated against **current** server-side state. An offline client
  that queues "complete this task" locally and replays it later has, by
  definition, made that decision **without** the gate checks that were
  supposed to run before the transition was allowed — what if, between
  the offline decision and the eventual replay, a gate condition
  changed (a required inspection was retroactively found incomplete,
  a capability was disabled)? Does the replay simply fail, silently,
  hours after the technician believed the job was done?
- **Money correctness** (`Decimal` in DB, `string` across the API, the
  dedicated linter) assumes every money-affecting write happens once,
  server-side, validated. An offline-queued payment or invoice-line
  action, replayed later, needs the exact same idempotency discipline
  this project already built carefully for payment retries (the
  documented "same key, different amount = 409" rule) — except now the
  **queueing and replay mechanism itself** is new, untested surface
  area sitting directly on top of the money-correctness guarantees the
  project has otherwise been extremely disciplined about.
- **The reachability guarantee** (every capability change preserves a
  path to a terminal state for every reachable state) was proven,
  presumably, against a model where state transitions happen in the
  order they're requested. An offline queue that replays several
  actions out of their real-world order (network resumed and flushed
  the queue in a different sequence than the actions actually happened,
  if the client's local queue doesn't itself preserve strict causal
  ordering across a hand-off between two technicians, recalling
  Scenario 32) could produce a transition sequence the reachability
  proof never considered, because it assumed requests arrive in the
  order they're made.

### The core mistakes

**34.1 — Building genuine offline support is not additive to the
existing architecture — it requires re-examining whether
`WorkOrderLifecycleService`'s gate-checking guarantee, money
idempotency, and the capability model's reachability proof all still
hold when actions are decided offline and replayed later, potentially
out of order, potentially against since-changed server state — none of
which the current, careful design of any of those three systems was
built to accommodate, because none of them anticipated a client that
could act without first confirming with the server.**

**34.2 — This is the single largest architectural question either
scenario set has surfaced (arguably larger than Workshop 4's data-scale
concern, because it isn't a capacity question, it's a **correctness**
question) — and it was invisible until a tenant whose entire operating
reality is intermittent connectivity forced it into view; every other
scenario workshop in both sets, however varied in size or complexity,
shared the one unstated assumption that made this question never come
up: a live connection.**

**34.3 — There is no described position anywhere in `docs/PHASE_MAP.md`
or any phase document on whether offline support is even an intended
future capability — it is simply absent from the roadmap, which is a
defensible choice if deliberate (many successful SaaS products
reasonably require connectivity) but has never actually been decided
and stated as a choice, which matters because Wadi Auto is not a
hypothetical edge case for a platform explicitly aimed at markets
(Egypt, and per Workshop 2, the wider region) where connectivity
quality varies enormously by geography.**

---

## SCENARIO 35 — The owner's monthly data cost becomes a real barrier to
using the product at all, and nothing about MOP's own design considers
bandwidth as a cost the workshop bears

**Zooming out from correctness to a much more mundane, and in this
market, very real constraint: mobile data is not free, and Wadi Auto's
owner is now paying, out of pocket, for MOP's own inefficiency.**

### What happens

The owner notices his mobile data usage has climbed sharply since
adopting MOP. Every page load, every debounced search keystroke (the
Stock, Catalog, and Workshops list pages all use a 200–400ms debounced
live-search pattern, real and well-built for a fast connection, but
each keystroke-triggered request is a full round trip on a 3G
connection genuinely metered by the megabyte), every polling or
re-fetch pattern anywhere in the client, consumes data he is paying for
directly, on a connection where megabytes are not abstract.

Nothing in the product's design — the debounce timings, the payload
shapes, whether responses are gzip-compressed, whether the client caches
anything at all between navigations, whether images (a workshop logo,
eventually, or a customer's uploaded damage photo if that feature ever
exists) are compressed or resized before upload — was ever evaluated
against a "the person paying for this connection is not the platform,
it's a technician on a mobile plan" constraint, because every scenario
workshop in either set that has interacted with the product's actual UI
was, implicitly, assumed to be on an unmetered, fast connection.

### The core mistakes

**35.1 — No page, request pattern, or payload in the product has ever
been evaluated for bandwidth cost, only for latency/UX responsiveness —
these are related but different concerns, and a debounce tuned for
"feels snappy" is not the same as a debounce tuned for "costs the
fewest possible requests on a metered connection," and nothing in the
design process for any built page (including this project's own very
recent work on the Stock, Catalog, and Workshops pages) considered the
second dimension at all.**

**35.2 — There is no client-side caching strategy described anywhere —
every navigation between pages appears to re-fetch fully, which is
simple and correct and was never wrong for the tenants that motivated
it, but represents a real, recurring, out-of-pocket cost for a tenant
like Wadi Auto that a platform aiming at this market segment should, at
minimum, have measured once.**

**35.3 — This closes Workshop 7's arc with the least dramatic but
arguably most quietly consequential finding of the five: correctness
gaps (31, 33, 34) and identity gaps (32) are the kind of thing that
eventually gets escalated and fixed once they cause a visible incident.
A slowly, invisibly rising data bill is the kind of gap that never
generates a bug report — it just makes the product feel expensive and
unreliable, and the owner quietly goes back to a paper book, or a
competitor, without ever filing a ticket that would tell anyone why.**

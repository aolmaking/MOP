# Phase 5 — Branch Manager

> **Goal:** the first real role interface, built from the user's day rather than from a feature list.
> **Why it matters beyond itself:** this phase sets the visual and structural precedent every later role inherits. A layout decision made here without a reason gets copied five more times.
> **Companion:** [`DESIGN_LANGUAGE.md`](../DESIGN_LANGUAGE.md) for why each visual value is what it is; [`UX_PRINCIPLES.md`](../UX_PRINCIPLES.md) for behaviour.

---

## 1. The person, before the pages

It is 8:10am. Cars are arriving. The phone is ringing. There are twenty-two open jobs. A technician is standing in the doorway waiting to say something.

**The branch manager does not do the work.** Technicians repair, inventory holds stock, the owner sets prices. Their actual job is narrower and harder to see:

> **Nothing should be stuck, and no customer should be surprised.**

That single sentence decides the entire interface. They are not browsing work orders — they are hunting for problems. Every screen is judged by one question: *does this help me find what is stuck faster than walking onto the shop floor and asking?*

Three facts about how they work, which the design must accommodate:

1. **They are interrupted constantly.** Every return to the screen is a cold start. Re-orientation must take under two seconds, which means the top of the screen must always answer "what needs me" without scrolling, filtering or remembering where they were.
2. **They work in short bursts.** Long forms are abandoned mid-way. Anything multi-step must survive being left and returned to.
3. **They are accountable for delay, not for repair.** So the interface should surface *time* prominently — how long has this been waiting — because that is the number their day is judged on.

---

## 2. The organising decision: an action queue, not a dashboard

The canonical spec describes the Branch Home as a set of count cards — Waiting Customer Decisions, Waiting Parts, Blockers, and so on.

**Counts alone are the wrong top-of-page.** "14 waiting parts" is not actionable. What the manager needs is *which three have a customer who has been waiting since Monday*. A count tells them a problem exists; it does not tell them which one to open, and finding out costs a click, a scan and a decision.

So the page is ordered:

| Band | What it is | Why it is here |
|---|---|---|
| **1. Needs you now** | Actual items, ranked, with the reason and the wait time on each | Answers the cold-start question without a click. This is the page's reason to exist |
| **2. Today's flow** | A compact strip: arrived · in progress · ready · delivered | Orientation, not action. Tells them whether today is normal or not |
| **3. Watch list** | The count tiles from the spec, as entry points into filtered lists | Scale and browsing, for when they are *not* reacting |

The counts are kept — they are genuinely useful, and the spec is right that the manager wants them. They are simply not the first thing, because they are not the first question.

### Ranking: cost of delay, not recency

Newest-first is the wrong default. A blocker raised an hour ago can matter less than an approval a customer has ignored for three days.

Ranking is a **score**, not a fixed list, because a fixed list gets one case wrong every time:

| Tier | Item | Reasoning |
|---|---|---|
| 1 | Critical safety rejection unacknowledged | Liability is unbounded and does not decay. Nothing outranks it |
| 2 | Technician blocked | Someone paid is idle *right now*. The cost is immediate and certain |
| 3 | Customer waiting on approval | Risk of losing the customer, and the bay is occupied. Scales sharply with age |
| 4 | Ready for delivery, unpaid | Money uncollected and a bay held by a finished car |
| 5 | Waiting on parts | Real, but the wait is usually outside the manager's control |
| 6 | Rework / QC failed | Needs attention, rarely urgent within the hour |

**Age escalates tiers.** A customer waiting over 24 hours moves above a blocked technician, because at that point the risk is losing them entirely rather than losing an hour. Age is shown on every row — the manager should be able to argue with our ranking, which means seeing what it was based on.

---

## 3. The pages, and why each exists

| Page | The question it answers | Why it is separate |
|---|---|---|
| **Attention Center** *(home)* | "What needs me?" | The cold-start page. Everything else is reachable from here |
| **Customer Intake** | "A car just arrived" | A focused task with a clear start and end. Mixing it into a list page would make the most time-pressured moment of the day compete for space |
| **Work Orders** | "Show me everything, grouped" | Browsing, not reacting. Used when looking for a specific car or reviewing the shape of the day |
| **Work Order Workspace** | "Tell me everything about this one car" | The deep view. Reached from anywhere; the destination of nearly every click |
| **Approvals & Decisions** | "Who do I need to chase?" | A queue with one repeated action. Deserves its own surface because chasing is a batch activity, done in one sitting |
| **Delivery & Payments** | "What is leaving today, and can it?" | Time-boxed and gate-driven. The one screen where "why can't this go" must be answered precisely |

**Six pages, no more.** Every additional page is another place the manager has to remember to look. The spec's "Team Setup" appears only when the owner delegates it — an optional seventh, hidden when it does not apply, because a permanently visible page that is usually empty trains people to ignore navigation.

---

## 4. Layout decisions, with reasons

**Where "what needs me" sits.** Top-left of the content area, above the fold, with no filter or tab in front of it. In left-to-right reading it is the first thing the eye lands on; under `dir="rtl"` the logical properties put it top-right, which is the same first position for an Arabic reader.

**Why time is a column, not a tooltip.** The manager is accountable for delay. A wait time hidden behind a hover is invisible on a tablet and invisible while scanning. It is text, always.

**Why each row states its reason.** "Waiting for customer approval since Monday" rather than a status badge. A badge requires the reader to remember what it maps to; a sentence does not. Badges are for repetition *within* a known list, not for the primary explanation.

**Why the primary action is on the row.** "Send reminder" sits on the item, not behind opening it. The most common response to a stuck job is a single nudge, and making the manager open a page to send it turns a five-second action into thirty.

**Why nothing here is red by default.** Under §1 of the design language, most rows are neutral even in the attention queue — that is the point of a *ranked* queue. Red is reserved for tier 1. If the whole queue were red, the ranking would be invisible.

---

## 5. Tasks

> **Status (2026-08-09):** 5.A, 5.B, 5.0, 5.C, 5.D and 5.E done. 5.F–5.G open.
>
> Note on CI (Phase 1.3): the repository is private, so the GitHub API returns 404 without credentials and I cannot read the workflow result. It stays open until someone with access reports it.


- **5.A** ✅ Attention queue API — ranking applied to real data, tenant- and branch-scoped
- **5.B** ✅ Attention Center page — routed at /branch/attention, six states
- **5.0** ✅ **Design language redo** *(inserted mid-phase — see below)*
- **5.C** ✅ Customer Intake — search-first, interruptible
- **5.D** ✅ Work Orders board and Work Order Workspace
- **5.E** ✅ Approvals & Decisions, Delivery & Payments
- **5.F** Super Admin capability UI *(deferred from Phase 3)*
- **5.G** Cross-role scenario walkthrough

### 5.0 — why a task was inserted after 5.B

The product owner reviewed 5.B and rejected the visual language outright: *"the typical basic AI design and colours… totally unacceptable UI."*

They were right, and the cause was structural rather than cosmetic. `DESIGN_LANGUAGE.md` justified every value in isolation and never decided a **character**. Locally defensible choices with no governing character converge on the statistical default of generated UI — dark navy ground, blue accent, rounded cards, Inter — which is exactly what shipped. Worse, IBM Plex was declared in the font stack but never installed, so the app had been rendering in Segoe UI the whole time.

**It was inserted before 5.C rather than scheduled after 5.G** because five more pages built on a rejected language means five more rewrites. This is the same waterfall argument the project is built on: the structure laid down now is inherited by everything after it.

What changed: character derived from the workshop job card, red/black/white on 60-30-10 with one governing rule for the red, light as the ground with a true-black opt-in dark, IBM Plex self-hosted with tabular figures, radius cut to 2–4px, and per-page composition made explicit (`DESIGN_LANGUAGE.md` §0.5, §1, §3, §6, §7.5).

**The constraint 5.C–5.G inherit:** each page's structure is researched against how that kind of page is solved outside MOP, and argued here. There is no house layout.

---

### 5.C — Customer Intake: why it is not a wizard

**References consulted.** Multi-step form research, and service-drive workflow writing.

The [multi-step form literature](https://www.numinam.com/en/blog/multi-step-vs-single-page-forms-which-really-generates-more-leads-complete-guide-2026) reports large gains for forms over ~7 fields, and intake is over 7 fields. **It is rejected anyway**, because that research measures *strangers converting on a marketing form* — people who abandon because a long form looks like work. Our user is a trained employee doing this twenty times a day with a customer standing in front of them. For a repeat expert, a wizard that hides fields behind steps is strictly slower: they already know every field, and each step boundary is a click that buys nothing.

Two findings do transfer:

- **Save on every transition, and never lose entered data.** Without it, abandonment between steps rises 18%. Applied here as draft persistence, not as step navigation.
- **The counter fragments before the bays do** — advisors are [pulled from ringing phones to walk-ins by 10 a.m.](https://workflowotg.com/the-second-showroom-rethinking-workflow-in-the-service-drive/) This is the interruptibility requirement, confirmed from the domain rather than assumed.

#### The structure, and what decides it

**Intake is a conversation, not a form.** Information arrives in the order the customer says it, and a rigid wizard demanding customer details before vehicle details fights that. Worse, it optimises for the rare case: **most intakes are returning customers with a vehicle already on file.**

So the page is one surface that starts as a single field and expands to exactly what is missing:

| Band | Shows | Why |
|---|---|---|
| **1. Identify** | One search field — phone or plate | The fast path for the common case. A returning customer is three actions: search, pick, describe |
| **2. Vehicle** | Their vehicles as choices, plus "another vehicle" | Appears only once a customer is known. A customer with one car should not be asked to fill in a vehicle form |
| **3. What's wrong** | Complaint, and the **declines inspection** choice | `SCENARIOS.md` 1.2 — recorded at intake because the Finish Gate must not later block a job for a step the customer refused |
| **4. Confirm** | Everything entered, and one primary action | The advisor reads it back to the customer. That is a real thing that happens at a counter |

Progress is stated as **what is still missing**, never "step 2 of 4" — a step count measures the form's structure, and what the advisor needs to know is whether they can finish.

New customer and new vehicle are the *expanded* state of bands 1 and 2, not separate screens. Nothing is ever hidden behind a step boundary.

#### Interruptibility

The draft is written on every change and restored on return, with an explicit discard. It is **device-local**, which is honest for an advisor returning to the same counter terminal and is a stated limitation, not an oversight: a draft that follows a person across devices needs server-side storage and is deferred until there is a reason to pay for it.

A restored draft always announces itself. A stale draft that silently reappears and gets submitted against the wrong customer is worse than one that was lost.

#### The refusal that must stay visible (5.C)

Intake refuses to move a vehicle between owners without explicit confirmation (`intake.service.ts` — quietly reassigning would hand one customer another's service history). The page surfaces that as a decision with both names shown, never as a generic error, because the advisor is the only person who can tell whether it is a genuine sale or a typo in the plate.

---

### 5.D — Work Orders: why the board is a rack, not a kanban

**Reference consulted.** Kanban board practice, which is clear that [columns must match the actual work process](https://kanbantool.com/support/kanban-board) and that states can be grouped rather than given one column each.

#### Why not a kanban

The obvious build is a drag-and-drop board. It is rejected for a reason specific to this product:

> **`WorkOrderLifecycleService` is the only writer of `WorkOrder.status`, and every transition is gated.**

A draggable card promises the manager they can move a job. Most of the time they cannot — the gate is unsatisfied, or the capability profile removed that edge entirely. An interface that offers a gesture the domain forbids teaches people the software is broken, and it would quietly make the capability engine look like decoration. The board therefore shows state and never pretends to set it.

Two smaller reasons: sixteen columns is a spreadsheet turned sideways, and a card narrow enough to fit sixteen columns holds far less than a full-width row.

#### Lanes are holders, not stages

Grouping by status answers a question nobody asks. What a manager asks twenty times a day is **whose move is it?** — because a job costs something different depending on who is sitting on it. A car waiting on us is our failure; a car waiting on the customer is a phone call; a car waiting on a part is a supplier problem. Three different days.

| Lane | Holder | States |
|---|---|---|
| Not started | Booked in, nobody has touched it | `DRAFT`, `REGISTERED` |
| With us | Ours to move | inspection → in progress → review → QC |
| Waiting on the customer | Needs a phone call | `AWAITING_CUSTOMER_APPROVAL`, `WAITING_CUSTOMER` |
| Waiting on parts or a blocker | Somebody paid is idle | `WAITING_PARTS`, `BLOCKED` |
| Ready to leave | Money, then the keys | `READY_FOR_DELIVERY`, `PAYMENT_PENDING` |
| Finished | Nothing to do | terminal — excluded by default |

This is the same idea the attention queue ranks by, so the two pages cannot disagree about what matters. The mapping lives in `@mop/shared` for that reason, and a test asserts **every graph state maps to exactly one lane** — a state with no lane would be a job that exists in the yard and appears on no screen, which is the exact failure this product exists to prevent. When it happens anyway, the board says so in red rather than dropping the row.

#### The Workspace order

What is this → whose move is it → what is holding it up → what happened.

**Blockers sit above the task list** because a blocked job is usually why the page was opened. **An unacknowledged critical rejection sits above everything**, pulled out of the decision list entirely: it is a liability rather than a delay, and unlike every other row on the page it does not improve by waiting.

The plate is the largest element on the screen. In the half-second after clicking, the manager's only question is whether they opened the car they meant to.

Detail is assembled in one server call rather than six. The workspace is the destination of nearly every click, and six round trips is six chances to render half a car.

---

### 5.E — Approvals, and Delivery & Payments

#### Approvals: the split is the design

One list would be wrong. A decision request that was **sent** is the customer's delay; one that was **drafted and never sent** is ours. They are the same row in the database and they call for opposite actions — chase them, versus send it.

Unsent is listed **first**, even though it is usually the shorter list, because our own delay is cheaper to fix than any amount of chasing.

The customer's phone number is on the row. Dialling is the action this page exists for, and making the manager open a job to read a number turns a ten-second call into a minute.

Ordering is oldest-first and never re-sorts, because the list is worked top to bottom in one sitting.

Two edges compete on a row: **safety beats age.** A request containing a critical item is red regardless of how long it has waited; an ordinary one turns amber past 24 hours.

#### Delivery: held first, and never re-derived

Held is listed **before** ready, inverting the usual instinct. "Ready" needs no attention — the manager already knows those can go. The entire value of the page is the other list.

**Nothing on this page decides for itself what "ready" means.** Readiness is obtained by actually running the delivery gates through `WorkOrderLifecycleService.previewGates` — the same code that will refuse the transition when someone presses the button. A page that re-implemented the check would eventually disagree with the engine, and the failure mode is telling a manager a car can leave when it cannot, with the customer already standing at the counter.

**One bug found while building this, worth recording.** The first version asked the gate evaluator about every candidate. For a job in `PAYMENT_PENDING` there is no `DELIVER` edge at all, so the evaluator correctly returned *no gates* — which is indistinguishable from *nothing is blocking it*. The page would have cleared a car nobody had paid for. Reachability is now checked first: the question "is `DELIVER` even available from here?" is separate from "do its gates pass?", and conflating them is what made it wrong.

Every reason is shown, not just the first. A manager who clears one blocker and finds another behind it stops trusting the page. Reasons come from the gate registry's own `blockedMessage`, so they read as sentences — `invoice.issued` tells a manager nothing they can act on.

## Exit criteria

1. The attention queue ranks by cost of delay, with age escalation, computed server-side — so two pages can never disagree about what is most urgent.
2. Every page renders correctly under `dir="rtl"` with identifiers still reading correctly.
3. Every list has all six states from `UX_PRINCIPLES.md` §4, including empty *and* no-results as distinct screens.
4. No page shows a count without a way to reach the underlying items.
5. Restricted data is absent from the response, not hidden client-side.
6. Everything green: tests, typecheck, both lint rules, build.

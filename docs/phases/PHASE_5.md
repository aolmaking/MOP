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

> **Status (2026-08-09):** 5.A, 5.B and 5.0 done. 5.C–5.G open.
>
> Note on CI (Phase 1.3): the repository is private, so the GitHub API returns 404 without credentials and I cannot read the workflow result. It stays open until someone with access reports it.


- **5.A** ✅ Attention queue API — ranking applied to real data, tenant- and branch-scoped
- **5.B** ✅ Attention Center page — routed at /branch/attention, six states
- **5.0** ✅ **Design language redo** *(inserted mid-phase — see below)*
- **5.C** Customer Intake wizard (interruptible; survives being left mid-way)
- **5.D** Work Orders board and Work Order Workspace
- **5.E** Approvals & Decisions, Delivery & Payments
- **5.F** Super Admin capability UI *(deferred from Phase 3)*
- **5.G** Cross-role scenario walkthrough

### 5.0 — why a task was inserted after 5.B

The product owner reviewed 5.B and rejected the visual language outright: *"the typical basic AI design and colours… totally unacceptable UI."*

They were right, and the cause was structural rather than cosmetic. `DESIGN_LANGUAGE.md` justified every value in isolation and never decided a **character**. Locally defensible choices with no governing character converge on the statistical default of generated UI — dark navy ground, blue accent, rounded cards, Inter — which is exactly what shipped. Worse, IBM Plex was declared in the font stack but never installed, so the app had been rendering in Segoe UI the whole time.

**It was inserted before 5.C rather than scheduled after 5.G** because five more pages built on a rejected language means five more rewrites. This is the same waterfall argument the project is built on: the structure laid down now is inherited by everything after it.

What changed: character derived from the workshop job card, red/black/white on 60-30-10 with one governing rule for the red, light as the ground with a true-black opt-in dark, IBM Plex self-hosted with tabular figures, radius cut to 2–4px, and per-page composition made explicit (`DESIGN_LANGUAGE.md` §0.5, §1, §3, §6, §7.5).

**The constraint 5.C–5.G inherit:** each page's structure is researched against how that kind of page is solved outside MOP, and argued here. There is no house layout.

## Exit criteria

1. The attention queue ranks by cost of delay, with age escalation, computed server-side — so two pages can never disagree about what is most urgent.
2. Every page renders correctly under `dir="rtl"` with identifiers still reading correctly.
3. Every list has all six states from `UX_PRINCIPLES.md` §4, including empty *and* no-results as distinct screens.
4. No page shows a count without a way to reach the underlying items.
5. Restricted data is absent from the response, not hidden client-side.
6. Everything green: tests, typecheck, both lint rules, build.

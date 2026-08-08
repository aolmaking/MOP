# MOP — Vision and Mental Model

> **Purpose:** what MOP actually is, what makes it hard, and what "done" means. This is the document to read before designing any page or table. `PRODUCT_SPEC_CANONICAL.md` says *what the product does*; this says *what kind of thing we are building and where it will break*.
> **Date:** 2026-08-08.

---

## 1. What MOP is, in one sentence

**A single repair is a distributed transaction across five roles, and MOP's job is to make sure that transaction never silently lies to anyone.**

Everything else follows from that sentence, so it is worth unpacking.

A customer brings in a car. Over the next two days a receptionist, a technician, an inventory manager, a team leader, and a branch manager each act on it, at different times, from different devices, seeing different subsets of the truth. The customer watches from outside through a keyhole. At the end, money changes hands based on what everyone believes happened.

MOP is the shared ledger of what happened. If the technician's screen says "part used" and the stock ledger says "part still in the warehouse" and the invoice says "part not billed" — MOP has failed, even though every individual page rendered without an error.

This is why the original brief insisted the system "must not be a set of disconnected pages." That is not a style preference. It is the entire engineering problem.

## 1a. MOP is five systems on one spine

MOP is not one application with many pages. It is **five full systems running simultaneously** — Operations, Inventory, Finance, People & Performance, and Governance & Control — each of which could plausibly be sold on its own, sharing one operational spine and one event bus.

That is the source of most of the difficulty. A single part going into a single car is simultaneously an Operations state change, an Inventory movement, a Finance line, a People performance data point, and a Governance audit entry. Five systems must agree about one physical event, in one transaction, or the product lies.

Boundaries, ownership, and the contracts between them are in [`SYSTEMS.md`](./SYSTEMS.md).

## 2. MOP is three products wearing one codebase

It helps to see this explicitly, because each has a different customer, a different risk, and a different definition of quality.

**A platform product.** Sold to workshop owners. Its user is the Platform Super Admin. Its job is provisioning, control, oversight, and — bluntly — the ability to switch a paying customer off. Its risk is *blast radius*: one wrong control change affects every user in a workshop at once. Its quality bar is that no destructive action is possible without knowing, in advance and precisely, who it will affect.

**A workshop product.** Sold *by* the platform, used by staff all day. Its users are technicians with dirty hands, a receptionist under pressure at 8am, an inventory manager reconciling a shelf. Its risk is *friction* — if it is slower than a paper notebook and a WhatsApp group, it will lose to a paper notebook and a WhatsApp group. Its quality bar is that the fastest path through the software is also the correct one.

**A trust product.** Used by the customer, who did not choose MOP and does not care about it. Its risk is *leakage and confusion* — showing internal costs, another owner's history, staff notes, or a status the customer can't act on. Its quality bar is that the customer always knows two things: what is happening to their vehicle, and whether it is their turn to do something.

These three pull in opposite directions. Platform wants control and auditability. Workshop wants speed. Customer wants simplicity and honesty. Most design arguments in this project are really one of these three pulling against another, and naming which one usually resolves it.

## 3. The five ideas that define the architecture

### 3.1 Isolation
Many workshops, one codebase, zero leakage. A user in Workshop A must not be able to see, infer, or affect anything in Workshop B — not through a URL, not through a report aggregate, not through a search box, not through an error message, not through a realtime channel.

Isolation is not a feature; it is a property that must hold across every path, including ones added later by someone in a hurry. So it has to be *structurally* enforced, not remembered.

### 3.2 Configurability without forking
Two workshops run the same code and behave differently — different theme, different optional page sections, different workflow policy (QC on/off, approval required or not, delivery blocked until paid or not), different forms, different prices.

The trap here is enormous and v11.9 fell into it: configurability quietly becomes a second, worse programming language, with no type system, no tests, and no way to reason about what a given tenant's configuration actually does. The discipline is that **configuration selects among behaviours the code already knows how to do**, and never describes new behaviour.

Per the 2026-08-07 amendment, this configuration is controlled by Platform Super Admin per workshop, not self-service by the Owner.

### 3.2a Capability shaping — one product, many shapes

A one-man oil-change shop and a twelve-branch dealership network run the same code. The small shop has no inventory, no team leader, no second branch, and no QC step — and its work orders, finish gate, invoices and customer approvals must still work perfectly.

So Platform Super Admin does not merely *hide* what a workshop doesn't need; it **removes it coherently**. Removing Team Review must reroute the finish transition. Removing Inventory must drop the "parts used or returned" gate check, or every job in that workshop strands forever at a Finish Gate waiting for a part lifecycle that can no longer complete.

**Disabling a capability is not subtraction. It is rewiring.** The formal guarantee: after any capability change, every reachable non-terminal state must still have a path to a terminal state — checked at validate time, so a configuration that could strand a work order is rejected before it is applied rather than discovered in production.

Full design in [`CAPABILITY_MODEL.md`](./CAPABILITY_MODEL.md).

### 3.3 Truth propagation
One physical event produces one domain event, which produces many consistent projections.

When a technician marks a part used, that single act must change: the task, the Work Order lifecycle, the stock ledger, the warehouse balance, the running invoice, the customer's sanitized timeline, the team leader's view, the branch attention center, the reports, and the audit trail. Not "eventually, if someone refreshes." Consistently, from one write path.

This is what `OperationEventsService` exists for. Its value is not that it is a nice pattern; it is that it is the **only** place this fan-out happens, so it cannot be half-done by a module written in a hurry six months from now. The gap analysis found exactly one module that bypassed it, and that module immediately produced the failure the pattern exists to prevent.

### 3.4 Asymmetric visibility
The same fact is rendered differently, or not at all, depending on who is looking.

"Inventory Manager created a supplier order for unavailable brake pads" is, to the customer, "We are waiting for a required part." Not a shortened version — a *different statement*, produced deliberately by a translation layer.

The critical insight: **this is a security boundary, not a presentation concern.** The customer's API response must not contain the internal text at all. If it is in the payload and hidden by CSS, it has already leaked.

## 4. The six hard problems

These are the parts I expect to be difficult, and where I will spend disproportionate care.

**1. The permission resolver sits on every single path.** Eleven conceptual layers, evaluated for every action, for every role, for every tenant. It must be correct (a wrong `allow` is a breach, a wrong `deny` is an outage) and it must be fast (it runs constantly). Those two goals fight. Today the resolver is correct — a real ordered array that is actually iterated, deny-by-default, with a `locked` short-circuit so no lower layer can override a higher one. It is not yet fast: **five of the eight layers issue their own database query per permission check, with no caching.** A page checking ten permissions costs fifty round-trips. That is the tension in miniature, and §9 of `DATABASE_STRATEGY.md` is how I intend to resolve it without weakening the model.

**2. Money has a moment where it must become immutable, and not one moment earlier.** A quoted price is fluid. An approved price is frozen. A running invoice is live. An issued invoice is permanent, and after that the only honest way to change anything is a credit note. Getting these transitions wrong in either direction is severe: too loose and prices can be retroactively altered under a customer who already agreed; too tight and normal daily corrections become impossible and staff start working around the system.

**3. Stock is a claim about the physical world, and the two drift.** The database says four brake pads are on the shelf. Someone took one without recording it. Every inventory system faces this; the ones that survive are the ones that make reconciliation a normal, cheap, blameless action rather than an admission of failure. This is also why the spec's rule — stock only increases when the Inventory Manager *accepts* a return — matters: it puts a human at the point where the physical and digital worlds must agree.

**4. The customer boundary is the highest-consequence surface.** Everyone else is an employee, subject to policy and a contract. The customer is an outsider with a link. Public decision links, portal accounts, ownership transfers where a new owner must see technical history but never the previous owner's financials — every one of these is a place where a mistake is a real-world privacy incident, not a bug report.

**5. Real-time is promised and does not exist.** The brief is explicit that progress appears "on a timeline that occurs and updates in real time on the technician, team leader and customer pages." There is currently **no realtime mechanism in the codebase at all** — no WebSocket, no SSE, no polling. This is a genuine architectural gap, not a missing widget, and it interacts with isolation (a realtime channel is one more thing that can leak across tenants). Addressed in `INFRASTRUCTURE.md` §7.

**5a. Capability shaping is a correctness problem wearing a configuration costume.** It looks like settings. It is actually a proof obligation: no reachable configuration may strand a work order, orphan a user with no pages, or leave a gate that can never clear. And because the workflow-routing logic does not exist yet, this must be built into the lifecycle from its first line — retrofitting it after five roles depend on hardcoded transitions is the expensive version.

**5b. It will travel.** Arabic and RTL from the first component, not a later pass. Tax as a pluggable policy rather than a field. And government e-invoicing mandates (Egypt's ETA, Saudi ZATCA) mean invoice generation must be a per-country adapter behind a stable interface — in those markets an invoice that has not been cleared by the state portal is not a valid invoice. That is a Finance architecture constraint, decided before Finance is built.

**6. Scale is multi-dimensional.** Not just "more rows" — more tenants, more branches per tenant, more warehouses, more categories, more roles, more features toggled on and off. A design that assumes one branch, or assumes a page can load "all" of anything, breaks silently as a workshop grows. The rule: **a list must look identical whether it holds 1 row or 100,000** — scale shows up in pagination, never in layout.

## 5. What "done" means

The acceptance flow in the canonical spec (Super Admin creates workshop → … → customer sees final invoice → reports update → audit exists) is necessary but **not sufficient**. A demo can pass it.

Done means all of the following:

1. The full flow works end-to-end on real, non-stub code.
2. It works **a second time, on a second tenant, with different configuration** — different workflow policy, different theme, different permissions — without code changes.
3. Neither tenant can see or affect the other, verified by a test that actively tries.
4. Every step is visible from the right roles, and invisible from the wrong ones, verified at the API response level rather than the UI.
5. Every scenario in `SCENARIOS.md` — including the awkward ones: customer refuses inspection, brings their own part, rejects a critical repair and drives away — has a defined path and a defined terminal state.
6. Freezing a tenant mid-flow blocks everyone immediately and loses no data.
7. The audit trail is sufficient to reconstruct what happened and who decided it.

## 6. Failure modes I am actively guarding against

These are not hypothetical. Each is a real, documented failure of v11.9, recorded in `GAP_ANALYSIS_CANONICAL_SPEC.md`, and each has a specific countermeasure.

| Failure mode | What it looked like | Countermeasure |
|---|---|---|
| **Decorative abstraction** | A named 10-stage permission hierarchy array that nothing ever iterated, while a different ad-hoc resolver did the real work | The resolver is a literal array that *is* iterated; tests assert layer ordering and short-circuit behaviour |
| **Write-only configuration** | Owner published Builder changes successfully; runtime read a different table that was written once at provisioning and never again | One configuration row, one reader, one writer. A config change must be provable by a behavioural test, not a success toast |
| **Dead centralised service** | A "centralised audit service" nothing imported, while ten modules hand-rolled inconsistent audit writers | `tools/lint-audit-boundary.mjs` — the build **fails** if any `AuditLog` write happens outside the audit module. Structural, not cultural |
| **Hiding as security** | Buttons hidden client-side while the endpoint stayed open | Restricted data is absent from the response; every action is guarded server-side. UI hiding is the last layer, never the only one |
| **Pages that work alone** | Each page rendered fine; the system as a whole was incoherent | Every phase closes with a cross-role scenario walkthrough, not a page checklist |
| **Fake completion** | Finish Gate checklist items hardcoded `true`; statuses defined but never set by any code path | No hardcoded `true` in a gate. A status nothing sets is a bug, and CI should eventually prove every enum value is reachable |
| **Silent partial creation** | — | Multi-record operations run in one transaction; either all of it happens or none of it |

The pattern across all of these: **v11.9 failed less at writing code than at telling the truth about the code.** Things looked done. The countermeasures above are mostly mechanisms that make lying structurally difficult — a linter that fails the build, a test that tries to breach isolation, a gate that cannot be stubbed.

## 7. How I intend to work

- **Scenarios before pages.** A page is a projection of scenarios onto a screen. Designing the screen first is how you get a beautiful page that cannot express what actually happens on a Tuesday.
- **Server owns truth; the client renders it.** Lifecycle stage, next action, finish readiness, blocking reasons — all computed server-side. Two pages must never independently compute the same answer, because eventually they will disagree.
- **Make the wrong thing hard, not forbidden by convention.** A comment saying "always scope by tenant" is worth nothing at 2am in month nine. A repository layer that cannot express an unscoped query is worth everything.
- **Honest state over impressive state.** If something is a stub, it says so in the code, and it does not report success. The single most damaging thing in v11.9 was code that claimed to work.
- **Cheap now, expensive later — decide now.** RTL/Arabic, the customer-supplied part, tenant isolation depth, the realtime transport. Each of these is days of work today and months after four phases are built on top.

---

**Related:** [`REBUILD_PLAN.md`](./REBUILD_PLAN.md) · [`DATABASE_STRATEGY.md`](./DATABASE_STRATEGY.md) · [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) · [`UX_PRINCIPLES.md`](./UX_PRINCIPLES.md)

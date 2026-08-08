# UI/UX Principles — Measures and Precautions

> **Scope:** the rules every MOP screen obeys, and the decisions that are cheap now and ruinous later.
> **Status of each item:** `DONE` = in the code today · `PARTIAL` = exists but incomplete · `TODO` = decided, not yet built.
> **Date:** 2026-08-08.

---

## 1. The governing rule

**Every screen answers "what do I do next?" before it answers "what is everything?"**

This is the difference between software that gets used and software that gets worked around. A technician standing next to a car does not want a dashboard; they want to know whether they can start, and if not, who they are waiting for. A branch manager at 8am does not want a list of 40 work orders; they want the six that are stuck.

Concretely, this means every role's landing page leads with a **next action in plain language** — "Waiting on customer approval for brake pads", not a status badge reading `AWAITING_CUSTOMER_APPROVAL` that the reader has to decode.

The stated complaint about v11.9 was that pages "don't have a good arrangement of the elements depending on the priority." §3 is the systematic answer.

## 2. Role-shaped surfaces, not one app with things hidden

Each role gets an interface designed for its job, not a common shell with irrelevant parts removed.

The technician case makes this concrete and is already specified: exactly three pages, **no admin sidebar at all** — and structurally so. The shell that renders navigation for every other role does not render for technician routes. It is not a matter of the technician's pages happening not to link anywhere.

**Precaution.** When two roles seem to need "the same page with different columns," that is nearly always two different pages that happen to read the same table. v11.9 built one generic work-order list shared by Owner, Team Leader, and Customer — and it leaked financial totals to Team Leader, because the redaction check only tested for customers. A shared component with role flags will eventually be wrong for one role, and nobody will notice which.

## 3. Priority ordering — the explicit hierarchy

Every page places elements in this order, top to bottom, and this is a rule rather than a suggestion:

1. **Blocking** — something is wrong or stuck and this person can fix it
2. **Next action** — what this person should do now
3. **Working area** — the actual task
4. **Reference** — history, details, context, everything else

And attention lists (Branch Attention Center, Inventory Home, Team Leader Home) order by **cost of delay**, not recency:

- A customer waiting three days on an approval outranks a part that arrived five minutes ago.
- A critical safety rejection outranks everything.
- A blocked technician outranks a completed job.
- "Nothing needs you" is a **valid and desirable state** and should be shown proudly, not padded with filler cards.

**Precaution.** Cost of delay is computed **server-side**, with the same rules everywhere. If each page sorts its own way, two roles will disagree about what is most urgent on the same work order.

## 4. Six states per surface, not one

Every list, panel, and card has six states, and v11.9's most common defect was building one of them:

| State | Rule |
|---|---|
| **Loading** | Skeletons matching final layout, so nothing jumps |
| **Empty** | Never used yet → explain what will appear here and how to create the first one |
| **No results** | Filtered to nothing → say which filter, offer to clear it. **Never the same screen as Empty** |
| **Error** | What failed, whether it is retryable, and a retry control. Never a raw stack or code |
| **No permission** | "You don't have access to this" — with who to ask |
| **Locked by platform** | Distinct from no-permission: the workshop's plan or the Super Admin disabled it. Different cause, different resolution, different message |

The last two being distinct matters: "ask your manager" and "your workshop's plan doesn't include this" send the user to completely different places.

## 5. Never leak by hiding

**A restricted field is absent from the API response — not present and hidden by CSS.**

This is the single most-repeated rule in `detailed-specs/`, because it is the one v11.9 got wrong most often. Internal cost, margin, supplier, staff notes, technician performance, another owner's history: these must never reach the browser of someone not entitled to them. Anyone can open developer tools.

Client-side hiding stays as the last layer of a defence in depth — never as the only one.

**The corollary, which is subtler.** When prices are hidden from a technician by workshop policy, the UI must say **"Price hidden by workshop settings"** — not show a blank, and not silently omit the row. A blank looks like a bug and generates support calls; an explicit message tells the technician the system is working as configured and that the number exists but isn't theirs.

## 6. Arabic and RTL — decide now, not later

**Nothing in the codebase currently supports internationalisation or right-to-left layout.** Zero. And this product is built for a market where Arabic is the primary working language.

Retrofitting RTL after six phases of UI is one of the most expensive mistakes available here, because it touches every component's stylesheet, every icon with direction, every layout assumption. Doing it from the first component costs almost nothing.

**Decisions to take now (`TODO`, before Phase 2's UI expands):**

- **CSS logical properties everywhere.** `margin-inline-start`, `padding-inline-end`, `border-inline-start` — never `left`/`right`. This alone handles most of RTL automatically, and costs nothing if the direction never flips.
- **`dir` set once on `<html>`**, driven by locale. No component ever hardcodes direction.
- **Directional icons mirror; non-directional icons must not.** A "next" arrow flips. A wrench does not. This needs to be a property of the icon component, decided once.
- **No text baked into components.** Every string goes through a translation layer from the first component, even while there is only one locale. Extracting strings later is mechanical but enormous, and it always gets skipped.
- **Bidirectional text is the real trap.** Plate numbers, VINs, SKUs, and invoice numbers are Latin/numeric strings embedded inside Arabic sentences. Without explicit isolation (`bdi`, or `unicode-bidi: isolate`), they render in visibly wrong order — and a plate number displayed backwards on a work order is a genuine operational error, not a cosmetic one.
- **Numerals, dates, and currency formatting** follow the locale, but the *stored* value never changes. Formatting is a rendering concern; `Tenant.currency` and `Tenant.timezone` already exist to drive it (`DONE`).

Even if the product ships English-first, building on these rules keeps Arabic a configuration change instead of a rewrite.

## 7. The technician interface is a field tool

Designed for someone standing beside a vehicle, possibly one-handed, possibly with gloves, often in bad light, on bad wifi.

- Touch targets ≥ 44px, single-column-first, thumb-reachable primary actions.
- **Scan first.** Plate or work-order QR jumps straight to the right work card. Typing a plate number on a phone while holding a torch is the interaction to design away.
- High contrast; dark theme as the default ground (`DONE` — `styles.css`), which also suits long shifts.
- **Never hide a destructive or irreversible action behind a swipe or long-press.** Discoverability beats elegance here.
- Every state change gives immediate, visible feedback — and if it is queued rather than confirmed, it says so (see `INFRASTRUCTURE.md` §11).

## 8. Perceived performance is a UX rule, not an engineering one

- **Scoped summary first, drill-down second.** No role page loads "all" of anything. This is also why the spec insists reports load aggregates before detail.
- Server-side pagination for anything that grows with tenants or time; client-side virtualisation only for long lists inside an already-open view. These are deliberately different mechanisms for different problems.
- Optimistic UI for cheap, reversible actions; explicit pending state for anything touching stock or money.
- A list must **look identical whether it holds 1 row or 100,000** — scale appears in pagination, never in layout.

## 9. Consistency contract

One component per concept, defined once, used everywhere:

- **Status pill** (`DONE`) — one component, one colour mapping, everywhere a status appears
- **Lifecycle strip** — computed server-side, identical on Home, My Work, and Work Card. If Home says "Parts" while Work Card says "In Progress" for the same job, the system has lost credibility for everything else it says
- **Attention card**, **impact preview**, **empty state**, **money display** — same treatment

**Design tokens only (`DONE`).** `styles.css` defines colour, type, spacing, radius, and motion as custom properties, with dark-default plus light via `prefers-color-scheme` and a `data-theme` override seam. The rule: **no component ever writes a colour literal.** That is what makes both themes stay correct automatically, and what will make per-tenant theming possible without touching components.

## 10. Accessibility, which is mostly just correctness

- **Colour is never the only signal.** This matters acutely here: fault severity, stock health, and work-order status are all colour-coded, and roughly 1 in 12 men has a colour vision deficiency — in a workshop, that is most of the staff. Every status pill carries text or an icon, never colour alone.
- Visible focus rings (`--focus-ring` exists) — back-office roles are keyboard-heavy and fast.
- Real semantics: buttons are `<button>`, forms are forms, errors are associated with their field and announced.
- Contrast verified in both themes, not assumed.

## 11. Destructive and governed actions

Anything irreversible or wide-reaching — freeze a workshop, issue a final invoice, publish a configuration, reject a critical repair — follows the same shape:

**State what will happen → show who it affects → require a reason → confirm → audit → offer rollback where possible.**

The impact preview must be **computed live at the moment the dialog opens**, never cached from an earlier look. "This will sign out 14 staff and 63 customers" is only useful if it is true right now.

For the customer, the equivalent is the critical-warning acknowledgement: rejecting a safety-critical repair requires an explicit, recorded acknowledgement — protecting the customer's right to decide *and* the workshop's record that the decision was informed.

## 12. Language and tone

- **Plain, specific, and about the user's situation.** "Waiting for the customer to approve brake pads" beats "Status: pending approval."
- **Customers see outcomes, never internals.** Not a shortened version of the internal message — a different sentence, produced by the customer-safe projection layer (`DONE`). "We are waiting for a required part", never "Inventory Manager created a supplier order."
- **Errors say what to do next.** "Couldn't save — you're offline. We'll retry automatically" beats "Network error."
- **Never blame the user**, and never expose an internal code as the primary message.

---

**Related:** [`VISION.md`](./VISION.md) · [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) · [`detailed-specs/`](./detailed-specs/README.md)

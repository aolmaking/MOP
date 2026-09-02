# MOP — Design System and UX Philosophy

> **Document ID:** DOC-27
> **Purpose:** why the interface looks and behaves the way it does, in terms a designer or an engineer can argue with.
> **Authority:** DESCRIPTIVE. [`../DESIGN_LANGUAGE.md`](../DESIGN_LANGUAGE.md) and [`../UX_PRINCIPLES.md`](../UX_PRINCIPLES.md) are the full records; this is the working summary.
> **Scope:** colour, elevation, radius, motion, density, states, RTL, tone.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 24 (frontend), 15 §12 (cross-cutting page rules), 12 (the gloved-hand case).

---

## 1. The governing rule

> **Every visual value is justified. If a decision cannot be traced to a reason in `DESIGN_LANGUAGE.md`, it is decoration.**

That is not a style preference. An operational interface that a technician uses two hundred times a day is judged on whether the fastest path through it is also the correct one — and decoration slows that path without anyone being able to say why.

## 2. Colour

### The 60/30/10 identity

| Share | Colour | Role | Values |
|---|---|---|---|
| 60% | **Black** | The ground and every surface | `#0d0c0c` ground, `#171414` card |
| 30% | **Red** | Structure — rails, headers, rules, primary actions | `#8e1010` deep, `#d41717` mark |
| 10% | **White** | Emphasis — titles, key numbers, text on red | `#ffffff` |

| Token | Value | Used for |
|---|---|---|
| `--brand-deep` | `#8e1010` | Rails, headers. Dark enough to sit *under* content |
| `--brand` | `#d41717` | The mark, primary action, active state |
| `--danger` | `#ff4b3e` | Alarm — **small areas only**, so it pops against the structural red |

### Three decisions worth keeping

**The ground is `#0d0c0c`, not `#000`.** It carries a trace of red, so the black and the red read as one system rather than two colours that happen to share a screen. A neutral or cool black next to `#8e1010` looks like a mistake.

**Body copy is `#f2eeec`, not pure white.** Pure white on pure black haloes for astigmatic readers — roughly a third of adults. Reserving `#ffffff` for emphasis is the same decision paying twice: it keeps contrast comfortable *and* keeps white meaningful when it appears.

**The red lives in the frame.** Rail, header, page rule. Content areas stay black, so a screen full of work reads calm and the one row that needs attention gets `--danger` on a small surface and is impossible to miss.

### The most important rule in an attention-driven interface

> **If everything is coloured, nothing is.**

Most work orders are fine. Most cards are therefore **neutral**.

| Colour | Reserved for | Not used for |
|---|---|---|
| **Red** (`--danger`) | Safety, money at risk, a customer harmed by delay | "Important", "urgent-ish", emphasis |
| **Amber** (`--warning`) | Waiting on a person — the clock is running on someone | Anything the system is doing normally |
| **Green** (`--success`) | Confirmed and settled — paid, accepted, closed | "Good" in a decorative sense |
| **Neutral** | In flight, nothing needed from you | — |

> **If a screen ends up mostly red, the fault is the screen's, not the workshop's.**

### Colour is never the only signal

Roughly 1 in 12 men has a colour-vision deficiency. **In a workshop that is most of the staff.**

Every status therefore carries text or shape as well as colour: the status pill has a label, never a bare dot; a critical row is marked by an edge *and* its reason sentence. This is not an accessibility add-on — a bare coloured dot is unreadable to a large fraction of the actual users.

**Consequence, deliberately accepted:** MOP looks plainer than a marketing site. A branch manager scanning for the one red row does not benefit from a colourful interface.

### Light theme

Reachable via `data-theme="light"`, and **re-tuned rather than inverted** — inverting a dark palette produces muddy mid-tones and broken contrast. The same hue family, each value re-picked for a light ground (the accent darkens `#2fa8e0` → `#1c7ed6` because the lighter blue fails contrast on white).

In light, the roles swap — white becomes the 60% ground, black the 10% emphasis — while **red stays at 30% and stays structural**, so the identity survives the flip.

The case that argued for it is real: a tablet held under an open shutter door in daylight is the one place a black screen genuinely loses.

**`prefers-color-scheme` deliberately does not flip the app on its own.** The ground is a product decision, not an OS setting.

## 3. Elevation

> **Shadow means "floats above the page". Nothing else.**

In a dark interface a drop shadow is nearly invisible — there is no light background for it to darken. Elevation is therefore expressed primarily by **surface lightness**: `--bg` → `--surface` → `--surface-raised`.

| Element | Treatment |
|---|---|
| Toasts, modals, dropdowns, drawers | Shadow — a genuine z-axis relationship |
| Cards, panels, table rows, tiles | **Border only** |

Shadows on static cards make a dense operational screen look bubbly and slow, and cost real paint performance on long lists. **A card is not floating; it is part of the page.**

## 4. Radius

Three values: **2px, 3px, 4px**.

> **A job card is a rectangle.** Radius is derived from the object, not chosen for feel.

| Token | Value | Used on | Reason |
|---|---|---|---|
| `--radius-sm` | 2px | Badges, inputs, cards, rows | Softens a cut edge without becoming a motif |
| `--radius-md` | 3px | Buttons, tiles | A control should read as pressable against a static card |
| `--radius-lg` | 4px | Panels, modals, drawers | Large surfaces need marginally more to avoid looking unfinished |

These were previously 4/6/10px — the default range of nearly every generated interface, and **a named tell of one**. More practically: at 6–10px a dense row of cards starts reading as a set of buttons, and rounded corners waste corner space in a table-heavy layout.

**Not 0px**, because fully square corners make adjacent surfaces visually merge, and at 1px borders they read as unrendered rather than deliberate.

## 5. The design metaphor

**A job card in the rack.** A work order is a physical card that moves along a wall. That metaphor is why the board has lanes, why a card is a rectangle with a border, why status is a label rather than a colour, and why the journey strip reads left to right as a sequence of stages rather than as a progress bar.

## 6. The UX principles

### Next-action primacy
Every role's landing page answers *"what needs me?"* with **no click, no filter and no memory of where they were**. Branch Manager gets the Attention Center; Inventory Manager gets seven triage cards; Technician gets *Now*; Team Leader gets five cards; Owner gets six.

### Role-shaped surfaces, not one app with things hidden
One shell per role. The technician's requirement (bottom nav, three pages, gloved hand) and the storekeeper's (rail, long desk sessions) are opposites; a single shell with conditionals serves neither and grows a branch per future role.

### Priority ordering is explicit
The Attention Center **ranks**, it does not list. Ranking reads the `WORKING_WEEK` policy through `workingHoursBetween`, so a job left on Thursday evening at a Friday–Saturday-weekend workshop does not age over a weekend nobody worked.

### Six states per surface
Loading · empty · error · restricted · partial · full.

> **Empty is a valid and desirable state.** An Attention Center with nothing in it is a good day, not a broken screen.

Two corollaries that appear throughout the product:
- **Absent, not empty** — a section with nothing meaningful does not render as a blank shell. Branch comparison is absent for a single-branch tenant.
- **Absent, not locked** — a control the user may never reach is not greyed out. A greyed control invites a support ticket; an absent one does not exist. Branch Manager's Team Setup rail entry is absent until delegated.

### Never leak by hiding
> **Restricted data is absent from the response, never hidden client-side.** Anyone can open developer tools.

This is a security rule that happens to have a UI consequence, not a UI rule.

### Arabic and RTL, decided now
Logical CSS properties only — `tools/lint-directional-css.mjs` fails the build on `margin-left` and friends. `dir` handling and bidi isolation from Phase 1, because retrofitting direction after five roles are built is the expensive version.
⚠️ The mechanism is real; **the translation pass itself was never done.**

### The technician interface is a field tool
Mobile- and tablet-first, no sidebar, a density layer for a gloved hand, touch targets lint-enforced. Its competitor is a paper notebook, and it must be faster.

### Perceived performance is a UX rule
A list must look identical whether it holds 1 row or 100,000. **Scale shows up in pagination, never in layout.**

### Consistency contract
One concept, one presentation. The journey strip has **one implementation** read by three roles; the dossier drawer likewise. A business concept used by two roles lives in `domain/`, never copied.

### Accessibility, which is mostly correctness
Labels on statuses, contrast that survives the theme flip, keyboard dismissal (`dismiss-on-escape`), and touch targets that a real hand can hit.

### Destructive and governed actions
No destructive action without knowing, in advance and precisely, who it affects. Freeze carries an impact preview; capability change carries an impact preview; permission locks require a written reason. All are audited.

### Language and tone
Say what the workshop *does*, never what the software *has*.

> *"Parts are requested, issued and tracked against stock"* is a sentence a workshop owner can agree or disagree with. *"Inventory module"* is not.

This rule is enforced structurally in one place worth copying: capability copy lives in `packages/shared/src/onboarding/presentation.ts` as an exhaustive `Record<CapabilityKey, …>`, so **a capability added without copy fails the build** rather than rendering as a raw key — and the copy dies with the capability instead of going stale in a component.

## 7. Where the design system lives

| Layer | Contains |
|---|---|
| `apps/web/src/app/ui/` | `button` · `charts` · `dismiss-on-escape` · `error-banner` · `form-field` · `identifier` · `status-pill` · `toast` |
| Tokens | CSS custom properties: `--bg`, `--surface`, `--surface-raised`, `--brand`, `--brand-deep`, `--danger`, `--warning`, `--success`, `--radius-{sm,md,lg}` |
| Per-role density | Inside each role's `shell/` |

Two primitives worth knowing:
- **`identifier`** — the plate/VIN/serial renderer, the one place asset identity is formatted, so a heavy-equipment tenant never sees an empty plate field where a serial belongs.
- **`status-pill`** — takes its label from the server rather than mapping enum values in the browser, so a status the client has never heard of still renders.

## 8. Implementation status

| Element | Status |
|---|---|
| 60/30/10 palette, warm near-black ground | ✅ |
| Rationed semantic colour; neutral by default | ✅ |
| Colour never the only signal | ✅ |
| Light theme re-tuned, not inverted | ✅ |
| Elevation by surface lightness; shadow only for true z-axis | ✅ |
| 2/3/4px radius derived from the object | ✅ |
| One shell per role | ✅ |
| Six states, absent-not-empty, absent-not-locked | ✅ convention |
| Logical CSS / RTL foundation, lint-enforced | ✅ |
| Touch targets lint-enforced | ✅ |
| Shared `ui/` primitives + charts | ✅ |
| Capability copy exhaustive at compile time | ✅ |
| **Translated strings (Arabic)** | 🔴 `[INTENDED]` |
| **Theme configurable per workshop** | 🔴 `[INTENDED]` — part of Builder Control's unbuilt scope |
| **A documented motion spec** | 🟡 — values exist; the reasoning is thinner than for colour and radius |

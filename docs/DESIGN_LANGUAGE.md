# Design Language

> **What this is:** the reason behind every visual decision in MOP — colour, elevation, radius, motion, spacing, type. Not a style guide listing what the values *are* (the tokens in `styles.css` do that), but *why they are those values and not others*.
> **The test any decision must pass:** if a developer asks "why 6px and not 8px?", there is an answer, and it is about the user rather than taste.
> **Companion:** [`UX_PRINCIPLES.md`](./UX_PRINCIPLES.md) governs behaviour and information hierarchy. This governs the visual language that expresses it.

---

## 0. Who we are designing for, honestly

Before any value can be justified, the person has to be real.

**The technician** stands next to a vehicle, holding a tablet in one hand, often with dirty or gloved fingers, in a workshop where the light is bad and there is glare from an open shutter door. They use MOP in short bursts between physical tasks. They are not reading; they are *checking*.

**The branch manager** is at a desk with a phone ringing, twenty open jobs, and customers arriving. They are interrupted constantly. Every time they return to the screen they must re-orient in under two seconds.

**The inventory manager** works in long focused sessions and processes many similar rows. For them, density beats spaciousness — scrolling is a cost.

**The customer** opens MOP maybe three times in their life, on a phone, while worried about money and their car. They have no idea what any of our words mean.

Four different people. This is why "make it clean and modern" is not a design goal — it says nothing about any of them.

---

## 0.5 Character — what MOP is derived from

**This section exists because its absence was a real failure.** The first version of this document justified every value in isolation — why 6px, why 120ms — and never decided what MOP should *be*. Locally reasonable choices with no governing character produced the exact interface a language model produces by default: dark navy ground, indigo-blue accent, uniformly rounded cards, Inter. That look is [documented](https://vibecodekit.dev/ai-slop-design) as the statistical average of public UI code, and permanent dark mode is [named as its single most common tell](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh). The product owner rejected it on sight, correctly.

A defensible value is not the same as a considered one. **Character is decided first; values are derived from it.**

### What MOP is derived from

> **The job card in the rack.**

A workshop already has an interface, and it is made of paper. Jobs are cards. Cards live in a rack. The rack is ordered. Priority is a **coloured edge on the card**. Anyone on the floor can read it from two metres away without training.

MOP is the digital form of that object, not a monitoring dashboard. Workshops do not experience their work as telemetry; they experience it as a stack of cards someone has to clear. Consequences that fall directly out of this:

| From the object | In the interface |
|---|---|
| Cards are white paper on a desk | White surfaces on a paper-toned ground, not panels floating on navy |
| Cards are rectangles | Radius is 2–4px. A 10px card is a UI motif, not a job card |
| Priority is a coloured edge | Critical state is `border-inline-start`, never a badge, pill or tinted row |
| A rack is read top-down at a glance | Density and alignment beat decoration; tabular numerals throughout |
| Most cards are ordinary | The ordinary state carries no colour at all |

### The 60-30-10 split

Set by the product owner and applied as the [standard rule](https://blog.logrocket.com/ux-design/60-30-10-rule/): a dominant neutral, a supporting neutral, one accent.

| Share | Role | Value |
|---|---|---|
| **60%** | Paper ground and card surfaces | `#efedea` desk, `#ffffff` card |
| **30%** | Ink — text, rules, structure, primary buttons | `#1c1917` → `#8b857e` |
| **10%** | Red | `#d41717` |

The percentages are not measured or enforced. They hold automatically because of the rule below.

---

## 1. Colour

### The governing rule

**Red is the only saturated colour in the system, and it always means "your attention goes here."**

A critical job. A destructive action. A link. Nothing decorative is ever red.

This is what keeps red at roughly 10% without anyone policing a percentage — there is simply nowhere else it is permitted. And it is why `--brand` and `--danger` are deliberately **the same value**: in this product "urgent" and "the thing to act on" are one idea, and splitting them into two reds would make both weaker.

### Why the good state has no colour

> **If everything is coloured, nothing is.**

Most work orders are fine. A job that is fine is black on white — **the absence of red is the signal**. This is why a screen full of work still reads calm while a single critical row is impossible to miss, and it is the reason the Attention Center marks tier 1 only.

If a screen ends up mostly red, the fault is the screen's, not the workshop's.

### Why interactive elements are ink, not colour

A primary button is already the heaviest thing on the page by weight and contrast. It does not also need hue. Making it black leaves red free to mean only one thing.

Links are the exception and are red, because a link is literally asking for attention — the same meaning, not a second one. `#d41717` on white is 5.3:1, which passes AA for body text.

### Why warm neutrals and not pure black

- **Pure `#000` on white haloes** at text sizes and is harsher than anything printed. `#1c1917` is a warm near-black — it reads as ink on paper rather than as a screen.
- **Warm greys read as "document", cool greys read as "instrument."** The earlier version chose cool deliberately, for a monitoring surface. The object MOP is derived from is a document, so the bias inverts with it.
- The whole neutral range is one hue family, so layered surfaces never look like different materials.

### Why light is the ground, and dark is opt-in

Light is not a fallback here. Workshop bays are bright, the device is often a tablet under glare from an open shutter, and the artifact being replaced is white paper.

Dark exists, is properly designed rather than inverted — **true near-black `#0d0d0c`, never navy** — and is reached only via `data-theme="dark"`. `prefers-color-scheme` deliberately does **not** flip the app on its own: the ground is a product decision, not an OS setting. In dark, red lifts to `#f2413a` because `#d41717` on black falls below AA.

### Why colour is never the only signal

Roughly 1 in 12 men has a colour-vision deficiency. In a workshop that is most of the staff. Every status therefore carries **text or shape** as well as colour — the status pill has a label, never a bare dot. The critical row is marked by an edge *and* its reason sentence. This is not an accessibility add-on; a bare coloured dot is unreadable to a large fraction of our actual users.

**Consequence, deliberately accepted:** MOP looks plainer than a marketing site. A branch manager scanning for the one red row does not benefit from a colourful interface.

### Why most things are grey

The most important colour rule in an attention-driven interface:

> **If everything is coloured, nothing is.**

Most work orders are fine. Most cards are therefore **neutral**. Amber and red are rationed:

| Colour | Reserved for | Not used for |
|---|---|---|
| **Red** (`--danger`) | Safety, money at risk, a customer harmed by delay | "Important", "urgent-ish", emphasis |
| **Amber** (`--warning`) | Waiting on a person — the clock is running on someone | Anything the system is doing normally |
| **Green** (`--success`) | Confirmed and settled — paid, accepted, closed | "Good" in a decorative sense |
| **Neutral** | In flight, nothing needed from you | — |

If a screen ends up mostly red, the fault is the screen's, not the workshop's.

### Why colour is never the only signal

Roughly 1 in 12 men has a colour-vision deficiency. In a workshop that is most of the staff. Every status therefore carries **text or shape** as well as colour — the status pill has a label, never a bare dot. This is not an accessibility add-on; a bare coloured dot is unreadable to a large fraction of our actual users.

### Light theme is re-tuned, not inverted

Inverting a dark palette produces muddy mid-tones and broken contrast. The light theme keeps the same hue family and re-picks each value for contrast on a light ground: the accent darkens (`#2fa8e0` → `#1c7ed6`) because the lighter blue fails contrast on white; semantic colours darken for the same reason.

---

## 2. Elevation and shadow

### Shadow means "floats above the page". Nothing else.

In a dark interface a drop shadow is nearly invisible — there is no light background for it to darken. So elevation is expressed **primarily by surface lightness**: `--bg` → `--surface` → `--surface-raised`.

Shadow is reserved for elements with a genuine z-axis relationship to the page, where the user must understand something is *temporarily on top*:

- Toasts, modals, dropdowns, drawers → shadow
- Cards, panels, table rows, tiles → **border only, no shadow**

**Why this matters:** shadows on static cards make a dense operational screen look bubbly and slow, and they cost real paint performance on long lists. A card is not floating — it is part of the page.

---

## 3. Border radius

Three values: `2px`, `3px`, `4px`.

### Why so small

**A job card is a rectangle.** Radius is derived from the object, not chosen for feel.

These were previously 4/6/10px. That range is the default of nearly every generated interface, and uniformly rounded cards are a named tell of one. More practically: at 6–10px a dense row of cards starts reading as a set of buttons, and rounded corners waste corner space in a table-heavy layout.

| Token | Value | Used on | Reason |
|---|---|---|---|
| `--radius-sm` | 2px | Badges, inputs, cards, rows | Enough to soften a cut edge, not enough to become a motif |
| `--radius-md` | 3px | Buttons, tiles | Slightly softer so a control reads as pressable against a static card |
| `--radius-lg` | 4px | Panels, modals, drawers | Large surfaces need marginally more to avoid looking unfinished |

### Why not 0px

Fully square corners make adjacent surfaces visually merge, and at 1px borders they read as unrendered rather than deliberate. 2px is the smallest value that still separates two neighbouring cards without a heavier border.

---

## 4. Motion

Two durations: `120ms` and `180ms`. One easing curve.

### Why these two, and nothing longer

| Token | Value | For | Reason |
|---|---|---|---|
| `--duration-fast` | 120ms | Hover, press, focus, colour change | Below ~150ms feels instantaneous. State feedback that lags feels broken |
| `--duration-base` | 180ms | Things that appear or move — drawer, toast, expand | Instant *movement* is disorienting; the eye needs to see where something came from |

**Nothing exceeds 200ms.** In operational software, animation the user waits through is a tax paid on every repetition. A branch manager opens a drawer forty times a day; 300ms of easing costs them twelve seconds a day for no information.

### Why this easing curve

`cubic-bezier(0.2, 0, 0, 1)` — fast start, gentle settle. Things arrive quickly and come to rest. The opposite (slow start) reads as sluggish and makes the interface feel like it is thinking.

### Why motion is never decorative

No spinning logos, no fading dashboards, no staggered list entrances. Motion in MOP does exactly one of two jobs: **confirm an action happened**, or **show where something came from**. A stagger animation on a work-order list costs the manager time on every single load.

`prefers-reduced-motion` is honoured globally — motion sensitivity can cause genuine nausea, and this is software people cannot opt out of using.

---

## 5. Spacing

4px base unit. Steps: `4, 8, 12, 16, 24, 32, 40, 48`.

### Why the scale skips 20px

The jump from 16 to 24 is deliberate. Adjacent spacings that differ by 4px are *almost* the same, and a layout built from near-identical gaps looks accidental rather than composed. Fewer, more distinct steps force a real decision about grouping, and produce consistent rhythm across screens built by different people.

### Why spacing is the primary grouping tool

Proximity groups more strongly than borders or background do. So related things get `--space-2`, unrelated things get `--space-5`, and only then do we consider a divider. A screen that needs boxes around everything to be legible has a spacing problem, not a border problem.

---

## 6. Typography

`12 / 13 / 14 / 16 / 20 / 24 / 32`. Base **14px**.

### Why 14px base, not 16px

16px is right for prose. MOP is not prose — it is tables, cards and forms viewed by someone scanning for one row. At 16px a work-order list shows meaningfully fewer rows per screen, which means more scrolling on every single use.

### Why 12px is the floor

Never smaller, on any surface. Workshop lighting is poor, screens are dirty, and staff are not all twenty-five. 12px is used only for uppercase labels and captions, which are read once to orient rather than continuously.

### Why IBM Plex, and specifically not Inter

The face is **IBM Plex Sans** (variable) with **IBM Plex Mono**, self-hosted.

- **It was drawn for interfaces where data accuracy matters**, and is [recommended for dense, data-heavy screens](https://fontalternatives.com/blog/best-fonts-dense-dashboards/) for that reason. `1/l/I` and `0/O` are unambiguous at 12–13px, which is the size a plate number is read at.
- **True tabular figures.** `font-variant-numeric: tabular-nums` is set globally: money, counts and wait times are read *down a column*, and proportional digits make `1` narrower than `8` until the column stops aligning. That is how a quantity gets misread.
- **Sans and mono are one family**, so an identifier sits inside a sentence without looking pasted in.
- **Not Inter** — a named tell of generated UI, and MOP should not look like everything else. Plex has a slight mechanical squareness that suits a workshop.

**Self-hosted, not Google Fonts.** MOP ships to markets where `fonts.googleapis.com` is blocked or slow, and a tablet on bad signal must not wait on a third party to render a plate number. It was previously *declared* in the stack but never loaded, so the app silently rendered in Segoe UI — which is part of why it read as generic.

### Why a monospace face exists at all

Plate numbers, VINs, SKUs, invoice numbers and work-order numbers render in `--font-mono`. Reasons:

- **Character disambiguation** — `0/O` and `1/l/I` matter enormously when the value identifies a physical vehicle.
- **Alignment** — fixed-width identifiers line up in a column, which makes scanning a list of plates dramatically faster.
- **It signals "this is data"** — a monospace run tells the reader instantly that the string is an identifier to be matched, not a phrase to be read.

This pairs with `<mop-identifier>`, which also isolates the value from surrounding bidirectional text so an Arabic sentence cannot reverse a plate number.

---

## 7. Density

MOP does not have one density. It has three contexts:

| Context | Density | Why |
|---|---|---|
| **Technician on a tablet** | Loose — ≥44px targets, single column | Gloved fingers, glare, one-handed use, glanced at rather than read |
| **Branch manager desk** | Medium | Constant interruption; needs to re-orient in under two seconds |
| **Inventory / analyst tables** | Dense | Long focused sessions processing many similar rows; scrolling is the cost |

A single density value for the whole product would be wrong for at least two of these three. This is a per-surface decision, made deliberately, not a global setting.

---

## 7.5 Page structure is decided per page, never globally

**There is no house layout.** Set by the product owner, and binding:

> Each page has its own perfect structure. Sometimes a table is the best option; some pages need a graph, some a timeline, some boxes containing items, some all of these.

A single page template applied across the product is how an interface ends up shaped by its framework instead of by its job. The visual language in §§1–7 is global — palette, type, radius, motion, density rules. **Composition is not.**

### The obligation this creates

Before laying out a page, find out how that *kind* of page is already solved, outside MOP:

| Page | Look at |
|---|---|
| Technician point of sale | Real POS layouts — keypad placement, cart, one-hand reach |
| Technician's task list | To-do and task apps — grouping, completion affordance, what stays visible |
| Work order board | Dispatch boards and physical job-card racks |
| Work order workspace | Case/ticket detail layouts — timeline plus actions |
| Approvals queue | Review queues built for one repeated action in one sitting |
| Reports | Editorial data layouts, not dashboard tile grids |

The reference is a starting point, not a template to copy. It has to be argued in the phase document like every other decision here: *why this structure, for this page, for this person, in this state*.

### What does not vary

Composition is free. These are not: the palette and its one rule (§1), the type scale and tabular figures (§6), radius (§3), motion (§4), spacing as the primary grouping tool (§5), logical CSS properties, and the six states every screen must handle (`UX_PRINCIPLES.md` §4).

---

## 8. What we deliberately do not do

Each of these is a common choice, rejected for a stated reason.

| Not done | Why |
|---|---|
| Gradients on surfaces | Adds no information, and makes text contrast vary across a single element |
| Icon-only buttons for primary actions | An unlabelled icon is a guess. Icons accompany words; they do not replace them |
| Coloured card backgrounds by status | Tints the text inside and destroys the "if everything is coloured, nothing is" rule. Status goes on a pill or a border edge |
| Skeleton shimmer that outlives the request | A shimmer that never resolves is worse than a spinner — it implies content is arriving when it is not |
| Toasts for errors that need a decision | A toast disappears. Anything the user must act on stays on screen |
| Dark mode as the default ground | Bright workshops, tablet glare, and the paper this replaces is white. Dark is opt-in and true black, never navy |
| Custom scrollbars, custom selects | Native controls carry the user's own accessibility settings. Replacing them silently breaks people |
| Indigo/violet accents, blue-purple gradients | The statistical default of generated UI. MOP's accent is set by the product, not by a framework's default palette |
| Inter as the UI face | Same reason. See §6 |
| Three feature cards in a row, centred dashed empty states | House style of generated software. Empty states here are left-aligned and unboxed — a centred panel drags the eye to the least useful part of an empty screen |
| Uniformly rounded cards at 8–12px | Reads as a UI motif rather than the object. See §3 |

---

## 9. How to use this document

When adding a component, the sequence is:

1. **Who uses this, and in what state?** (§0)
2. **What is the one thing they need from this screen?** — that gets the visual weight.
3. **Does anything here need colour?** If not, it stays neutral. (§1)
4. **Does anything float?** If not, no shadow. (§2)
5. **Does anything move?** Only to confirm or to show origin. (§4)
6. **Can it be grouped by spacing before reaching for a border?** (§5)

If a decision cannot be justified from this list, it is decoration, and decoration is a cost paid by every user on every load.

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

## 1. Colour

### The governing rule

**Colour carries meaning or it does not appear.** MOP is not decorated. Every colour on screen is either structure (surface, border, text) or signal (status, action). There is no third category.

### Why cool slate neutrals, not warm greys or pure black

The neutrals are slate-navy (`#0b1220` → `#e8ecf4`), not `#000`/`#888`/`#fff`.

- **Pure black backgrounds cause halation** — light text on true black smears for astigmatic readers, and roughly a third of adults have some astigmatism. `#0b1220` is dark enough to rest the eyes and light enough to keep text edges crisp.
- **A slight cool cast reads as "instrument"**, and warm greys read as "document". MOP is a monitoring surface, and the neutral bias should not fight that.
- **The whole neutral range is one hue family**, so surfaces layered on each other never look like different materials.

### Why one accent, and why it is reserved

A single signal-blue accent (`#2fa8e0` dark / `#1c7ed6` light) means *action or navigation* — and nothing else.

The reason is subtractive. Status colours (green/amber/red) carry real operational meaning: healthy, waiting, at risk. If the accent were also used decoratively — headings, dividers, illustrations — the eye would stop treating colour as information. Reserving the accent keeps the semantic palette legible.

**Consequence, deliberately accepted:** MOP looks plainer than a marketing site. That is correct. A branch manager scanning for the one red row does not benefit from a colourful interface.

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

Three values: `4px`, `6px`, `10px`.

### Why three, and why they scale with size

Radius should be proportional to the element, or a small badge and a large panel look like the same object photographed at different distances.

| Token | Value | Used on | Reason |
|---|---|---|---|
| `--radius-sm` | 4px | Badges, inputs, focus rings | Small elements need small radius or they turn into pills and lose their rectangular reading |
| `--radius-md` | 6px | Buttons, cards, tiles | The workhorse: softened enough to feel deliberate, square enough to align in a grid |
| `--radius-lg` | 10px | Panels, modals, drawers | Large surfaces need more radius to look intentionally rounded rather than accidentally imprecise |

### Why nothing above 10px

Heavy rounding (16px+) reads as consumer and playful. MOP is worn for eight-hour shifts, and very round containers waste corner space in dense layouts — a real cost in a table-heavy interface.

### Why not 0px

Fully square corners read as *raw* and unfinished, and make adjacent panels visually merge. A small radius is what separates two neighbouring surfaces without needing a heavier border.

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

## 8. What we deliberately do not do

Each of these is a common choice, rejected for a stated reason.

| Not done | Why |
|---|---|
| Gradients on surfaces | Adds no information, and makes text contrast vary across a single element |
| Icon-only buttons for primary actions | An unlabelled icon is a guess. Icons accompany words; they do not replace them |
| Coloured card backgrounds by status | Tints the text inside and destroys the "if everything is coloured, nothing is" rule. Status goes on a pill or a border edge |
| Skeleton shimmer that outlives the request | A shimmer that never resolves is worse than a spinner — it implies content is arriving when it is not |
| Toasts for errors that need a decision | A toast disappears. Anything the user must act on stays on screen |
| Dark mode as the only theme | Bright workshops exist; a light ground can be more readable behind an open shutter door |
| Custom scrollbars, custom selects | Native controls carry the user's own accessibility settings. Replacing them silently breaks people |

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

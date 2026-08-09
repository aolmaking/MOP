# Phase 6 — Technician

> **Goal:** the role that does the actual work, on the device it is actually done from.
> **Why it matters:** this is where the operations spine gets used hardest. Anything wrong in Phase 4 surfaces here, while it is still cheap to change.
> **Companions:** [`DESIGN_LANGUAGE.md`](../DESIGN_LANGUAGE.md) §7.5 — structure is decided per page and argued here. [`PHASE_5.md`](./PHASE_5.md) is the reference for the *visual language*, not for layout.

---

## 1. The person, before the pages

The branch manager sits at a desk. **The technician does not.**

They are standing next to a vehicle, holding a tablet in one hand, often with dirty or gloved fingers, in a workshop where the light is bad and there is glare from an open shutter door. They use MOP in **short bursts between physical tasks** — put the tablet down, do something with a wrench, pick it up again. They are not reading; they are *checking* and *recording*.

Three consequences the design has to absorb:

1. **Every interaction is one-handed, imprecise, and interrupted.** The other hand is holding something.
2. **They do not browse.** They have one car in front of them. A page that asks "which job?" when the answer is obvious is a page that wastes the only hand they have free.
3. **What they record becomes someone else's decision.** A fault they log becomes a customer's bill. A blocker they raise becomes the manager's queue. Recording must be fast enough that they actually do it.

### The rule this phase is judged by

> **If a technician has to take their gloves off, the interface failed.**

---

## 2. Numbers, derived rather than chosen

Phase 5's density is wrong here, and the difference is measurable rather than aesthetic.

| Value | Phase 5 | Phase 6 | Why |
|---|---|---|---|
| Minimum touch target | 32px (mouse) | **56px** | Standard gloves reduce effective precision to [20–25mm](https://corvusintell.com/blog/field-apps/ruggedized-ux-military-operators/); capacitive tips reach 12–15mm. 44px is the floor for gloved use and **48–56px is where it becomes reliable**. 56px is chosen because a missed tap here costs a whole put-down-pick-up cycle |
| Base font | 14px | **16px** | [Thin or light type is explicitly wrong for glare](https://orientdisplay.com/outdoor-display-design-checklist/). Larger and heavier survives a dirty screen in bad light |
| Minimum font | 12px | **14px** | 12px is a desk value. It is unreadable at arm's length under a shutter door |
| Layout | Multi-column, dense | **Single column** | One hand, one thumb, one thing at a time |
| Type weight | 400/600 | **500/700** | Weight is what carries contrast when the screen is dirty and the light is behind you |

These are **not** global token changes. They are a technician-scoped layer, because a value that helps here would waste half the manager's screen.

---

## 3. Three pages, no sidebar

The canonical spec is explicit: the technician gets **exactly three pages and no admin sidebar**. That is why `PlatformShell` and `BranchShell` exist as separate shells — the technician gets its own, and it carries no navigation rail at all.

| Page | The question it answers | Why it is separate |
|---|---|---|
| **Home** | "What am I doing right now?" | The put-down-pick-up page. Must answer in one glance with no tap |
| **My Work** | "What else is mine today?" | Choosing the next job. Used a handful of times a day, not continuously |
| **Work Card** | "Everything about this one car, and the ten things I can do to it" | Where the shift is actually spent |

Navigation is **thumb-reachable targets at the bottom**, not a rail. A rail on a tablet held in one hand sits under the palm.

**Three pages, but two tabs.** The Work Card is always *a specific car*, so a tab pointing at it would either be a dead link or would silently guess which job the technician meant. It is reached by tapping the job on either of the other two, which is also how it is actually used.

### Home leads with the active job, not a list

The technician has one car in front of them. Home therefore opens **on that job**, not on a list containing it — the list is `My Work`, and making Home a list would cost a tap on the page that must not cost one.

If nothing is active, Home becomes the list. That is the only branch.

---

## 4. The Work Card and its ten tools

The spec's "10 tools" are what a technician can do to a job. They are not a toolbar — a row of ten icons is a memory test, and [an unlabelled icon is a guess](../DESIGN_LANGUAGE.md).

They are grouped by **what the action costs someone else**, because that is what decides how hard it should be to press:

| Group | Tools | Weight |
|---|---|---|
| **Record what I did** | Start/pause task, complete task, add note, add photo | Cheap and frequent. Big, immediate, one tap |
| **Tell someone something** | Report blocker, log a fault, request a part | Costs someone else's time. Confirmed, and requires a reason |
| **Finish** | Request review / finish | Runs the Finish Gate. Shows what is unsatisfied *before* the press, never after |

The Finish button is the one place a technician meets the capability engine. It must show the gate result as a checklist **in advance** — `previewGates` already exists for exactly this, and it is why it exists.

---

## 5. Offline is deferred, and deliberately

Field-service literature is clear that [offline capability matters](https://team400.ai/blog/2025-07-field-service-mobile-apps). It is **not** built in Phase 6.

The reason is honesty rather than laziness: offline means write-conflict resolution, and a technician's writes are status transitions the lifecycle service owns and gates. Queuing gated transitions on a device and replaying them later is a distributed-transaction problem, not a caching problem, and doing it badly produces exactly the silent lie this project exists to prevent — a job that looks finished on a tablet and never moved on the server.

**Phase 6 makes every write explicit and every failure visible.** Offline is recorded here as a Phase 13 (Hardening) item with this reasoning attached.

---

## 6. Tasks

- **6.A** ✅ Technician API — my work, active job, work card, finish check
- **6.B** ✅ `TechnicianShell` — bottom navigation, technician density layer
- **6.C** ✅ Home — the active job, one glance, no tap
- **6.D** ✅ My Work — the day's jobs, chosen from
- **6.E** ✅ Work Card — the tools, grouped by what they cost someone else
- **6.F** ✅ Finish Gate preview — the checklist shown before the press
- **6.G** ✅ Scenario walkthrough — a technician's shift, agreeing with the manager's surfaces

## Exit criteria

1. ✅ Every interactive target on a technician page is **≥56px**, enforced by `tools/lint-touch-targets.mjs` — the project's third custom linter, wired into `pnpm lint`. It caught two real defects in the first pass of this phase, including a 32px back link. The number is derived rather than preferred, and a control added later at 40px looks fine on a monitor and is unusable in a bay: nobody catches that by reading a diff.
2. ✅ A technician can go from picking up the tablet to recording a completed task in **two taps**.
3. ✅ The Finish Gate's unsatisfied conditions are visible **before** pressing finish, in sentences.
4. ✅ A technician sees only their own work — scope enforced server-side, never filtered client-side.
5. ✅ Everything a technician records shows up correctly on the branch manager's surfaces (6.G).
6. ✅ Everything green: tests, typecheck, both lint rules, build.

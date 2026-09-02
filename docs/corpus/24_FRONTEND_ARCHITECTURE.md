# MOP — Frontend Architecture

> **Document ID:** DOC-24
> **Purpose:** how `apps/web` is laid out, why, and the rules that keep it from drifting.
> **Authority:** ARCHITECTURAL.
> **Scope:** `apps/web/src/app/**`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`. Angular, standalone components, signals, 55 web specs.
> **Source of truth:** the directory tree, `app.routes.ts`, `app.config.ts`, [`../../REORGANIZATION_REPORT.md`](../../REORGANIZATION_REPORT.md).
> **Related:** 25 (backend — same vocabulary), 27 (design system), 15 (pages), 28 (state → UI).

---

## 1. The layout

```
runtime/       http/ (error interceptor), i18n/ — framework plumbing
identity/      auth store, auth guard, landing, access.api ("may I?")
ui/            presentation primitives with no domain knowledge, + charts/
domain/        cross-role business concepts — journey/, dossier/, decisions/
experiences/   one directory per role, each owning its own shell/;
               plus public/ (unguarded pages) and home/ (fallback frame)
```

**The vocabulary is deliberately identical to `apps/api/src`'s**, so one word means one thing on both sides of the wire. `runtime/` is plumbing in both. `identity/` is who-are-you in both. `experiences/` is a role's surface in both.

## 2. Dependency direction

```
runtime/  and  ui/   import nothing above them
domain/              imports runtime/ and ui/
experiences/         imports downward, never sideways
```

**`experiences/` never imports another `experiences/` folder.** A business concept used by two roles belongs in `domain/` — one source of truth, one presentation per role.

There is one documented exception, and it proves the rule rather than breaking it: the Owner's Teams tab loads Branch Manager's `TeamSetupPage` **verbatim**, pointed at a different base path through a `TEAM_API_BASE_PATH` injection-token override. Same server-side service, same component, no second implementation — which is exactly what the rule is protecting against.

### Deciding where something goes

| If… | It belongs in |
|---|---|
| Two or more roles need the exact same behaviour | `domain/` |
| It is markup and styling with no business meaning | `ui/` |
| It is framework plumbing | `runtime/` |
| Otherwise | the owning role's `experiences/` folder |

## 3. Routing

`app.routes.ts` is the single registration point. Every route is `loadComponent`, so each page is its own lazy chunk.

**Shape:** public routes first, then one guarded block per role shell, then the fallback shell, then `**` → `''`.

Three ordering and structure decisions with reasons:

- **`/branch` is declared before the `''` fallback.** `''` matches as a prefix, so leaving `/branch` last would make every `/branch/*` URL depend on Angular backtracking out of the fallback shell.
- **`withComponentInputBinding()` is on.** Route params arrive as component inputs, so a page needing an id declares `id` rather than reaching into `ActivatedRoute` and unwrapping an observable to get one string.
- **One shell per role, not one shell branching on role.** The technician's requirement (bottom nav, gloved hand, three pages) and the storekeeper's (rail, long desk sessions) are opposites. A single shell with conditionals would serve neither well and would grow a branch for every future role.

The public routes — `/login`, `/register`, `/invite/accept`, `/password-reset`, `/access-denied`, `/tenant-frozen`, `/decide/:token` — sit **outside every shell**, deliberately: the person arriving has no account, or no session, or is not staff at all.

## 4. Identity on the client

`AuthStore` is the single source of truth for *who is signed in*.

> **It never decodes or trusts anything client-side.** Every method round-trips to the server, which is the only place a session is actually validated — an opaque httpOnly cookie.

`bootstrap()` asks `GET /auth/me` and is safe to call repeatedly, e.g. once per guarded navigation. State is signals: `session`, `status` (`idle` / `loading` / `authenticated` / `unauthenticated`), `isAuthenticated`.

`landing.ts` resolves where a session lands after login. An unrecognised landing page routes to `/access-denied` — **an intentional behaviour, not a fallback bug.** (A test once asserted the pre-`/access-denied` behaviour and was updated to match.)

`access.api.ts` calls `GET /access/check`. It **shapes the interface and enforces nothing**: a control the user may never reach is absent rather than disabled, restricted data is absent from the response rather than hidden, and the server checks again every time.

## 5. HTTP

`provideHttpClient(withFetch(), withInterceptors([errorInterceptor]))`.

`error.interceptor.ts` is the one place a failed request becomes something a person can read. The API returns `{ code, message, details? }`, and `PresentedError.message` is rendered through the shared error plumbing — which is why, for example, the plan-limit 403s needed **no web changes at all**: the existing forms already surfaced the server's message.

Per-feature API clients live beside the pages that use them (`team.api.ts`, `access.api.ts`, …), so a page's data dependencies are visible in its own folder.

## 6. State

Signals, not a store library. Three levels:

| Level | Example |
|---|---|
| **Session** | `AuthStore` — root-provided, one instance |
| **Page** | Component signals loaded from that page's API client |
| **Shared domain** | `domain/journey`'s `JourneyFeed` |

There is no global application store, deliberately. Most MOP pages are a read of one server projection plus a small number of actions that re-read it. A global store would add a second copy of server truth and a synchronisation problem to go with it.

## 7. `domain/` — the cross-role concepts

### `journey/` — the workflow strip

Read by three roles. `workflow-strip.ts` renders stages `DONE` / `CURRENT` / `WAITING` / `BLOCKED` / `AHEAD`, computed server-side from the **effective** graph — so a workshop with no QC never shows a QC stage. Not a fixed picture with steps greyed out.

`journey-poller.ts` keeps it current, and its comment is the product's realtime decision in one place:

- **Polling, deliberately.** No WebSocket or SSE infrastructure exists; introducing one would be a new runtime dependency, a new failure mode and a new thing to operate — for a screen whose truth changes on a human timescale. **If push ever arrives, this is the one place that has to change.**
- **20 seconds**, matching Live View's cadence, so there is one answer to *how live is live* rather than three. A workshop job changes hands in minutes, not milliseconds.
- **Never optimistic.** The strip is only ever redrawn from a server response. Advancing it locally after an action would make the one component three roles trust capable of showing a state the server never agreed to.

`refresh()` exists to re-read immediately after an action that may have moved the job.

### `dossier/` — the job history drawer
Renders the workshop shape **that was in force when the job opened**, from `resolveAsOf()`.

### `decisions/` — the customer decision UI
Shared by the public token page and the authenticated portal page — the same feature reached two ways.

## 8. `ui/` — primitives with no domain knowledge

`button` · `charts` · `dismiss-on-escape` · `error-banner` · `form-field` · `identifier` · `status-pill` · `toast`

`identifier` is the plate/VIN/serial renderer — the one place asset identity is formatted, so a heavy-equipment tenant never sees an empty plate field where a serial belongs.

`status-pill` renders a lifecycle state; it takes the label from the server rather than mapping enum values in the browser, so a status the client has never heard of still renders.

## 9. i18n and RTL

`runtime/i18n/locale.service.ts` handles locale and `dir`. The foundation is real: **logical CSS properties only** (`tools/lint-directional-css.mjs` fails the build on `margin-left` and friends), `dir` handling, and bidi isolation, all from Phase 1 rather than a later pass — because Arabic is a primary market and retrofitting direction is the expensive version.

⚠️ **The translation pass itself was never done.** The mechanism is in place; the strings are not translated. Phase 14 shipped the permission-key lint and a performance fix and left this owed.

## 10. Testing

55 web specs, colocated with their components — there is no separate `tests/` tree.

```bash
corepack pnpm --filter @mop/web test -- --watch=false --isolate=false
```

Web tests assert what the user can see and do. **They do not stand in for a restriction test** — a privacy rule is asserted at the API response level, because hiding in the browser is not hiding.

## 11. Rules for new frontend code

1. **Never duplicate a policy decision in the browser.** The UI reflects what the API resolved.
2. **Absent, not disabled**, for anything the user may never reach.
3. **Absent, not empty**, for a section with nothing meaningful to show.
4. **Handle all six states** — loading, empty, error, restricted, partial, full. Empty is often the desirable one.
5. **No physical-direction CSS.** Ever.
6. **Money is a string.** Render what the server sent; never do arithmetic on it.
7. **Two roles needing the same thing means `domain/`**, not a copy.
8. **Pagination, not layout,** carries scale.
9. **Every visual value is justified** from `DESIGN_LANGUAGE.md`, or it is decoration.

## 12. Implementation status

| Element | Status |
|---|---|
| Layered structure with enforced direction | ✅ |
| 11 role shells + public + fallback | ✅ |
| Lazy per-page chunks | ✅ |
| Signals-based auth store, server-validated | ✅ |
| Global error interceptor rendering `PresentedError` | ✅ |
| `access.api` shaping the UI | ✅ |
| Journey strip shared by 3 roles, 20s poll, never optimistic | ✅ |
| Dossier drawer with historical capability shape | ✅ |
| UI primitives + charts | ✅ |
| Logical-CSS / RTL foundation | ✅ |
| **Translated strings** | 🔴 `[INTENDED]` — Phase 14 owed |
| **Push realtime** | 🔴 `[INTENDED]` — polling is the decision, not the omission |
| **Date-range filter controls on analytical pages** | 🔴 `[INTENDED]` |
| `experiences/platform/add-workshop/` | ⚠️ **orphaned** — routes use `onboarding/` instead; dead directory |

# Contributing to MOP

This project is built **waterfall**, not iteratively. The structure laid down in the early phases is inherited by every phase after it, so conventions here are not preference — they are load-bearing. A shortcut taken now is paid for in every later system.

---

## Commit messages

**[Conventional Commits](https://www.conventionalcommits.org/).** A reader scanning the log should understand what changed and where without opening a diff.

```
<type>(<scope>): <summary in the imperative, lower case, no full stop>

<body: why this change, not what the diff already shows>

Refs: <phase task, issue, or document>
```

### Types

| Type | Use for |
|---|---|
| `feat` | New capability or behaviour |
| `fix` | A defect corrected |
| `refactor` | Restructuring with no behaviour change |
| `perf` | Performance work |
| `test` | Tests only |
| `docs` | Documentation only |
| `build` | Build system, dependencies, tooling |
| `ci` | CI configuration |
| `chore` | Housekeeping that fits nothing above |

### Scopes

The system or package touched: `api`, `web`, `shared`, `database`, `capabilities`, `auth`, `access`, `platform`, `operations`, `inventory`, `finance`, `billing`, `docs`, `tools`.

### Examples

```
feat(capabilities): add typed gate registry with ownership rules
fix(access): stop role template overriding a platform lock
docs(phase-2): record scenario matrix and schema verdicts
build(tools): resolve pnpm through npm_execpath so root scripts work
```

### Rules

- **Summary under 72 characters**, imperative mood (`add`, not `added`/`adds`).
- **The body explains *why*.** The diff already shows what. If a change fixes a subtle bug, say what the bug was and how it manifested — that context is the part nobody can reconstruct later.
- **State observable outcomes**, e.g. test counts before and after.
- **Never claim something works that has not been verified.** If a step was skipped, say so.
- One logical change per commit. If the body needs "and also", it is probably two commits.

---

## Code standards

### Comments explain *why*, never *what*

The code shows what it does. A comment earns its place by recording the reasoning a future reader cannot recover: the constraint that forced this shape, the simpler approach that was tried and failed, the bug that this guards against.

```ts
// Compare timestamps, not content: the generator writes a *reformatted*
// copy of the schema, so a byte comparison reports a stale client on
// every freshly-generated project.
```

### No silent stubs

A function that returns a hardcoded `true` where a real check belongs is a defect, not a placeholder — that specific pattern is how the previous implementation of this product ended up reporting success for work it had never done. If something is incomplete, it must fail loudly or be marked `TODO` with a phase reference.

### Never leak by hiding

Restricted data is **absent from the API response**, not present and hidden by CSS. Client-side hiding is the last layer of defence in depth, never the only one. Anyone can open developer tools.

### Money

`Decimal` in the database, **string** across the API. A money value that reaches the browser as a JavaScript number is a bug regardless of whether it looks right. The global interceptor handles this; do not hand-roll `.toString()`.

### Tests

- Integration tests run against **real** Postgres. Mocked databases prove nothing about constraints, transactions or cascades.
- The seed creates **two differently-shaped tenants** on purpose: a single-tenant database makes isolation bugs invisible and leaves configurability untested by construction.
- A test name should state the behaviour being protected, not the function being called.

### Direction and language

Use CSS **logical properties** (`margin-inline-start`, never `margin-left`). MOP's primary market works in Arabic, and retrofitting right-to-left support later means touching every stylesheet. Machine identifiers — plate numbers, VINs, invoice numbers — render through `<mop-identifier>`, which isolates them from surrounding bidirectional text; without it a plate number can display reversed, and a technician then collects the wrong vehicle.

---

## Before you push

```bash
corepack pnpm run doctor
```

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```

All four must pass. `lint` includes two project-specific rules beyond ESLint:

- **audit boundary** — no `AuditLog` write may occur outside `apps/api/src/audit/**` (still a genuine top-level directory after the 2026-08-22 reorganization -- the audit-boundary linter matches this exact path)
- **directional CSS** — no physical direction properties in `apps/web/src`

Both fail the build deliberately. They exist because the previous implementation of this product failed at exactly these two points, and a rule a reviewer has to remember is a rule that eventually gets forgotten.

---

## Working with the phase plan

[`docs/PHASE_MAP.md`](docs/PHASE_MAP.md) is the plan; the current phase has a detail document under `docs/phases/`. Work follows the phase order because later phases depend structurally on earlier ones — the capability-aware lifecycle, for instance, must exist before any role page depends on a state transition.

Re-planning at a phase boundary is expected and healthy. Silently drifting from the plan is not: if a task cannot be completed, record it in the phase document with the reason and the phase by which it must land, rather than letting the phase quietly report itself finished.

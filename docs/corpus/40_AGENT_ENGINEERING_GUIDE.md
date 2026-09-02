# MOP — Agent Engineering Guide

> **Document ID:** DOC-40
> **Purpose:** how to work on this repository without breaking it, and without rediscovering what is already written down.
> **Authority:** OPERATIONAL. Read this before your first edit.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** everything. This document is the index of obligations.

---

## 1. Read before coding

**Always:**
1. [`../../CLAUDE.md`](../../CLAUDE.md) — the permanent working instructions
2. [`00_DOCUMENTATION_INDEX.md`](00_DOCUMENTATION_INDEX.md)
3. [`36_IMPLEMENTATION_STATUS_REGISTER.md`](36_IMPLEMENTATION_STATUS_REGISTER.md) — where the build actually is
4. [`37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md`](37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md) — **so you do not rediscover a known gap and call it a finding**
5. [`22_DATA_INTEGRITY_AND_INVARIANTS.md`](22_DATA_INTEGRITY_AND_INVARIANTS.md)

**Then, by area:**

| Touching | Read |
|---|---|
| Anything that changes a job's route | 07, 08 |
| Configuration of any kind | 02, 04 — they define the only legitimate axes |
| Money | 10, 22 §2 |
| Stock | 09, 22 §3 |
| Permissions | 20 |
| The customer surface | 11, 33 |
| A page | 15, 27 |
| The database | 26 |
| Concurrency | 23 |

**Before proposing an architectural change:** 38, then say which decision you are superseding and what new information justifies it.

## 2. The environment, in one place

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # Bash only
corepack pnpm run doctor                       # run first when anything is odd
corepack pnpm typecheck
corepack pnpm lint                             # all 6 rules
corepack pnpm test
corepack pnpm build
```

| Trap | Reality |
|---|---|
| `pnpm` | **Not on PATH.** Use `corepack pnpm` |
| `pnpm install` | Must be `CI=true corepack pnpm install` — otherwise it hits an interactive prompt, **no-ops, and still exits 0** |
| `pnpm doctor` | A pnpm built-in that **shadows** the project script. Use `corepack pnpm run doctor` |
| Git | Needs `git -c safe.directory=<repo path>` |
| PowerShell tool | Broken here (80070002). **Use the Bash tool** |
| Docker | Must be running for Postgres |
| After a `packages/shared` export | **Rebuild it** or `apps/api` typecheck will not see it |
| After a migration | **`corepack pnpm db:test:prepare`** or integration tests fail with a confusing 500 |

Integration tests need `DATABASE_URL` pointed at the **test** database:
```bash
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
```

## 3. The rules that must not be broken

| Rule | Why |
|---|---|
| **`WorkOrderLifecycleService` is the only writer of `WorkOrder.status`** | A hardcoded transition makes the capability engine decoration. A grep for a hardcoded status write must return nothing |
| **Permission layer order, `locked` short-circuit, deny-by-default** | Capability sits above role so a permission can never resurrect a disabled capability |
| **A gate dies with the capability that owns it** | Two capabilities disagreeing about a shared gate once stranded every job in a workshop |
| **No `AuditLog` write outside `apps/api/src/audit/**`** | Lint-enforced; the build fails |
| **No physical-direction CSS** | Lint-enforced. Arabic is a primary market |
| **Money is `Decimal` in the DB, `string` across the API** | A money value reaching the browser as a JS number is a bug even when it looks right |
| **Restricted data is absent from the response, never hidden client-side** | Anyone can open developer tools |
| **No silent stubs** | A gate returning hardcoded `true` is a defect. The previous implementation had two |
| **Integration tests run against real Postgres** | Mocks prove nothing about constraints, transactions or cascades |
| **The seed creates two differently-shaped tenants** | A single-tenant database makes isolation bugs invisible |

## 4. The failure modes to actively hunt

This project's characteristic defects. Look for them **while doing other work** — that is how every one so far was found.

| Hunt for | Question |
|---|---|
| **No door** | Does this service method have an endpoint? Does that endpoint have a control? |
| **Configuration island** | Does changing this setting actually change downstream behaviour? |
| **Island subsystem** | Does the edge between these two systems work, or only each side? |
| **Metric without lineage** | Can this number be traced to the records that produced it? |
| **Orphaned model** | Does anything read this table? Write it? |
| **Orphaned permission** | Does any endpoint check this key? |
| **Unreachable enum value** | Does an edge reach this state? Does anything write it? |
| **Current vs. historical** | Would this change reprice an old invoice or reinterpret an old record? |
| **Symptom patching** | Is there already an authoritative domain concept for this, elsewhere? |

**Never patch a symptom by bolting a field onto whatever object is handy when the authoritative concept already exists.**

## 5. Vertical slices, never isolated layers

**No feature counts as done at one layer.** The chain:

```
database → domain → migration → repository → service → business rules
  → authorization → capability/policy enforcement → controller → DTO
  → frontend client → page → user interaction → browser
  → real database state → downstream subsystem → history/audit → reports
```

The owner's own worked example: *the Pricing page could write `PriceCatalogEntry` but nothing in the money path read it, and even after the service was fixed the HTTP `AddLineDto` still required `unitPrice` — so the browser journey stayed broken while unit tests were green.*

**"Page complete", "backend exists" and "tests pass" are all disqualified as finish lines.**

## 6. Adding something new

**A capability** → registry entry with a complete `RemovalPolicy` · gate ownership · `CAPABILITY_PRESENTATION` copy (compile error without it) · run the validator.

**A policy** → registry entry with options, default + `defaultReason`, mutability, relevance, impact, and `enforcement` naming **real consumers** · if it touches an edge, run `graph-safety` · never a raw string read in a consumer, always a switch over every option key.

**A state** → Prisma enum **and** `WorkflowGraph.states` **and a migration** · **add the edge that reaches it** — a state with no edge does not exist.

**A permission** → declare it in the manifest with its module · add a baseline role entry (an explicit `false` documents a deliberate denial) · **check it at a real call site** · never leave it orphaned.

**An endpoint** → controller in `systems/` if it is the system's own surface, `experiences/` if it is a role's composition · permission check in the method · resource-ownership check if it acts on one record · integration test.

**A page** → route, lazy component, API client beside it · all six states · absent-not-empty, absent-not-disabled · logical CSS only · money as server strings.

## 7. Prohibited

- Writing `WorkOrder.status` outside the lifecycle service.
- Writing `AuditLog` outside `apps/api/src/audit/**`.
- Reading or writing another system's tables.
- Duplicating a policy decision in the browser.
- Hiding restricted data client-side.
- A gate, check or metric that is hardcoded to pass.
- A capability, policy or permission with no consumer.
- Hand-maintaining a list the graph or a registry can derive.
- Editing a migration that has already run.
- Hard-deleting anything with history.
- Changing product behaviour to make a document look complete.
- Claiming completion without naming the proof.

## 8. Reporting honestly

- **If tests fail, say so with the output.**
- **If a step was skipped, say that.**
- **`[VERIFIED]` names its test or its recorded run.** Not "the tests pass".
- **`[INTEGRATED]` names the page and the endpoint.** Not "the service exists".
- **If sources disagree, record the contradiction** as a gap; do not resolve it silently.
- **If you cannot finish something, record it** with the reason and the phase by which it must land. Silent drift is the failure; re-planning is not.

## 9. Working style

**Think deeply, narrate minimally, implement aggressively.** No running commentary, no repeated summaries, no restating context. Do not produce mid-implementation status reports of the form *"I completed these five and these five remain"* — if the remaining items are already in the queue, **start the next one**.

**Never stop early** — not because the work is large, spans sessions, or because the known backlog emptied. Persist state in the repository (`AUTONOMOUS_EXECUTION_STATE.md` and `PROJECT_STATE.md` carry the queue), checkpoint at a safe commit boundary, and resume.

**When the backlog empties**, start a fresh product-completion audit: orphaned models · write-only configuration · unused endpoints, permissions and capabilities · UI without backend · backend without UI · metrics without lineage · roles without complete jobs — and implement what it finds.

## 10. Where to start today

Ranked by value per unit of effort. All six of the first item are **implemented and tested already** — they need only a door.

1. **The six missing endpoints** — G-OPS-01, G-OPS-03, G-INV-02..05. Unblocks two golden journeys and closes one partial. **Start with `resolveBlocker`: a blocked job currently cannot be finished at all.**
2. **G-INV-01** — decide the fate of the four part-request statuses that live code reads and nothing writes.
3. **G-DEBT-02** — a CI scan for domain commands with no endpoint, so this class stops accumulating.
4. **G-BILL-01** — one country adapter. The only gap that blocks trading.
5. **The platform-lock mechanism** — one piece unblocks three waiting pages.

## 11. Keeping the corpus true

- **A change that alters behaviour updates its document in the same commit.** A corpus that lags the code is worse than none, because it is believed.
- **Update the canonical tracker, not a copy.** Page counts live in `PAGE_INVENTORY.md`; phase status in `PHASE_MAP.md`; session history in `PROJECT_STATE.md`.
- **A gap you find gets an id in doc 37 in the same pass.**
- **Never upgrade a stage tag without the evidence it requires.**

---

> The deliverable is the product. Analysis, planning, validation and documentation are tools for building it — including this corpus. Progress is not *"I understood the architecture"*; progress is **a real business capability that a real user can reach, that produces the correct downstream effect, and that a test protects.**

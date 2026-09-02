# MOP — Testing and Verification Strategy

> **Document ID:** DOC-34
> **Purpose:** what each layer of testing proves, what it does **not** prove, and what "verified" is allowed to mean.
> **Authority:** ARCHITECTURAL.
> **Scope:** the whole test suite plus the six lint rules.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`. **871 API · 243 shared · 272 web tests**, of which **62 API specs are real-Postgres integration**.
> **Related:** 35 (golden journeys), 22 (invariants), 36 (status), 40 (agent guide).

---

## 1. Why this document is short on technique and long on epistemics

The most damaging thing in the previous implementation was **code that claimed to work**. Every mechanism below exists to make a claim of completeness expensive to fake.

> **A test does not prove a feature works. It proves the specific thing it asserts.** The value of this document is the second column: *what each layer does not prove.*

## 2. The layers

| Layer | Count | Proves | Does **not** prove |
|---|---|---|---|
| **Type checking** | — | Shapes agree; exhaustive records are complete; enums are closed | That any of it is reachable |
| **Lint (6 rules)** | 6 | Audit boundary, money serialisation, permission keys, directional CSS, touch targets, no hard delete | Anything about behaviour |
| **Shared unit** | 243 | Pure domain logic — router, validators, graph safety, money, ranking | That any service calls it |
| **API unit** | ~42 | One service's logic against stubs | That the database accepts it |
| **API integration** | **62** | Real Postgres: constraints, transactions, cascades, races, isolation | That any page reaches it |
| **Web unit** | 272 | Components render and react correctly | That the API returns that shape |
| **Manual verification** | recorded | The whole chain, browser to database | It stays true tomorrow |

**Nothing in this table proves a vertical slice on its own.** That is why golden journeys (doc 35) exist as a separate layer of intent, and why `[INTEGRATED]` is a distinct stage tag from `[IMPLEMENTED]`.

## 3. The load-bearing rule

> **Integration tests run against real Postgres. Mocks prove nothing about constraints, transactions or cascades.**

62 of 104 API specs are integration specs. What they prove that a mock cannot:

| Property | Example |
|---|---|
| A `CHECK` constraint really fires | Stock cannot go negative |
| A unique constraint really serialises | Two concurrent payments with one key |
| A transaction really rolls back | A compliance refusal rolls back the whole invoice |
| A `Restrict` cascade really refuses | A branch with history cannot be deleted |
| A `FOR UPDATE` really blocks | Concurrent blockers, H1 |
| Isolation really holds | A cross-tenant read returns nothing |

```bash
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
corepack pnpm --filter @mop/api test
```

> **The trap:** after creating a migration, run `corepack pnpm db:test:prepare`, or integration tests hit a test database missing the new table and fail with a confusing 500 that looks like a code bug.

## 4. The proof obligations — tests that are the design

Four suites are not "coverage". They are the mechanism by which an architectural guarantee is true at all.

| Suite | Proves | Fails when |
|---|---|---|
| `validator.spec.ts` | **Every shipped capability profile leaves every non-terminal state able to reach a terminal one** | A graph change would strand a job in a standard shape |
| `graph-safety.spec.ts` | **No policy option changes reachability**, across every option × every profile | A policy is really a mis-classified capability |
| `policy-consumers.spec.ts` | **Every `ENFORCED` policy's named `Service.method` consumers exist in the source tree** | A policy claims to be live while naming a method that does not exist, or a rename turns the claim into a lie |
| `lint-permission-keys.mjs` | **Every key literal reaching the resolver is declared** | A typo silently creates a permission nothing grants |

These are the answer to *"how do you know configuration is behavioural?"* — not by inspection, but because CI refuses otherwise.

## 5. Tests that assert an absence

A distinctive and load-bearing category: several suites assert that something is **not** in a response.

| Assertion | Why it must be a test |
|---|---|
| Team Leader responses contain no price, cost or payment field | Omission in a template is not a guarantee |
| Data Analyst People Analytics contains no money field | Same |
| Customer Decision Analytics contains no identifying field | Same |
| The delivery/payment funnel contains no currency amount | Same |
| A manager without `audit.own_tenant.view` gets 403 | |
| A cross-tenant read returns nothing | |

> **A privacy rule asserted at the UI level is not asserted.** Anyone can open developer tools; these are asserted at the API response shape.

## 6. What "verified" is allowed to mean

`[VERIFIED]` in this corpus **names its proof**. Three acceptable forms:

1. **A named test** — `plan-limits.service.integration.spec.ts` (real Postgres: accept the first, refuse the second, free the seat on deactivation).
2. **A recorded manual run** — *logged in as `analyst@apex-motors.local` over real HTTP, pulled all 5 export categories, confirmed real CSV bytes and real audit rows, confirmed a role without `analytics.export` gets 403*.
3. **A CI mechanism** — the four proof obligations above.

**Not acceptable:** "the tests pass", "the page loads", "the service exists".

### The specific things that have been walked end to end

| Journey | Result |
|---|---|
| Invite Accept | A workshop owner created through the platform API got a 401; after redeeming the invite, signs in as `TENANT_OWNER`; token consumed |
| Public decision | Read with no auth; an unacknowledged safety rejection refused; a smuggled price field refused; then answered — and the job left the manager's Approvals queue |
| Owner audit | 8 real rows including that session's own capability changes and customer decisions; every filter working; a manager without the permission refused with 403; isolation asserted in the query |
| Analyst export | All 5 categories over real HTTP against the dev database; real CSV bytes; real audit rows; 403 without the permission |
| Plan limits | Both seeded tenants checked directly against Postgres to confirm neither sits at its new ceiling |

## 7. What the suite does not cover

| Gap | Consequence |
|---|---|
| **No end-to-end browser tests** | Nothing catches "the page does not call the endpoint it should". This is precisely how four finished systems shipped with no door |
| **No scan for service methods with no HTTP door** | **Six exist today.** Nothing in CI notices |
| **No performance or load testing** | Scale claims are design claims |
| **No contract test between web clients and API DTOs** | A shape change is caught by types only where the type is shared |
| **No mutation testing** | Assertion strength is unmeasured |
| **No security testing** | No pen test, no fuzzing |
| **`[INTEGRATED]` has no mechanism** | It is asserted by review |

**The first two are the ones that matter**, because they are the gap through which this project's characteristic failure keeps arriving.

## 8. Running things

```bash
corepack pnpm run doctor     # environment health — run first when anything is odd
corepack pnpm typecheck      # shared + api
corepack pnpm lint           # all 6 rules
corepack pnpm test           # shared + api + web
corepack pnpm build
```

Per package:
```bash
corepack pnpm --filter @mop/shared test
corepack pnpm --filter @mop/api test -- <spec-name>
corepack pnpm --filter @mop/web test -- --watch=false --isolate=false
```

Environment quirks that cost an hour if rediscovered:
- `pnpm` is **not on PATH** — use `corepack pnpm`, and add Node first in Bash: `export PATH="/c/Program Files/nodejs:$PATH"`
- `pnpm install` must be `CI=true corepack pnpm install`, or it hits an interactive prompt, **no-ops, and still exits 0**
- `pnpm doctor` is a **pnpm built-in** that shadows the project script — use `corepack pnpm run doctor`
- After adding a `packages/shared` export, **rebuild it** or `apps/api` typecheck will not see it

## 9. Writing a test for new work

1. **Name what must be true**, not what the code does.
2. **If it is a constraint, transaction, cascade or race — integration, against real Postgres.**
3. **If it is a privacy rule — assert the absence, at the response shape.**
4. **If it is a domain rule with no I/O — put the logic in `shared` and unit-test it exhaustively.** Purity is why the validators can be proven at all.
5. **If it is an architectural guarantee — make CI refuse**, the way the four proof obligations do.
6. **Then walk the chain in a browser**, and record what you saw. A green suite plus an unreachable feature is this project's signature failure.

## 10. Implementation status

| Element | Status |
|---|---|
| 871 API · 243 shared · 272 web tests | ✅ |
| 62 real-Postgres integration specs | ✅ |
| Four CI proof obligations | ✅ |
| Absence assertions for privacy rules | ✅ |
| Six lint rules | ✅ |
| Colocated tests, no separate tree | ✅ |
| Recorded manual verification for the risky journeys | ✅ |
| **End-to-end browser tests** | 🔴 `[INTENDED]` |
| **A CI scan for domain commands with no endpoint** | 🔴 `[INTENDED]` — would have caught all six of today's |
| **Performance / load testing** | 🔴 |
| **Contract tests between web and API** | 🔴 |
| **A mechanism behind `[INTEGRATED]`** | 🔴 |

# 12 — Testing and Evidence Reality

**Totals:** 172 spec files — shared 13 (pure) · API 104 · web 55. Claimed gate: 871 API + 272 web + 243 shared passing (PROJECT_STATE 2026-08-25; not re-executed in this audit — static analysis of what the suites *prove*).

## 1. What kind of proof exists, per class

| Class | Count | What it proves | What it doesn't |
|---|---|---|---|
| HTTP-level integration (supertest → real Nest → real Postgres) | **7** | route wiring, guard chain, DTO rejection, real status codes for those surfaces only | everything not in the list below |
| Service-integration (real services over live Prisma) | ~56 | business logic against real constraints/transactions/cascades | routing, guards, DTO validation, error-contract (500-vs-403 class) |
| Unit w/ hand-rolled fakes | ~41 | branching logic in isolation | persistence semantics |
| Pure-function (shared engines) | 13 | capability/policy/onboarding/money math exhaustively | any wiring |
| Angular component tests | ~47 | render/state machines per page | server truth (APIs typically faked at api-service level) |
| Web unit | 4 | stores/utils | — |

**HTTP-covered surfaces (complete list):** auth controller, throttle, access controller, platform onboarding, platform controller, live-view, analytics export. That's it.

## 2. False-confidence map

| Subsystem | Tests exist? | What they actually prove | Unproven |
|---|---|---|---|
| Finance | strong service-integration (idempotency races, refunds, discounts) | money logic correct | **no HTTP test**: guard names, permission keys on routes, money-over-wire shape, error codes |
| Billing | 1 integration suite | document lifecycle incl. external mode & compliantBlocked | nothing over HTTP; no adapter exists to test compliance with |
| Inventory | 6 suites incl. concurrency (FOR UPDATE, partial fulfilment) | ledger correctness | no HTTP test |
| Operations/lifecycle/gates/intake | 7 suites | transitions, gates, intake tx, E19 flagging | no HTTP test — and the suites themselves are where unreachable intents get "exercised", manufacturing confidence the UI can't deliver |
| Technician | shift/work suites | task/blocker/finish logic given IN_PROGRESS | no endpoint test for parts receive/used; return leg has zero coverage anywhere |
| Customer/decisions | 4 suites | token flow, ack enforcement, portal scoping | public endpoints' rate-limit behavior only via auth throttle spec |
| Governance/platform | mixed; platform has HTTP tests | locks/archive/freeze race (E14) solid | disputes/staff-restriction tested only as bare services (they have no routes — tests prove behavior of unreachable code) |
| Policies | resolution integration + dead-consumers source scan | consumers stay wired | no test that a *workshop* can change policy post-creation (it can't — nothing to test) |
| Web pages | 46 component specs | state rendering | several assert presence (`app.spec.ts` is scaffold-only); actions mocked |

## 3. Patterns worth recording
- Zero framework mocking (no jest.mock/jest-mock-extended); either real DB or explicit fakes — high signal quality per test.
- `DATABASE_URL` fallback duplicated in ~60 spec files (works, fragile).
- Shared jest lacks API's 120s timeout (scrypt-heavy suites would time out if moved there).
- Weak-assertion scan: mostly benign (`toBeDefined` before behavioral asserts); one scaffold-only file.
- CI runs everything but **has never executed** (self-declared), uploads nothing.

## 4. Verdict
The pyramid is inverted by stated philosophy ("mocks prove nothing") and the service layer is *well* proven. The unproven band is precisely the product surface: guarded HTTP contracts. Until finance/billing/inventory/operations have supertest suites like auth's, regressions in wiring will reach runtime unnoticed. And demo-seed-dependent demos should never be cited as subsystem evidence (Report 01 §5, risk #2).

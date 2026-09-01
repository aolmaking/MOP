# 14 — Real Gap Register

Only gaps that block genuine usefulness. Classification: **CRITICAL** (product cannot fulfill its core promise) · **HIGH** (a real workshop hits this in week one) · **MEDIUM** (hits within a quarter) · **LOW/Deferred-intentional** (documented choices).

| # | Gap | Why it matters | Current state | Missing layer | Complexity | Class |
|---|---|---|---|---|---|---|
| G1 | Work-order progression triggers (START_INSPECTION/REQUEST_APPROVAL/APPROVE/START_WORK + ASK_CUSTOMER/CUSTOMER_RESPONDED) | The core loop is unusable | Graph edges+tests exist; zero production callers (Report 01 §2.2) | 4–6 endpoints + UI affordances on BM workspace / tech card | M | **CRITICAL** |
| G2 | Task creation surface | Technician has nothing to execute; chargeable service items derive from DONE tasks w/ serviceKey | `createTask()` unconsumed | endpoint + workspace UI (service picker from catalog) | S–M | **CRITICAL** |
| G3 | Country billing adapter(s) ETA/ZATCA | No legal invoice anywhere | seam + generic adapter only; QR null, synthetic clearance, all tenants compliantBlocked | 1 real adapter + QR + clearance integration | L (external dependency) | **CRITICAL** |
| G4 | Decision lifecycle writers (VIEWED on open; EXPIRED/CANCELLED sweeps) | Abandoned asks deadlock the finish gate forever | expiry computed-on-read only; heartbeat job does no sweeps | write paths + cron sweep | S–M | HIGH |
| G5 | Technician part-return endpoints | Manager return queue starves; work card shows unanswerable waits | `requestReturn/respondToClarification` unconsumed | 2–3 technician routes + card actions | S | HIGH |
| G6 | Policy change endpoint (governed setter) | Misconfiguration permanent; mutability labels lie | `PolicyResolutionService.set()` built, unmapped | controller + UI + lock interplay | S–M | HIGH |
| G7 | Message sending transport | Customer comms = hand-delivered URLs; templates inert | `currentBody()` ready; nothing calls it | channel adapter + send events + consent/audit | M–L | HIGH |
| G8 | Forms value capture/read-back | Inspection/custom fields decorative | `fields:{}` hardcoded; validator unconsumed | wire inspection to form registry + render values | M | HIGH |
| G9 | Web session refresh flow | Daily logouts at 20 min despite valid refresh cookie | server rotation built; client never calls | interceptor 401→refresh→retry | S | HIGH |
| G10 | Attention Center action wiring (+ REVIEW_OVERRUN union) | Primary triage page can't act | documented no-ops | map actions to existing endpoints | S | HIGH |
| G11 | Take Payment reachability | Counter payment flow orphaned | component complete, zero links | link from delivery/attention/invoice views | S | HIGH |
| G12 | HTTP-level test suites for finance/billing/inventory/operations | Wiring regressions invisible | 7 supertest files total | ~6-10 suites mirroring auth's pattern | M | HIGH |
| G13 | Specialization consumption | Creation stage seeds inert data | services exist, no controllers/readers | entry-capture on work card/service pages + read-back | M | MEDIUM |
| G14 | Governance trigger routes (staff restriction, disputes) + SUSPENDED writer | Enforcement layers guard nothing reachable; suspend unusable | services enforced/unreachable | routes + platform UI decisions | S–M | MEDIUM |
| G15 | Ongoing operator-orphan check | Deactivating last storekeeper strands approvals silently | creation-time only | periodic check or deactivation warning | S | MEDIUM |
| G16 | Transfers & supplier orders | Multi-warehouse restocking impossible; WAITING_TRANSFER/SUPPLIER states unreachable | enum residue only | services+endpoints+UI | L | MEDIUM |
| G17 | Attachments/photos | Job photos are table-stakes for workshops | model with zero consumers | upload route, storage adapter, EXIF policy | M | MEDIUM |
| G18 | i18n string pass (ar) | Arabic-primary market claim unmet | direction-only plumbing | translation catalogs (~95 templates + TS strings) | M | MEDIUM |
| G19 | Deployment image + CI execution + artifacts | Cannot ship what cannot deploy | none | Dockerfiles, env matrix, first green run | M | HIGH (for launch) |
| G20 | Observability baseline (structured logs + request-id correlation, error tracking) | Incidents undebuggable in prod shape | text logs, ids unused | logger enrichment + provider | S–M | MEDIUM |
| G21 | Security fixes S1–S3 (access TTL enforcement, refresh cap/reuse detection, TL advance scoping) | Session theft & cross-scope authority | Report 11 | targeted changes | S | HIGH |
| G22 | Hardcoded-true gates resolution | Violates own invariant; blocks honest QC/review semantics later | true,true + unreferenced | wire records or remove | S | MEDIUM |
| G23 | Analyst date-range UI | Exports/insights locked to default window | API supports params | controls on 5 pages | S | LOW |
| G24 | Owner Pricing "Who Can Handle Money" + report visibility control | Named-owed in-code | absent pending platform-lock design | needs product decision (Phase 21 OPEN item) | M | Deferred-intentional |
| G25 | Draft persistence for creation wizard; per-tenant plan override below-plan | Documented deliberate deferrals | memory-only wizard; open question | — | — | Deferred-intentional |
| G26 | Realtime updates (P-63) | Belongs to no phase — flagged by project's own inventory | absent | phase placement decision | — | Deferred-intentional |

Deliberately excluded as cosmetic: placeholder-home fallback, single-bar chart suppressions, board MAX_ROWS ambiguity (noted Report 06), doc-only drift items beyond those already shaping decisions above.

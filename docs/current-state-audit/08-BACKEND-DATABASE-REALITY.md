# 08 — Backend / API / Database Reality

## 1. Shape

NestJS, layered `audit/ runtime/ identity/ control/ systems/ experiences/ insights/` (~30 controllers). Angular same vocabulary. Prisma/Postgres: **77 models, 40 enums, 31 migrations** (coherent, forward-only; note: three use `ALTER TYPE … ADD VALUE`, requiring PG ≥ 12 semantics inside migration transactions).

## 2. Endpoint → chain map (major flows)

| Endpoint | Guard | Validation | Service | DB | Tx & side effects |
|---|---|---|---|---|---|
| POST `/auth/login` | throttle 10/60s | DTO | AuthService.login | Account lookup (OR email/phone), scrypt verify, lazy rehash | session row (sha256 secrets); cookies |
| POST `/platform/workshops` | Session+Platform | CreateWorkshopDto (whitelist+forbidNonWhitelisted globally) | PlatformService.attemptCreateWorkshop | 13-step provisioning | one `$transaction`; audit HIGH |
| POST `/platform/workshops/:id/capabilities/apply` | Session+Platform + reason DTO | IsIn registry keys | CapabilityChangeService.apply (re-previews) | time-ranged TenantCapability | tx + audit HIGH |
| POST `/branch-manager/intake` | Session + `customer.intake.create` + branch-scope | DTO | IntakeService.intake | customer/asset/WO/event/audit | mega-tx; REGISTER outside tx deliberately |
| POST `/technician/tasks/:id/complete` | Session + `task.complete` + ownership view | DTO | TechnicianWorkService.completeTask | Task, OperationEvent | TIME_TRACKING policy |
| POST `/inventory/requests/:id/issue` | Session + inventory perms | qty ≤ shelf | PartRequestService.issue | IssuedItem + StockMovement + balance + WorkOrderPartLine + graph move + event | one tx; FOR UPDATE stock |
| POST `/finance/work-orders/:id/invoice` | Session + finance perms | — | FinanceService.issueInvoice | Invoice+Lines (locked snapshots)+sequence upsert+BillingDocument | one tx; discount authority pre-check |
| POST `/finance/invoices/:id/payments` | Session + `finance.payment.record` | money-string regex | FinanceService.recordPayment | Payment (unique idempotencyKey)+event+cached totals | tx; P2002 recovery |
| POST `/branch-manager/work-orders/:id/deliver` | Session + `workorders.branch.release_delivery` | — | Lifecycle.apply DELIVER | status write (guarded updateMany) + gates pre-evaluated | event+audit via emit |
| GET `/analytics/export/:category` | Session + `analytics.export` + plan category | — | AnalyticsExportService | re-runs page build() | audit LOW |

Guards: global ThrottlerGuard; per-controller `SessionGuard`; `PlatformGuard` for platform surfaces. **No permission decorator exists** — checks are manual `access.can(session,key)` inside bodies (~28 sites), lint-pinned to the manifest by `lint-permission-keys.mjs`.

## 3. Authorization model

11 ordered layers over a REPEATABLE READ snapshot loaded fresh per request (`permission-context.service.ts`): PlatformControl locks → Plan entitlement → TenantStatus (mid-session freeze works) → StaffRestriction → TenantCapability (locked deny) → ModuleEnabled → FeatureEnabled (empty map) → WorkshopConfiguration (narrows only) → Delegation (1 key) → RoleTemplate → UserOverride. Deny-by-default; `locked` short-circuit verified by behavioral test (`permission-resolver.service.spec.ts:173–198`). Doc-comments claiming "8-layer"/"10-layer" are stale.

Branch scoping: **manual convention**, `session.branchScope` threaded into services as `branchId IN [...]`, empty array = see everything. The purpose-built `ScopeResolverService.filterBy()` (opposite semantics: empty = nothing) has zero production callers — dead code embodying the wrong assumption. `session.teamScope` hardcoded `[]` always.

Tenant isolation: manual `where:{tenantId}` in ~74 files; no Prisma middleware, no RLS. Route-param tenantId only under PlatformGuard. Cross-tenant reads confined to platform surfaces (live-view, platform reports). Customer sessions scope by `customerId`. Public surfaces: health, auth, register, decision-token (throttled).

## 4. Database reality

- Money `Decimal(12,2)` everywhere; percentages `(5,2)` in FinanceConfiguration; currency only on Tenant. CHECKs: five stock buckets ≥0 (duplicated constraint sets from two migrations — harmless redundancy), invoice balance ≥0, movement sign rules.
- Lifecycles: WO 16 states, PartRequest 19, Decision 7. No `statusChangedAt` column — `updatedAt` proxy documented (P-70 open).
- Config storage normalized (time-ranged rows), not JSON blobs — good.
- **Weak spots:** ~15 child tables carry `tenantId` with **no FK to tenants** (invoice_lines, refund_requests, credit_notes, part_return_requests, quotation_items, etc.) — integrity by convention; `Session.tenantId` no FK/index; login path does `findMany({OR:[{email},{phone}]})` seq-scan with multiple-match 409 flow; lockout timestamps use app clock while expiry uses DB clock (minor).
- Orphaned models: `QuotationItem` (comment-only mentions), `Attachment` (zero consumers), plus dead columns (`isFinalized`, `immutableVersion`, `priority`, `hourMeter`).

## 5. Endpoints/services that exist but are not consumed

| Item | Evidence |
|---|---|
| `PolicyResolutionService.set/isRelevant/resolveValueAsOf` | tests only; no policies controller anywhere |
| `StaffRestrictionService.restrict/lift` | enforced layer exists (`StaffRestrictionLayer`); no route |
| `WorkOrderDisputeService.raise/resolve/forWorkOrder` | no route |
| `TenantGroupService` / `TenantStakeholderService` | providers only; stakeholder grants read by no layer |
| Lifecycle intents START_INSPECTION/REQUEST_APPROVAL/APPROVE/START_WORK/ASK_CUSTOMER/CUSTOMER_RESPONDED | integration specs only |
| `PartRequestService.requestReturn/respondToClarification/markArrived` | no controller callers |
| `CustomFieldsService.validateValues` | spec-only consumer; inspection gets `fields:{}` |
| Specialization fillEntry/entriesFor/credentials/taxonomy | no controllers |
| `MessageTemplateService.currentBody` | no sender |
| `GET /reporting/company`, BM notes endpoints, tech finish-check endpoint, onboarding validate | web never calls |
| SUSPENDED tenant status | blocked at login/session-revoke sets but nothing writes it |
| `demoDataEnqueued` flag | echoed constant |

Frontend-calls-missing-backend: none found (every web URL resolves). Backend-without-UI is the dominant asymmetry (table above).

## 6. Correctness spot-verifications

- Money: string across API (global interceptor), integer-minor-unit math in shared, Decimal compares in gates; lint scoped to finance/inventory/operations/**not billing** (gap).
- Inventory movement correctness: FOR UPDATE + before/afterQty + replay() + DB CHECKs; issue bound to stock tx; partial fulfilment derived (integration-proven).
- Idempotency/concurrency: payments (unique key + P2002), invoice & credit-note numbering (atomic upsert, 10-way concurrency test), freeze (conditional updateMany E14), blockers/team moves (FOR UPDATE H1/H8), lifecycle/part-request transitions (guarded updateMany H2).
- Audit boundary: single writer `audit.service.ts:32`; lint enforces (regex blind to raw SQL — noted).

## 7. Verdict

Backend architecture and transactional discipline are genuinely strong for this stage; the API surface is real and mostly consistent. The systemic weakness is not quality but **reachability**: a meaningful set of implemented behaviors has no HTTP trigger (§5), and the authorization model's two custom layers (delegation, workshop-config) guard exactly one permission and zero-to-few keys respectively.

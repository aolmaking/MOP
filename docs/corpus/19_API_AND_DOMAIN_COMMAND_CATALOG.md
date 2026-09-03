# MOP — API and Domain Command Catalog

> **Document ID:** DOC-19
> **Purpose:** every HTTP endpoint in the product, with its actor, its permission, the domain command behind it, and what it changes.
> **Authority:** REFERENCE, derived. Extracted from the controller sources, not from a specification.
> **Scope:** 30 controllers, 170 routes. Base path `/api/v1`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 16 (page × feature), 20 (permissions), 07 (the intents these commands send).

---

## 1. Conventions

- **Guards.** Almost every controller is `@UseGuards(SessionGuard)`. Platform controllers add `PlatformGuard`. Four controllers are deliberately unguarded: `auth`, `public/decisions`, `public/register`, `health`.
- **Permission checks are in the method body**, not in a decorator — `this.access.can(session, "key")`, or a per-controller helper (`requireTechnician(session, "key")`, `require(session)`). `tools/lint-permission-keys.mjs` checks that every literal reaching the resolver is a declared key.
- **Money in and out is a `string`.** Never a number.
- **Errors** are `{ code, message, details? }`. A gate refusal returns **every** unsatisfied gate, not just the first.
- **Tenant scope** comes from the session. No endpoint accepts a client-supplied `tenantId`.

---

## 2. Identity — unguarded

| Method | Route | Command | Notes |
|---|---|---|---|
| POST | `/auth/login` | `AuthService.login` | Enforces `Account.status` and `TenantStatus`; returns `tenant_unavailable` for a frozen tenant. Lazy password rehash |
| POST | `/auth/refresh` | | |
| POST | `/auth/logout` | | Revokes the session |
| GET | `/auth/me` | | |
| POST | `/auth/invite/describe` | | Non-enumerating |
| POST | `/auth/invite/accept` | | **Consumes the token** |
| POST | `/auth/password-reset/request` | | **Non-enumerating; the raw token is never returned** |
| POST | `/auth/password-reset/describe` | | |
| POST | `/auth/password-reset/complete` | | |

`GET /access/check` — session-guarded — answers the client's "may I?" against the resolver.
`GET /health` — unguarded.

---

## 3. Public customer surface — unguarded by design

| Method | Route | Command | Effect |
|---|---|---|---|
| GET | `/public/decisions/:token` | `DecisionService.read` | Token-scoped to one request. Price shown only under `CUSTOMER_INVOICE_VISIBILITY = SHOWN` |
| POST | `/public/decisions/:token/respond` | `DecisionService.respond` | Applies answers; **refuses an unacknowledged critical rejection**; refuses a smuggled price field. May move the work order via `CUSTOMER_RESPONDED` / `APPROVE` |
| GET | `/public/register/workshop` | `RegisterService.workshop` | Resolves slug or registration code, excluding frozen/suspended/archived tenants |
| POST | `/public/register` | `RegisterService.create` | Creates `Account` + `Customer`. **Does not auto-login** |

*Requiring a login before `/decide/:token` would break the flow the whole feature exists for.*

---

## 4. Platform — `SessionGuard` + `PlatformGuard`

`PlatformGuard` does not consult the permission resolver (doc 18 §4). The five `platform.*` keys are therefore unconsumed.

| Method | Route | Command | Audit |
|---|---|---|---|
| GET | `/platform/plans` | `PlatformService.listPlans` | |
| GET | `/platform/workshops/name-availability` | | |
| GET | `/platform/workshops/slug-availability` | | |
| GET | `/platform/workshops/owner-email-availability` | | |
| POST | `/platform/workshops` | `PlatformService.createWorkshop` | `platform.workshop.created` — **one transaction**, writes the whole shape |
| GET | `/platform/onboarding/blueprint` | `OnboardingService.blueprint` | Derived from the live registries |
| POST | `/platform/onboarding/validate` | `validateDraft` | **The same validator the browser previews with** |
| GET | `/platform/workshops` | `WorkshopsService.list` | Server-side paging/sort/filter |
| GET | `/platform/workshops/:id/details` | | Includes `compliantBlocked` |
| GET | `/platform/workshops/:id/freeze-impact-preview` | | **Who this will affect, before it happens** |
| POST | `/platform/workshops/:id/freeze` | | `platform.workshop.frozen` |
| POST | `/platform/workshops/:id/reactivate` | | |
| GET | `/platform/workshops/:id/capabilities` | `CapabilityResolutionService` | |
| POST | `/platform/workshops/:id/capabilities/preview` | `CapabilityChangeService.preview` | Runs the reachability validator |
| POST | `/platform/workshops/:id/capabilities/apply` | `CapabilityChangeService.apply` | `capability.changed` |
| GET | `/platform/governance/workshops/:tenantId/role-locks` | | |
| GET | `/platform/governance/workshops/:tenantId/role-locks/history` | | |
| POST | `/platform/governance/workshops/:tenantId/role-locks` | `RolePermissionLockService.lock` | `governance.role_permission_lock.set` — **reason required** |
| POST | `/platform/governance/workshops/:tenantId/role-locks/remove` | | `…lock.removed` — reason required |
| POST | `/platform/governance/workshops/:tenantId/archive` | `TenantLifecycleService.archive` | |
| POST | `/platform/governance/workshops/:tenantId/reactivate` | | |
| GET | `/platform/reports` | `PlatformReportsService.overview` | |
| GET | `/platform/reports/:id/usage` | | Level 2 Usage Overview only |
| GET | `/platform/live-view` | `LiveViewService.build` | **The only cross-tenant read.** Counts and event kinds only |

---

## 5. Branch Manager — `/branch-manager`

| Method | Route | Permission | Command / effect |
|---|---|---|---|
| GET | `/attention` | `workorders.branch.view` | `AttentionQueueService.build` — reads `WORKING_WEEK` |
| GET | `/intake/search` | `customer.intake.create` | |
| GET | `/intake/branches` | | |
| POST | `/intake` | `customer.intake.create` | `IntakeService.create` → `REGISTER`. Audit `work_order.created` |
| GET | `/work-orders` | `workorders.branch.view` | Lanes from the effective graph |
| GET | `/work-orders/:id` | `workorders.branch.view` | Cost fields require `inventory.cost.view` |
| GET | `/work-orders/:id/journey` | | `WorkflowJourneyService` |
| GET | `/work-orders/:id/dossier` | | Capabilities resolved **as of the job's opened-at** |
| GET | `/work-orders/:id/notes` | | |
| POST | `/work-orders/:id/notes` | `notes.create` | `POST_CLOSE_ADDENDA` enforced. Append-only |
| GET | `/approvals` | | |
| GET | `/approvals/:requestId` | | |
| POST | `/approvals/:requestId/record` | `customer_decision.record_on_behalf` | `PORTAL_COUNTER_APPROVAL`; **attributed to staff unconditionally** |
| GET | `/delivery` | | |
| POST | `/work-orders/:id/deliver` | `workorders.branch.release_delivery` | `DELIVER` → `CLOSED`. **Delivery Gate** |
| POST | `/work-orders/:id/advance` | `workorders.review.decide` **or** `workorders.qc.decide` | Stage chosen from the job's own status |

**Missing:** no reassignment route and no blocker-clearing route, despite `workorders.branch.reassign_technician` and `workorders.branch.manage_blockers` existing.

---

## 6. Technician — `/technician`

All routes go through `requireTechnician(session, key)`, which checks the permission **and** that the job is this technician's.

| Method | Route | Permission | Effect |
|---|---|---|---|
| GET | `/active` | `task.view_assigned` | |
| GET | `/my-work` | `task.view_assigned` | |
| GET | `/work-orders/:id` | `task.view_assigned` | |
| GET | `/work-orders/:id/journey` | `task.view_assigned` | |
| GET | `/work-orders/:id/vehicle-history` | `task.view_assigned` | |
| GET | `/work-orders/:id/finish-check` | `task.view_assigned` | `previewGates` — the checklist before pressing |
| POST | `/tasks/:id/start` | | |
| POST | `/tasks/:id/complete` | `task.complete` | **`TIME_TRACKING` enforced here** |
| POST | `/tasks/:id/blocker` | `blocker.report` | `REPORT_BLOCKER` → `BLOCKED` |
| POST | `/work-orders/:id/inspection` | `inspection.quick.create` / `inspection.full.create` | |
| POST | `/work-orders/:id/faults` | | Sets `has_critical_fault` when `CRITICAL` |
| POST | `/work-orders/:id/decisions` | `customer_decision.create` **and** `.send` | |
| GET | `/parts-catalog` | | |
| POST | `/work-orders/:id/parts` | `inventory.request.create` | `REQUEST_PART` → `WAITING_PARTS` |
| POST | `/parts/:id/receive` | *(ownership check)* | → `RECEIVED_BY_TECHNICIAN` |
| POST | `/parts/:id/used` | *(ownership check)* | → `USED`; produces a chargeable line |
| POST | `/work-orders/:id/finish` | `task.finish_attempt` | `FINISH`. **Full Finish Gate** |

**Missing:** create task · resolve blocker · request return · reply to clarification · mark arrived · resolve rejected return.

---

## 7. Inventory — `/inventory`

| Method | Route | Permission |
|---|---|---|
| GET | `/home` | `inventory.home.view` |
| GET | `/catalog`, `/catalog/:id` | `inventory.catalog.manage` *(cost needs `inventory.cost.view`)* |
| POST | `/catalog`, `/catalog/:id` | `inventory.catalog.manage` |
| GET | `/reports` | `reports.inventory.view` |
| GET | `/requests` | `inventory.requests.view` |
| GET | `/stock`, `/items/:id` | |
| POST | `/requests/:id/approve` | `inventory.request.approve` — `PARTS_SEPARATION_OF_DUTIES` |
| POST | `/requests/:id/reject` | `inventory.request.reject` |
| POST | `/requests/:id/unavailable` | `inventory.request.mark_unavailable` |
| POST | `/requests/:id/issue` | `inventory.request.issue` — `StockMovement ISSUE`; partial fulfilment |
| GET | `/movements` | `inventory.movements.view` |
| GET | `/returns` | |
| POST | `/returns/:id/accept` | `inventory.stock.return.accept` — **the only action that raises available stock from a return** |
| POST | `/returns/:id/reject` | `inventory.stock.return.reject` |
| POST | `/returns/:id/clarify` | `inventory.stock.return.clarify` |
| POST | `/warehouses/:id/deactivate` | `inventory.warehouse.manage` — `BLOCK_UNTIL_ZERO`, audited |
| POST | `/warehouses/:id/reactivate` | `inventory.warehouse.manage` — audited |

---

## 8. Finance — `/finance`, `/organization/finance-configuration`

| Method | Route | Permission | Effect |
|---|---|---|---|
| GET | `/finance/work-orders/:id/total` | `workorders.branch.view` | Live running total |
| POST | `/finance/work-orders/:id/lines` | `finance.running_invoice.add_line` | |
| POST | `/finance/work-orders/:id/invoice` | `finance.invoice.issue` | **One transaction**: freeze lines, allocate number, create invoice, issue billing document (may refuse and roll everything back), emit, audit |
| GET | `/finance/invoices/:id` | | Total / paid / balance |
| POST | `/finance/invoices/:id/payments` | `finance.payment.record` | **Idempotency-keyed.** `PARTIAL_PAYMENT` enforced. `409 idempotency_conflict` on a replayed key with different content |
| POST | `/finance/invoices/:id/refunds` | `finance.refund.request` | |
| POST | `/finance/refunds/:id/approve` | `finance.refund.decide` | Issues a credit note |
| POST | `/finance/refunds/:id/reject` | `finance.refund.decide` | |
| POST | `/finance/work-orders/:id/discounts` | `finance.discount.request` | |
| POST | `/finance/discounts/:id/approve` | `finance.discount.decide` | |
| POST | `/finance/discounts/:id/reject` | `finance.discount.decide` | |
| GET/POST | `/organization/finance-configuration` | `finance.configuration.manage` | |
| GET/POST | `/organization/finance-configuration/catalog` | `finance.configuration.manage` | **Effective-dated** — a price edit opens a new row |

---

## 9. Organization and people

| Method | Route | Permission |
|---|---|---|
| GET/POST | `/organization/staff` | `organization.access.manage` |
| PATCH | `/organization/staff/:id/{scope,active,locked}` | `organization.access.manage` — writes `Account.status` **and** the `StaffUser` mirror in one transaction |
| GET | `/organization/infrastructure` | `organization.access.manage` |
| POST | `/organization/branches` | `organization.access.manage` — **`PlanLimitsService` first** |
| PATCH | `/organization/branches/:id/active` | Blocked while non-terminal work orders exist |
| POST | `/organization/warehouses` | **`PlanLimitsService` first** |
| POST | `/organization/branch-warehouse-links` | |
| GET/POST | `/organization/teams`, `POST …/:id/leader`, `POST …/members` | `organization.access.manage` |
| GET/POST | `/branch/teams`, `POST …/:id/leader`, `POST …/members` | `team_setup.branch.manage` **+ delegation.** The refusal carries the delegation layer's own reason |

Staff invite also runs `PlanLimitsService` first — a 403 that names the actual limit.

---

## 10. Customer portal — `/customer-portal`

Session-guarded, but checked on `session.accountType`, **not** through the resolver.

`GET /home` · `/assets` · `/current-service` · `/invoices` · `/decisions` · `/service/:workOrderId/journey` · `/safe-history`
`POST /decisions/:requestId/respond`

---

## 11. Team Leader — `/team-leader`

| Route | Permission |
|---|---|
| `GET /home` | `team.home.view` |
| `GET /technicians`, `/technicians/:id` | `team.technicians.view` |
| `POST /technicians/:id/notes` | `team.supervision_note.create` |
| `GET /work-orders`, `/work-orders/:id/vehicle-history` | `team.workorders.view` |
| `GET /reports` | `reports.team.view` |

All `managedTechnicianIds`-scoped. **No price, cost or payment field in any response shape** — asserted by test.

---

## 12. Owner and insights

| Route | Permission |
|---|---|
| `GET /owner/home` | `dashboard.owner.view` |
| `GET /audit` | `audit.own_tenant.view` |
| `GET/POST /organization/messages`, `POST …/preview` | `organization.messages.manage` |
| `GET /organization/forms`, `/forms/:formKey`; `POST /forms/:formKey`; `PATCH /forms/fields/:id/archived` | `organization.forms.manage` |
| `GET /organization/reports/{overview,operations,financial,inventory,customers}` | `reports.owner.view` |
| `GET /organization/workflow-health/issues`, `/bottlenecks`; `POST /issues/:fingerprint/acknowledge` | `organization.workflow_health.view` |
| `GET /reporting/company` | `reports.company.view` — legacy surface, now applies the session's branch/category scope |

### Analytics — `/analytics`

| Route | Permission |
|---|---|
| `GET /home` | `analytics.home.view` |
| `GET /operations` | `analytics.operations.view` |
| `GET /people` | `analytics.people.view` |
| `GET /inventory` | `analytics.inventory.view` *(value needs `inventory.cost.view`)* |
| `GET /decisions` | `analytics.decisions.view` |
| `GET /feature-adoption` | `analytics.feature_adoption.view` |
| `GET /export/:category` | `analytics.export` **then** the category against `Plan.allowedExports`. Writes a `LOW`-risk `analytics.export.generated` audit row |
| `GET/POST/PATCH/DELETE /saved-views[/:id]` | `analytics.saved_views.manage` — always the **session's own** tenant and account, never client-supplied ownership |

---

## 13. Domain commands with no endpoint

Implemented, tested, and unreachable over HTTP. Each is a gap in doc 37.

| Command | System | Consequence |
|---|---|---|
| `TechnicianWorkService.createTask` | Operations | **The only writer of `Task`.** Tasks exist only in the demo seed |
| `TechnicianWorkService.resolveBlocker` | Operations | A blocked job can never be finished |
| `PartRequestService.requestReturn` | Inventory | The whole return branch is unreachable from the technician's side |
| `PartRequestService.respondToClarification` | Inventory | The clarify loop has an ask and no reply |
| `PartRequestService.markArrived` | Inventory | A transferred part cannot be marked arrived |
| `PartRequestService.resolveRejectedReturn` | Inventory | A rejected return cannot be resolved |
| `StaffRestrictionService.restrict` / `lift` | Governance | Modelled, audited, no surface |
| `WorkOrderDisputeService.raise` | Governance | Modelled, no surface |
| `TenantStakeholderService.*`, `TenantGroupService.*` | Control | Phase 18.B/C deferred |
| `SpecializationService.fillEntry` / `entriesFor` / `reviseFields` | People | No page fills a card in |
| `CredentialService.define` / `grant` / `forTechnician` | People | No surface |
| `PositionTaxonomyService.forCategory` | People | No consumer |
| `MessageTemplateService.currentBody` | Customer | No sending code to read it |
| `PlanLimitsService.effectiveLimits` | Control | A natural next surface for a limits page |
| `GenericBillingAdapter.getClearanceStatus` / `generateDebitNote` | Billing | Seam waiting for a real adapter |

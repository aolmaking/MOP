# Workshop Creation Reality Audit

**Phase 0 — Tenant isolation & configuration propagation verification**

| | |
|---|---|
| Repository | `main` @ `663eecd`, worktree clean before and after |
| Method | Source trace + **live execution** against a running API bound to `mop_platform_dev` |
| Workshops created for the audit | `Audit Alpha`, `Audit Beta`, `Audit Gamma` (all namespaced `audit-*`) |
| Production code changed | **None.** Two audit documents added; no source, schema, migration or test touched |
| Companion file | [`WORKSHOP_CREATION_AUDIT_STATE.md`](./WORKSHOP_CREATION_AUDIT_STATE.md) |

Verification levels used throughout: `VERIFIED_RUNTIME`, `VERIFIED_CODE`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `INFERRED`.

---

## 1 · Executive verdict

### Can MOP create a real workshop today?

## **YES — creation is real.** But **NO — the workshops it creates are not isolated from each other.**

Workshop creation is one of the strongest pieces of engineering in this repository. A single transaction produces thirteen named provisioning steps, a reachability validator refuses an incoherent capability profile *before* anything is written, the branch↔warehouse topology is modelled explicitly rather than assumed, and the whole shape is snapshotted and audited. I created two differently-shaped workshops through the real HTTP API and both came out coherent and operable.

Configuration also genuinely propagates. Two workshops configured differently **do behave differently at runtime** — I proved this on three separate axes with live requests, including the flagship delivery-payment policy.

What fails is tenancy. `PrismaService` is a bare `PrismaClient` with no middleware, no `$extends`, and no row-level security (`VERIFIED_CODE`), so isolation is entirely per-query discipline — and the discipline is not uniform. A repeating pattern runs through the codebase: **the controller resolves `session.tenantId`, then hands the service a bare resource id.** The tenant id is used for capability and policy lookups but not for row ownership. Where that happens, any authenticated user of any workshop can act on any other workshop's records.

I proved this at runtime, not by inspection:

- Alpha's technician **started, completed and blocked Beta's task** (HTTP 201 each; Beta's task went `ASSIGNED → IN_PROGRESS → DONE`).
- Alpha's branch manager **read Beta's invoice and recorded a ₤250 payment against it** — Beta's balance moved `1000 → 750`, and the `Payment` row was filed under **Alpha's** `tenantId`.
- Alpha's inventory manager **approved Gamma's part request and issued a physical part off Gamma's shelf** — Gamma's stock moved `18 → 17`, with a `StockMovement` carrying Gamma's `tenantId` and Alpha's `actorId`.

None of that required a bug, a race, or a malformed request. It required knowing an id.

**Overall reality score: 66 / 100** (§15).

---

## 2 · Workshop creation lifecycle map

`VERIFIED_CODE` + `VERIFIED_RUNTIME`

```
Platform Super Admin
  │  apps/web/.../platform/onboarding/onboarding-page.ts   (wizard)
  │  apps/web/.../platform/add-workshop/add-workshop-page.ts (single form)
  ▼
GET  /platform/onboarding/blueprint   ── the whole catalogue in one call
POST /platform/onboarding/validate    ── same verdict the publish will give
  ▼
POST /platform/workshops
  │  CreateWorkshopDto  (class-validator; capabilities/policies/branches/
  │                      warehouses/services/responsibilities all accepted)
  ▼
PlatformController.createWorkshop        [SessionGuard + PlatformGuard]
  ▼
PlatformService.createWorkshop
  ├─ plan = plan.findUniqueOrThrow
  ├─ assertDraftIsPublishable(dto, plan)   ← the SAME validator the browser previewed with
  └─ attemptCreateWorkshop  ── ONE $transaction, retried only on registration-code collision
       │
       ├─ 01 pg_advisory_xact_lock(4210, hashtext(ownerEmail))   ← closes the read-then-write race
       ├─ 02 Tenant                     → tenants
       ├─ 03 TenantConfiguration        → tenant_configuration   (enabledModules derived from capabilities)
       ├─ 04 TenantCapability[]         → tenant_capabilities    (deviations only; absent ⇒ ENABLED)
       ├─ 05 WorkshopPolicy[]           → workshop_policies      (non-default answers only)
       ├─ 06 FinanceConfiguration       → finance_configuration  (policies → real columns)
       ├─ 07 Account(INVITED) + StaffUser(TENANT_OWNER)
       ├─ 08 RolePermission×107 + RolePage×48   (8 roles)
       ├─ 09 grantsForResponsibilities → RolePermission upserts
       ├─ 10 seedStructure  → Branch[] + Warehouse[] + BranchWarehouseAccess[]
       ├─ 11 WorkshopCatalogProvisioningService.provisionCatalog
       │        → CatalogCategory, CatalogAttribute(+values), InventoryItem,
       │          WarehouseStockBalance, StockMovement, PriceCatalogEntry
       ├─ 12 seedStarterSpecializations  → SpecializationDefinition[]
       ├─ 13 PriceCatalogEntry[] from dto.services
       ├─ 14 TenantConfigurationVersion v1  (snapshot, riskLevel HIGH)
       └─ 15 AuditService.record("platform.workshop.created", riskLevel HIGH)
  ▼
CreateWorkshopResult { tenant, steps[13], ownerInvitation{ link (raw token, once) } }
  ▼
POST /auth/invite/accept  → owner sets their own password  (VERIFIED_RUNTIME: 200)
  ▼
POST /auth/login          → SessionContext{ tenantId, role, branchScope, warehouseScope, enabledModules }
```

**Runtime evidence — Alpha's real provisioning output:**

```
   1  TENANT          Audit Alpha at /w/audit-alpha-…, trading in EGP.
   8  CONFIGURATION   AUDIT, CUSTOMER_PORTAL, FINANCE, INVENTORY, OPERATIONS,
                      ORGANIZATION, REPORTS, TEAM_MANAGEMENT
   0  CAPABILITIES    Every capability left on — this workshop runs the full product.
   2  POLICIES        2 policy answer(s) recorded; the rest run on their recommended answer.
   1  FINANCE         The delivery gate will hold a vehicle until its balance is settled.
   1  OWNER           Alpha Owner invited. No password is set here.
 107  PERMISSIONS     107 permission(s) and 48 page grant(s) across 8 roles.
   0  RESPONSIBILITY  Every capability is operated by the role that normally holds it.
   4  STRUCTURE       2 branch(es), 2 store(s), 2 branch-to-store grant(s).
  93  CATALOG         45 categories, 93 master items, 93 stock balances, 45 standard services.
   0  SPECIALIZATION  No starter cards.
   1  SERVICES        1 service(s) priced.
   1  VERSION         Version 1 snapshotted.
   1  AUDIT           Recorded at high risk level, with the full configuration attached.
```

**The validator is real.** My first Beta attempt was refused — correctly and with precision:

```
400 configuration_invalid
  CAPABILITY_INVALID          MULTI_WAREHOUSE is active but its dependency INVENTORY is not.
  CAPABILITY_NOT_PERMITTED_BY_PLAN  MULTI_WAREHOUSE requires the INVENTORY module…
  CAPABILITY_NOT_PERMITTED_BY_PLAN  TEAMS requires the TEAM_MANAGEMENT module…
```

`VERIFIED_RUNTIME`

---

## 3 · What "create workshop" actually creates

Counted directly from `mop_platform_dev` after creation (`VERIFIED_RUNTIME`).

| Entity | Alpha | Beta | Classification | Note |
|---|---:|---:|---|---|
| Tenant | 1 | 1 | **REAL** | |
| TenantConfiguration | 1 | 1 | **PARTIAL** | Row created; every JSON column is `{}` and `enabledFeatures` is `[]` |
| TenantConfigurationVersion | 1 | 1 | **DEAD DATA** | Written, read by nothing in production |
| Workshop Owner (Account + StaffUser) | 1 | 1 | **REAL** | INVITED, no password, hashed invite token |
| RolePermission | 107 | 107 | **REAL** | Consumed by `RolePermissionTemplateLayer` |
| RolePage | 48 | 48 | **DEAD DATA** | Written; no production reader |
| TenantCapability | 0 | 7 | **REAL** | Deviations only; absent ⇒ ENABLED, by design |
| WorkshopPolicy | 2 | 1 | **REAL** | Non-default answers only, by design |
| FinanceConfiguration | 1 | 1 | **PARTIAL** | 6 of 16 fields have live consumers (§5) |
| Branch | 2 | 1 | **REAL** | |
| Warehouse | 2 | 1 | **REAL** | …but see WORKSHOP-GAP-006 |
| BranchWarehouseAccess | 2 | 1 | **REAL** | Enforced at issue time (§7) |
| CatalogCategory | 45 | 28 | **REAL** | |
| CatalogAttribute / values / links | 3 / 24 / 22 | 2 / 13 / 33 | **REAL** | |
| InventoryItem | 93 | 42 | **REAL** for Alpha, **CONTRADICTORY** for Beta | Beta has `INVENTORY=DISABLED` |
| WarehouseStockBalance | 93 | 42 | **PARTIAL** | Only the *first* warehouse is stocked |
| StockMovement | 82 | 38 | **REAL** | |
| PriceCatalogEntry | 46 | 26 | **REAL** | Read by `absorbOperationalItems` |
| AuditLog | 1 | 1 | **REAL** | The creation record |
| SpecializationDefinition | 0 | 0 | **MISSING** | No starter pack requested; no UI exists either way |
| WorkshopSpecialization | 0 | 0 | **MISSING** | |
| Team / TeamMembership | 0 | 0 | **MISSING** | No team is created even with `TEAMS` enabled |
| MessageTemplate | 0 | 0 | **MISSING** | |
| CustomFieldDefinition | 0 | 0 | **MISSING** | |
| CredentialDefinition / PositionTaxonomyEntry / BlockerReasonDefinition | 0 | 0 | **MISSING** | |
| ControlSetting | 0 | 0 | **MISSING** | No platform locks or delegations seeded |
| OperationEvent | 0 | 0 | **MISSING** | Creation emits an audit row but no operation event |
| `starterBuilderTemplate` | — | — | **DECORATIVE** | Validated, stored **only** inside the v1 snapshot JSON; read by nothing (`VERIFIED_CODE`) |

---

## 4 · Tenant isolation matrix

Every "Runtime verified" row below was executed against the live API with real sessions.
**There is no global tenant enforcement** — `PrismaService` is a bare `PrismaClient` (`VERIFIED_CODE`).

| System | Tenant scoped | Runtime verified | Cross-tenant risk | Severity |
|---|---|---|---|---|
| Identity / login | YES — `Account.@@unique([tenantId,email])`, session carries tenantId | YES | LOW | — |
| Effective access (11 layers) | YES — every layer keyed on `session.tenantId` | YES | LOW | — |
| Platform admin routes | YES — `PlatformGuard` | YES | LOW | — |
| **Task lifecycle** | **NO** — `task.findUnique({ where: { id } })` | **YES — WRITE SUCCEEDED** | **CRITICAL** | **P0** |
| **Finance — settlement read** | **NO** — `settlement(invoiceId)` takes no tenantId | **YES — READ SUCCEEDED** | **CRITICAL** | **P0** |
| **Finance — payments** | **NO** — invoice by bare id; `Payment.tenantId` from the *caller* | **YES — WRITE SUCCEEDED** | **CRITICAL** | **P0** |
| **Inventory — part requests** | **NO** — `load(id)` takes no tenantId | **YES — WRITE SUCCEEDED** | **CRITICAL** | **P0** |
| **Inventory — stock issuance** | **NO** — reached through the above | **YES — STOCK MOVED 18→17** | **CRITICAL** | **P0** |
| Finance — refunds / discounts decide | **NO** — `approveRefund(id)`, `approveDiscount(id)` | NOT REACHED (needs a PENDING row) | HIGH | P0 |
| Job total (`/finance/work-orders/:id/total`) | PARTIAL — tenantId passed but the running-invoice read is by `workOrderId` | YES — 200 on a foreign job | MEDIUM | P1 |
| Work-order board / workspace | YES — `boardService.detail({tenantId, branchScope})` | YES — 404 on foreign job | LOW | — |
| Technician work card | YES — `workCard` filters `{ id, tenantId }` | YES — 404 on foreign job | LOW | — |
| Operator surfaces | YES — `workOrder.findFirst({ id, tenantId })` | YES — 400 on foreign job | LOW | — |
| Inventory list surfaces (`/inventory/stock`, `/home`, `/requests`) | YES | YES — no foreign rows | LOW | — |
| Customers / vehicles / history | YES — `history.workshop.view` + tenantId | YES — no foreign rows | LOW | — |
| Customer portal | YES — reads `session.customerId`, never a route param | Code-traced | LOW | — |
| Public decision link | YES — scoped by opaque token | Code-traced | LOW | — |
| Reports / analytics | YES for tenant; **branch scope discarded in 5 methods** | Code-traced | MEDIUM (intra-tenant) | P1 |
| Audit log | YES — `tenantId` filter | YES | LOW | — |
| Staff / teams / branches / warehouses | YES — tenantId on every query | YES | LOW | — |

### The pattern

```
Controller                                    Service
──────────                                    ───────
const tenantId = await this.require(...)  →   settlement(invoiceId)          ← tenantId dropped
await this.require(session, "…approve")   →   parts.approve(id)              ← tenantId never passed
await this.requireTechnician(session, …)  →   work.startTask(taskId)         ← tenantId never passed
const tenantId = await this.require(...)  →   recordPayment(tenantId, id, …) ← used for policy, not ownership
```

---

## 5 · Configuration propagation matrix

Does a stored decision change what the system does? Executed, not inferred.

| Configuration | Stored where | Reader | Runtime proof | Class |
|---|---|---|---|---|
| `INVENTORY` capability | `TenantCapability` | `TenantCapabilityLayer`, `requireInventory` | Alpha `/inventory/home` → **200**; Beta → **403** | **ACTIVE** |
| `TEAMS`, `TEAM_REVIEW`, `QC`, `MULTI_BRANCH`, `MULTI_WAREHOUSE`, `PART_RETURNS` | `TenantCapability` | workflow router, gate registry, permission layer | Beta's `enabledModules` shrank to 6; validator enforced dependencies | **ACTIVE** |
| `TIME_TRACKING` | `WorkshopPolicy` | `TechnicianWorkService.completeTask` | Alpha (`REQUIRED`) complete with no minutes → **400 `time_not_recorded`**; Beta (`OFF`) → **201** | **ACTIVE** |
| `DELIVERY_BLOCKED_UNTIL_PAID` | `WorkshopPolicy` → `FinanceConfiguration.allowUnpaidDelivery` | `GateEvaluatorService` | Alpha deliver with ₤500 owing → **409 `gate_blocked`**, stays `READY_FOR_DELIVERY`; Beta → **201**, job reaches **`CLOSED`** | **ACTIVE** |
| `PARTS_SEPARATION_OF_DUTIES` | `WorkshopPolicy` | `PartRequestService.approve` | Code-traced (`VERIFIED_CODE`) | ACTIVE |
| `allowUnpaidDelivery` / `allowPartialPaidDelivery` | `FinanceConfiguration` | `GateEvaluatorService` | Proven above | **ACTIVE** |
| `discountApprovalThreshold`, `maxDiscountPercent` | `FinanceConfiguration` | `FinanceService.enforceDiscountAuthority` | `VERIFIED_CODE` | ACTIVE |
| `customerInvoiceVisible` | `FinanceConfiguration` | `decision.service` | `VERIFIED_CODE` | ACTIVE |
| `externalBillingEnabled` | `FinanceConfiguration` | `BillingService` | `VERIFIED_CODE` | ACTIVE |
| `defaultDueInDays` | `FinanceConfiguration` | overdue alert only | `VERIFIED_CODE` | **PARTIALLY ACTIVE** |
| `paymentMethods` | `FinanceConfiguration` | financial *report* only — never restricts a payment | `VERIFIED_CODE` | **PARTIALLY ACTIVE** |
| **`taxRatePercent`** | `FinanceConfiguration` | **nothing** — `issueInvoice` takes `taxPercent` from the request body | Set to 14 via the owner page; zero readers in `apps/api/src` | **STORED ONLY** |
| `taxInclusive` | `FinanceConfiguration` | **nothing** | grep: 0 consumers | **STORED ONLY** |
| `maxBranchDiscountPercent` | `FinanceConfiguration` | **nothing** | grep: 0 consumers | **STORED ONLY** |
| `depositRequired`, `depositPercent` | `FinanceConfiguration` | **nothing** | grep: 0 consumers | **STORED ONLY** |
| `invoiceNumberPrefix` | `FinanceConfiguration` | **nothing** — `nextInvoiceNumber` hardcodes `INV-` | grep: 0 consumers | **STORED ONLY** |
| `invoiceTerms` | `FinanceConfiguration` | **nothing** | grep: 0 consumers | **STORED ONLY** |
| `technicianPriceVisible` | `FinanceConfiguration` | **nothing** | grep: 0 consumers | **STORED ONLY** |
| `PriceCatalogEntry` | `price_catalog_entries` | `FinanceService.absorbOperationalItems` | Owner wrote `123.45`, persisted active | **ACTIVE** |
| `CustomFieldDefinition` | `custom_field_definitions` | **nothing outside `systems/forms`** | Owner created a field → 201, persisted; zero consumers | **STORED ONLY** |
| `MessageTemplate` | `message_templates` | **nothing outside `messages/`** | Publish validation is real (`missing_required_variable`); no send path exists | **STORED ONLY** |
| `TenantConfiguration.theme` | `tenant_configuration` | branding service | `PATCH /owner/branding` → theme now `{"palette":"ocean"}` | **ACTIVE** |
| `TenantConfiguration.enabledModules` | `tenant_configuration` | `ModuleEnabledLayer` | Diverges from the capability profile after any later change | **OVERRIDDEN** (§11) |
| `TenantConfiguration.{forms,messageTemplates,workflowPolicy,roleExperience,pageLayouts,featureFlags}` | `tenant_configuration` | `roleExperience` only | All `{}` at creation | **UNUSED** |
| `starterBuilderTemplate` | v1 snapshot JSON | **nothing** | grep: 0 consumers | **UNUSED** |

**Answer to the key question:** *If two workshops choose different configurations, do they actually behave differently?* — **Yes, for capabilities and policies, proven at runtime on three axes.** No, for eight of sixteen finance-configuration fields, custom fields, message templates and the builder template.

---

## 6 · Branch & warehouse architecture

`VERIFIED_CODE` + `VERIFIED_RUNTIME`

| # | Question | Answer |
|---|---|---|
| 1 | Multiple branches per workshop? | **Yes** — declared at creation, plan-ceilinged afterwards |
| 2 | Multiple warehouses per workshop? | **Yes** |
| 3 | Each branch has a defined warehouse relationship? | **Yes** — `BranchWarehouseAccess` |
| 4 | One warehouse serving many branches? | **Yes** — empty `branchCodes` grants to all |
| 5 | One branch using many warehouses? | **Yes** — many-to-many join |
| 6 | Explicitly modelled? | **Yes** — a real join table with `@@unique([branchId, warehouseId])` |
| 7 | Persisted where? | `branch_warehouse_access` |
| 8 | A service that answers "which warehouse serves this branch"? | **No single resolver.** Three call sites each answer it their own way |
| 9 | Does inventory use the relationship? | **Yes** — `PartRequestService.issue` refuses an unauthorised store |
| 10 | Does operator approval use the correct warehouse? | **No** — `findFirst` then an arbitrary fallback |
| 11 | Stock reservation in the correct warehouse? | **No** — operator path only, unvalidated |
| 12 | Part requests target the correct warehouse? | **Yes**, when raised through `PartRequestService` |
| 13 | Branch-aware technician inventory? | Partially — `session.warehouseScope`, not branch-derived |
| 14 | Inventory Manager sees warehouse-specific requests? | **Yes** — `InventoryViewService` builds an access set |
| 15 | Transfers supported? | **Partially** — `StockService.transferStock` moves stock but writes **no `InventoryTransfer` row** |
| 16 | Warehouse selection real or hardcoded? | **Real** in the part-request path; **fallback** in the operator path |
| 17 | Fallback warehouses that cause incorrect behaviour? | **Yes** — `operator.service.ts:1043-1053` |
| 18 | Can Workshop A's branch reach Workshop B's warehouse? | **Not through `issue()`** (the access row won't exist) — **but the whole request is reachable cross-tenant anyway** (§4) |

### Declared topology (Alpha, as provisioned)

```
Audit Alpha
├── Branch A1 "Alpha Branch One"  ── served by ──► Warehouse W1   (93 items stocked)
└── Branch A2 "Alpha Branch Two"  ── served by ──► Warehouse W2   (0 items stocked)
```

### Runtime behaviour vs that topology — **Experiment D**

| Probe | Result | Verdict |
|---|---|---|
| A1 issues from **W1** (correct) | `201` — W1 stock **18 → 17** | **PASS** |
| A1 issues from **W2** (wrong) | `400 warehouse_not_authorized_for_branch` | **PASS** |
| A2 issues from **W2** (correct) | `400 insufficient_stock: 0 available` | **PASS on authorisation, FAIL on provisioning** |
| A2 issues from **W1** (wrong) | `400 warehouse_not_authorized_for_branch` | **PASS** |

The authorisation layer is correct in all four directions. The A2/W2 failure is not an access failure — the request passed the branch↔warehouse check and died at the shelf, because **provisioning stocks only `firstWarehouseId`**. Branch A2 was created with a store that has nothing in it.

### The two soft spots

```ts
// part-request.service.ts:1052 — the check is skipped entirely for a tenant with no links
const totalTenantLinks = await this.prisma.branchWarehouseAccess.count({ where: { tenantId } });
if (totalTenantLinks > 0) { /* …enforce… */ }

// operator.service.ts:1030-1053 — findFirst, then ANY active warehouse in the tenant
const branchAccess = await branchWarehouseAccess.findFirst({ where: { tenantId, branchId } });
if (!warehouseId) { const defaultWh = await warehouse.findFirst({ where: { tenantId, isActive: true } }); }
```

Measured for Alpha branch A2: `findFirst` → **W2** (correct today, because there is exactly one grant), fallback would be → **W1** (wrong store, different branch).

---

## 7 · Branch-to-warehouse runtime experiment

Covered in §6 above — Experiment D, four probes, all executed. **PASS** on authorisation; **PARTIAL** on provisioning.

---

## 8 · Workshop Owner page reality matrix

All rows `VERIFIED_RUNTIME` as the Alpha owner. Where a first probe 400'd on my own DTO guess, I read the real DTO and re-ran; only the corrected result is reported.

| Page / surface | Reads real data | Writes persist | Consumed downstream | Class |
|---|---|---|---|---|
| Organization → Infrastructure | ✅ `200`, real branches + `warehouseCount` | ✅ `POST /organization/branches` → 201, count 2→3 | ✅ branch scope, work orders, reports | **REAL** |
| Organization → Warehouses | ✅ | ✅ `POST /organization/warehouses` → 201, count 2→3 | ✅ stock, part requests | **REAL** |
| Organization → Branch↔Store links | ✅ | ✅ `POST /organization/branch-warehouse-links` → 201, grant row written | ✅ `PartRequestService.issue` | **REAL** |
| Organization → Staff | ✅ `200` | ✅ create → 201 + invite; `PATCH …/scope` → 200, `branchScope` 1→2 | ✅ session scope | **REAL** |
| Organization → Teams | ✅ `200` | not probed | ✅ team leader scoping | **PARTIAL** |
| Pricing → Finance configuration | ✅ `200` | ✅ `201` — tax=14, allowUnpaid=true, due=7 persisted | ⚠️ **6 of 16 fields have readers** | **PARTIAL** |
| Pricing → Service catalog | ✅ `200`, 9.9 KB of real entries | ✅ `201` — `unitPrice=123.45 active=true` | ✅ `absorbOperationalItems` | **REAL** |
| Forms & Fields | ✅ `200` | ✅ `201` — `CustomFieldDefinition` written with derived `fieldKey` | ❌ **no consumer outside `systems/forms`** | **DEAD** |
| Messages & Templates | ✅ `200`, registry with required-variable rules | ⚠️ validation is real and strict (`missing_required_variable`) | ❌ **no send path anywhere** | **DEAD** |
| Branding | ✅ `200` | ✅ `PATCH` → theme `{"palette":"ocean"}` | ✅ workshop branding service | **REAL** |
| Reports → Overview | ✅ `200` | n/a | ✅ | **PARTIAL** (branch scope dropped in 5 methods) |
| Workflow Health | ✅ `200`, 3 KB of issues | n/a | ✅ | **REAL** |
| History | ✅ `200` | n/a | ✅ | **REAL** |
| Audit | ✅ `200`, 3.4 KB | n/a | ✅ | **REAL** |
| Owner home | ✅ `200` | n/a | ✅ | **REAL** |
| Specializations | ✅ `200` — **returns `[]` (2 bytes)** | no UI exists | ❌ | **DEAD** |

---

## 9 · Cross-system impact map

```
CREATION DECISION            CONFIGURATION ENTITY          SYSTEMS ACTUALLY AFFECTED
─────────────────            ────────────────────          ─────────────────────────
capabilities{}          →    TenantCapability          →   ✅ permission layer 5, workflow router,
                                                            gate registry, requireInventory
                        →    TenantConfiguration           ⚠️ enabledModules — derived ONCE at creation,
                             .enabledModules                 never re-derived  ⇒ CONFLICT (§11)

policies{}              →    WorkshopPolicy            →   ✅ router edges, gate evaluator,
                                                            completeTask, recordPayment
                        →    FinanceConfiguration      →   ✅ delivery gate
                                                            ❌ tax, deposits, prefix, terms

branches[]              →    Branch                    →   ✅ work orders, staff scope, reports,
                                                            plan limits (post-creation only)

warehouses[].branchCodes →   BranchWarehouseAccess     →   ✅ PartRequestService.issue (enforced)
                                                            ✅ InventoryViewService (source marking)
                                                            ✅ InventoryAnalyticsService (scope)
                                                            ⚠️ OperatorService (findFirst + fallback)

warehouses[]            →    Warehouse + StockBalance  →   ⚠️ only warehouse #1 is stocked
                                                            ❌ plan maxWarehouses not checked at creation
                                                            ❌ INVENTORY capability not checked at creation

services[]              →    PriceCatalogEntry         →   ✅ running invoice

responsibilities{}      →    RolePermission            →   ✅ permission resolver

specializationPacks[]   →    SpecializationDefinition  →   ❌ no UI, no reader

starterBuilderTemplate  →    (snapshot JSON only)      →   ❌ nothing

— never created —       →    MessageTemplate           →   ❌ no send path
— never created —       →    CustomFieldDefinition     →   ❌ no form-render path
— never created —       →    Team                      →   ⚠️ TEAMS capability with no team
```

---

## 10 · Runtime experiment results

| Experiment | Result |
|---|---|
| **A — creation** | **PASS.** Alpha (2 branches / 2 stores / full capabilities) and Beta (1 branch / reduced capabilities) both created through the real API. Invalid Beta profile correctly refused first. |
| **A2 — record inventory** | **PASS with findings.** 36 model counts captured per tenant; 9 expected entities are never created (§3). |
| **B — tenant isolation** | **FAIL.** 13 probes, **4 leaks**; a further 2 opened once a legitimately-delegable permission was granted. Details below. |
| **C — configuration difference** | **PASS.** Four probes, all four showed divergent runtime behaviour. |
| **D — branch↔warehouse** | **PASS on authorisation** (4/4 correct), **PARTIAL on provisioning** (second store unstocked). |
| **E — owner pages** | **PARTIAL.** 14 read surfaces all `200`; 7 write surfaces persist; 3 write to entities nothing consumes. |
| **F — plan limits** | **ASYMMETRIC.** Enforced after creation (`403 plan_warehouses_limit_reached`), bypassed during creation. |
| **UI-level verification** | **NOT TESTED.** All probes were API-level. **BLOCKED BECAUSE:** the Angular dev server was not running and starting it was out of scope for a read-only audit; every finding here is therefore stated at the HTTP layer, which is where enforcement must live regardless. |

### Experiment B in full

| ID | Probe | HTTP | Outcome |
|---|---|---|---|
| B1 | Alpha technician → `POST /technician/tasks/{BETA task}/start` | **201** | **LEAK** — Beta task `ASSIGNED → IN_PROGRESS`, `startedAt` stamped |
| B2 | Alpha technician → `POST /technician/tasks/{BETA task}/complete` | **201** | **LEAK** — Beta task → `DONE`, `completedAt` stamped |
| B3 | Alpha technician → `POST /technician/tasks/{BETA task}/blocker` | **201** | **LEAK** — `TaskBlocker` written with `tenantId=BETA`, `reportedBy=ALPHA account` |
| B4 | Alpha BM → `GET /finance/invoices/{BETA invoice}` | 403 | blocked **only** by a default-false permission |
| B5 | Alpha BM → `POST /finance/invoices/{BETA invoice}/payments` | 403 | same |
| B6 | Alpha IM → `POST /inventory/requests/{BETA req}/approve` | 403 | blocked **only** because Beta has `INVENTORY=DISABLED` |
| B7 | Alpha IM → `…/issue` | 403 | same |
| B8 | Alpha technician → `GET /technician/work-orders/{BETA wo}` | 404 | **correctly scoped** |
| B9 | Alpha BM → `GET /branch-manager/work-orders/{BETA wo}` | 404 | **correctly scoped** |
| B10 | Alpha BM → `GET /finance/work-orders/{BETA wo}/total` | **200** | **LEAK** — foreign job total returned |
| B11 | Alpha BM → `GET /operator/work-orders/{BETA wo}/inspection-report` | 400 | **correctly scoped** |
| B12 | Alpha owner → `GET /owner/history` | 200 | **correctly scoped** — no Beta rows |
| B13 | Alpha IM → `GET /inventory/stock` | 200 | **correctly scoped** — no Beta items |

**B4/B5 re-probed after a legitimate delegation.** `BRANCH_MANAGER` holds `finance.payment.record: false` by default, and the product explicitly documents delegating it ("Issuing/recording money is Owner-only **unless explicitly delegated**"). I granted it in Alpha, then repeated:

```
[B4'] GET  /finance/invoices/{BETA invoice}          → 200
      {"total":"1000.00","paid":"0.00","outstanding":"1000.00","settled":false}
[B5'] POST /finance/invoices/{BETA invoice}/payments → 201
      BETA invoice before: balance=1000 paid=0
      BETA invoice after : balance= 750 paid=250
      Payment row tenantId = ALPHA        ← filed under the attacker's workshop
```

**B6/B7 re-probed against an inventory-enabled victim.** I created a third workshop, Gamma, identical in shape to Alpha, and attacked it with Alpha's inventory manager:

```
[B6'] POST /inventory/requests/{GAMMA req}/approve → 201   status REQUESTED → APPROVED
[B7'] POST /inventory/requests/{GAMMA req}/issue   → 201   status APPROVED  → ISSUED
      GAMMA stock: 18 → 17
      StockMovement: type=ISSUE qty=1 tenantId=GAMMA actorId=ALPHA-inventory-manager
      WorkOrderPartLine on GAMMA's job: "Toyota Genuine Ceramic Front Brake Pads" x1 @ 68
                                        addedById = ALPHA-inventory-manager
```

Both "blocks" were incidental. **Neither was tenant isolation.**

### Experiment C in full

```
C1  INVENTORY capability   ALPHA (on)  approve part request → 201
                           BETA (off)  approve part request → 403 "You do not have access to inventory."
C2  GET /inventory/home    ALPHA 200                       BETA 403
C3  TIME_TRACKING          ALPHA REQUIRED  complete, no minutes → 400 time_not_recorded
                           BETA  OFF       complete, no minutes → 201
C4  DELIVERY_BLOCKED…      ALPHA ALWAYS  deliver with ₤500 owing → 409 gate_blocked
                                                                    stays READY_FOR_DELIVERY
                           BETA  NEVER   deliver with ₤500 owing → 201, reaches CLOSED
```

---

## 11 · Architectural drift register

| ID | Drift | Level |
|---|---|---|
| D-1 | `TenantConfiguration.enabledModules` is derived from the capability profile **only at creation**. `CapabilityChangeService.apply()` writes `TenantCapability` rows and an audit entry but never touches the stored module list. Two live answers to "is this module on": permission layer 6 reads the stored list, `resolveWorkshopModel` derives from capabilities. Enabling a capability later leaves it denied at layer 6. `platform.service.ts:282` states "derived from the capabilities above, so the two can never disagree" — true only at t=0. | `VERIFIED_CODE` |
| D-2 | Creation bypasses `PlanLimitsService`; every other path uses it. Beta sits permanently over its own ceiling. | `VERIFIED_RUNTIME` |
| D-3 | `WorkshopCatalogProvisioningService` has zero references to the capability profile. A workshop with `INVENTORY=DISABLED` receives 42 items, 42 balances and 38 movements it can never touch. | `VERIFIED_RUNTIME` |
| D-4 | `seedStructure` stocks only `firstWarehouseId`. A multi-store workshop starts with one full store and the rest empty, with nothing saying so. | `VERIFIED_RUNTIME` |
| D-5 | Three different answers to "which warehouse serves this branch": enforced (`PartRequestService`), advisory (`InventoryViewService`), guessed (`OperatorService`). No shared resolver. | `VERIFIED_CODE` |
| D-6 | `StockService.transferStock` moves stock between warehouses but never writes an `InventoryTransfer` row — the model has no production writer. | `VERIFIED_CODE` |
| D-7 | 8 of 16 `FinanceConfiguration` fields have no reader. The Owner's Pricing page presents a tax rate that never reaches an invoice. | `VERIFIED_CODE` |
| D-8 | `RolePage` (48 rows/tenant) and `TenantConfigurationVersion` are written at creation and read by nothing. | `VERIFIED_CODE` |
| D-9 | Creation writes an `AuditLog` row but no `OperationEvent`, so the platform's own event spine has no record of a workshop coming into existence. | `VERIFIED_RUNTIME` |
| D-10 | `TEAMS` can be enabled with zero `Team` rows and no team created at provisioning. | `VERIFIED_RUNTIME` |

---

## 12 · Missing systems

- **A tenant-ownership boundary.** No middleware, no `$extends`, no RLS, no repository base class. Correctness depends on every author remembering, and 241 Prisma calls across 50 models carry no `tenantId` in their `where`.
- **A branch→warehouse resolver.** Three call sites, three behaviours.
- **A form-render path.** `CustomFieldDefinition` is writable and unreadable.
- **A message-send path.** Templates version, validate and publish; nothing sends.
- **A specialization UI.** Four models, seven endpoints, a migration — no frontend.
- **Inventory transfer records.** Stock moves; the transfer is not recorded.
- **Warehouse stocking beyond the first store.**

---

## 13 · Dead / decorative configuration

| Item | Class | Evidence |
|---|---|---|
| `starterBuilderTemplate` | **DECORATIVE** | Validated against 3 values, stored only in the v1 snapshot; zero readers |
| `taxRatePercent`, `taxInclusive`, `maxBranchDiscountPercent`, `depositRequired`, `depositPercent`, `invoiceNumberPrefix`, `invoiceTerms`, `technicianPriceVisible` | **DEAD DATA** | Owner-settable, persisted, zero readers |
| `CustomFieldDefinition` | **DEAD DATA** | Written via the real API; no consumer outside `systems/forms` |
| `MessageTemplate` | **DEAD DATA** | Publish validation is real; no send path exists |
| `RolePage` (48/tenant) | **DEAD DATA** | Written at creation, never read |
| `TenantConfigurationVersion` | **DEAD DATA** | Snapshot written, never read |
| `TenantConfiguration.{forms, messageTemplates, workflowPolicy, pageLayouts, featureFlags}` | **DEAD DATA** | All `{}` at creation; only `roleExperience` has a reader |
| `SpecializationDefinition` / `WorkshopSpecialization` | **MISSING → DEAD** | Never created; no UI |
| `InventoryTransfer`, `SupplierOrder` | **DEAD DATA** | No production writer |

---

## 14 · Security / cross-tenant risks

### WORKSHOP-GAP-001 — Cross-tenant task mutation · **P0**

- **System:** Operations / technician work
- **Evidence:** `VERIFIED_RUNTIME` — B1, B2, B3 all `201`
- **Files:** `apps/api/src/systems/operations/technician-work.service.ts:185, 264, 933` · `apps/api/src/experiences/technician/technician.controller.ts:152, 161, 167`
- **Current behavior:** `startTask`/`completeTask`/`reportBlocker` load `task.findUnique({ where: { id } })`. The controller checks only that the caller holds the permission **in their own tenant**; there is no tenant filter, no assignment check and no branch-scope check.
- **Expected architecture:** A task may only be acted on by a member of its own tenant, and normally only by an assignee within branch scope.
- **Root cause:** Controller resolves `tenantId` and never passes it; the service is addressed by a bare id.
- **Affected workshops:** All. **Downstream:** task rework metrics, technician workload, quality analytics, chargeable items, the finish gate.
- **Reproduction:** Log in as any technician in workshop A; `POST /api/v1/technician/tasks/{a task id from workshop B}/start`.
- **Fix direction:** Scope the load by `tenantId` from the session, and assert assignment/branch scope. Consider a shared `loadOwned(model, id, session)` helper so the pattern cannot recur.

### WORKSHOP-GAP-002 — Cross-tenant payment against a foreign invoice · **P0**

- **System:** Finance Core
- **Evidence:** `VERIFIED_RUNTIME` — B5′ `201`; Beta's invoice `1000 → 750`; `Payment.tenantId = ALPHA`
- **Files:** `apps/api/src/systems/finance/finance.service.ts:420-486, 585` · `finance.controller.ts:60, 73`
- **Current behavior:** `settlement(invoiceId)` takes no tenant. `recordPayment(tenantId, invoiceId, …)` uses `tenantId` for capability and policy lookups, loads the invoice by bare id, and writes `Payment.tenantId` from the **caller's** session.
- **Expected architecture:** An invoice is reachable only from its own tenant; a payment's tenant is the invoice's tenant, by construction.
- **Affected downstream:** the victim's delivery gate (a car can be released unpaid), the victim's outstanding balance, the attacker's "collected cash" report, and a permanently corrupt row where `Payment.tenantId ≠ Invoice.tenantId`.
- **Note on severity:** the default `BRANCH_MANAGER` template denies `finance.payment.record`, but the product documents delegating it. The block is a permission accident, not isolation.
- **Fix direction:** `invoice.findFirst({ where: { id, tenantId } })` in both methods; derive `Payment.tenantId` from the invoice.

### WORKSHOP-GAP-003 — Cross-tenant part approval and stock issuance · **P0**

- **System:** Inventory
- **Evidence:** `VERIFIED_RUNTIME` — B6′/B7′ `201`; Gamma stock `18 → 17`; `StockMovement.tenantId = GAMMA`, `actorId = ALPHA`
- **Files:** `apps/api/src/systems/inventory/part-request.service.ts:980` (`load`) · `inventory.controller.ts:337, 343, 349, 356`
- **Current behavior:** `load(id)` has no tenant filter. Approve, reject, mark-unavailable and issue are all reachable across tenants. `requireInventory` is evaluated against the **victim's** capability profile, so an inventory-disabled victim happens to refuse — an accident, not a boundary.
- **Affected downstream:** the victim's physical stock, its ledger, its billable part lines, its finish gate, its inventory reports.
- **Fix direction:** Scope `load` by tenant. Additionally validate that `IssueDto.warehouseId` belongs to the request's tenant — today `requireAuthorizedWarehouseForWorkOrder` is skipped entirely when a tenant has zero `BranchWarehouseAccess` rows.

### WORKSHOP-GAP-004 — Cross-tenant refund and discount decisions · **P0**

- **System:** Finance Core · **Evidence:** `VERIFIED_CODE` (not reached at runtime — needs a `PENDING` row)
- **Files:** `finance.service.ts:661, 788` — `approveRefund(id)` / `approveDiscount(id)` take no tenant; `finance.controller.ts:97, 103, 115, 121` resolve `tenantId` and discard it.
- **Impact:** Approving a foreign refund issues a credit note in the victim's tenant. The `REFUND_AUTHORITY` policy is resolved from the **victim's** tenant, so the attacker is judged against rules they are not subject to.

### WORKSHOP-GAP-005 — Cross-tenant job total read · **P1**

- **Evidence:** `VERIFIED_RUNTIME` — B10 `200` on a foreign work order
- **Files:** `finance.service.ts:191` — `jobTotal(tenantId, workOrderId)` reads `runningInvoice.findUnique({ where: { workOrderId } })` with no tenant filter. Returned an empty total here only because the foreign job had no lines.

### WORKSHOP-GAP-006 — Plan ceilings bypassed at creation · **P1**

- **Evidence:** `VERIFIED_RUNTIME` — Beta on Quick Service (`maxWarehouses: 0`) received one warehouse; afterwards `POST /organization/warehouses` → `403 plan_warehouses_limit_reached`
- **Files:** `platform.service.ts` `seedStructure` (never calls `PlanLimitsService`) vs `branch-warehouse.service.ts:115, 186` (does)
- **Impact:** A workshop can be provisioned permanently over its own ceiling and then be unable to add anything.

### WORKSHOP-GAP-007 — Inventory provisioned regardless of the INVENTORY capability · **P2**

- **Evidence:** `VERIFIED_RUNTIME` — Beta has `INVENTORY=DISABLED` and 42 items / 42 balances / 38 movements
- **Files:** `workshop-catalog-provisioning.service.ts` (no capability reference anywhere)
- **Impact:** Contradicts the capability model's central promise; inflates inventory value reports for workshops that hold no stock.

### WORKSHOP-GAP-008 — Only the first warehouse is stocked · **P2**

- **Evidence:** `VERIFIED_RUNTIME` — Alpha W1 stocked, W2 empty; branch A2 could not be served
- **Files:** `platform.service.ts` passes `structure.firstWarehouseId` to `provisionCatalog`

### WORKSHOP-GAP-009 — Two sources of truth for enabled modules · **P2**

- **Evidence:** `VERIFIED_CODE` — §11 D-1

### WORKSHOP-GAP-010 — Operator warehouse fallback · **P2**

- **Files:** `operator.service.ts:1030-1053` — `findFirst`, then any active tenant warehouse; the choice is never validated against `BranchWarehouseAccess`

### WORKSHOP-GAP-011 — Dead configuration surfaces · **P3**

- 8 `FinanceConfiguration` fields, `CustomFieldDefinition`, `MessageTemplate`, `RolePage`, `TenantConfigurationVersion`, `starterBuilderTemplate` (§13)

### WORKSHOP-GAP-012 — Branch-scope discarded in owner reports · **P3**

- `reports-inventory`, `reports-customers`, `branchComparison`, `technicianWorkload`, `reopenedJobsCount` accept `branchId` and ignore it. Intra-tenant, not cross-tenant.

---

## 15 · Reality score

| Dimension | Score | Justification |
|---|---:|---|
| Workshop creation | **8**/10 | 13-step transaction, advisory lock, validator refuses invalid profiles, audit + snapshot. −2 for plan bypass and capability-blind catalog provisioning |
| Tenant isolation | **3**/10 | Lists and most detail reads correctly scoped; **proven cross-tenant writes to tasks, stock and money** with no global enforcement |
| Policy propagation | **8**/10 | Three axes proven at runtime. −2 for 8 dead finance fields |
| Branch architecture | **8**/10 | Real, scoped, plan-limited after creation |
| Warehouse architecture | **6**/10 | Real model; only the first store is stocked; created against plan and capability |
| Branch↔warehouse resolution | **7**/10 | Enforcement proven correct 4/4. −3 for zero-link skip, operator fallback, no shared resolver |
| Inventory integration | **6**/10 | Lifecycle and ledger real. −4 for cross-tenant issuance and the empty second store |
| Workshop Owner configuration | **6**/10 | 7 write surfaces real and persisted; 3 write to entities nothing consumes |
| Cross-system consistency | **5**/10 | Dual module truth; capability vs catalog contradiction; three warehouse resolvers |
| Runtime verification | **9**/10 | Every material claim executed. −1: UI layer not driven |
| **Overall** | **66**/100 | |

---

## 16 · Prioritized repair roadmap

*Description only. No implementation is proposed or begun.*

**P0 — Security / tenant data leak**
- WORKSHOP-GAP-001 cross-tenant task mutation
- WORKSHOP-GAP-002 cross-tenant payment
- WORKSHOP-GAP-003 cross-tenant part approval and stock issuance
- WORKSHOP-GAP-004 cross-tenant refund and discount decisions
- Structural: a single enforced ownership boundary, so this class cannot recur one service at a time

**P1 — Core workshop behaviour broken**
- WORKSHOP-GAP-005 cross-tenant job total
- WORKSHOP-GAP-006 plan ceilings bypassed at creation
- Warehouse-tenant validation in `issue()`, and removal of the zero-link skip

**P2 — Configuration not propagating**
- WORKSHOP-GAP-007 inventory provisioned against a disabled capability
- WORKSHOP-GAP-008 second warehouse never stocked
- WORKSHOP-GAP-009 dual module truth
- WORKSHOP-GAP-010 operator warehouse fallback

**P3 — System drift**
- WORKSHOP-GAP-011 dead configuration surfaces — wire or retire, page by page
- WORKSHOP-GAP-012 branch scope discarded in reports
- `InventoryTransfer` written when stock transfers
- An `OperationEvent` for workshop creation

**P4 — Missing evolution**
- Form-render path for `CustomFieldDefinition`
- Send path for `MessageTemplate`
- Specialization UI, or a decision to retire the subsystem
- A team created when `TEAMS` is enabled

**P5 — UI / UX only**
- Surface "this store has no stock yet" after multi-warehouse provisioning
- Show the plan ceiling on the Add Workshop structure step

---

## Appendix · Audit artefacts

Created in `mop_platform_dev` and left in place for re-verification. All names are namespaced `Audit …` / `audit-…`.

| Workshop | Slug | Shape |
|---|---|---|
| Audit Alpha | `audit-alpha-mttcd1k3` | Full Service plan · 2 branches (A1→W1, A2→W2) · all capabilities · `DELIVERY_BLOCKED_UNTIL_PAID=ALWAYS`, `TIME_TRACKING=REQUIRED` |
| Audit Beta | `audit-beta-mttcdelq` | Quick Service plan · 1 branch · INVENTORY/TEAMS/QC/TEAM_REVIEW/MULTI_* disabled · `TIME_TRACKING=OFF` |
| Audit Gamma | `audit-gamma-…` | Full Service · created solely to test inventory attacks against an inventory-enabled victim |

Mutations these experiments made to those tenants: Beta's audit task was started/completed/blocked by an Alpha account (B1–B3), Beta's audit invoice carries a ₤250 payment filed under Alpha (B5′), and Gamma's stock is one unit down with a part line billed by an Alpha account (B7′). These are the evidence, and should be deleted with the audit tenants.

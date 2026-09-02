# MOP — Permission and Authorization Model

> **Document ID:** DOC-20
> **Purpose:** how MOP decides whether an account may do a thing — the eleven-layer resolver, the 80 permission keys, and the four other mechanisms that also say no.
> **Authority:** ARCHITECTURAL.
> **Scope:** `apps/api/src/identity/access/`, `packages/shared/src/permissions/`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 05 (roles), 02 (capabilities — layer 5), 33 (security), 37 (gaps).

---

## 1. The failure this replaces

The previous implementation had *a named 10-stage permission hierarchy array that nothing ever iterated*, while a different ad-hoc resolver did the real work. Decorative abstraction: believable, visible and false.

> **The resolver is a literal ordered array that IS iterated, and tests assert both the ordering and the short-circuit behaviour.**

## 2. The chain

```
Tenant status
  → Plan entitlement
    → Module enabled
      → Feature enabled
        → Tenant capability
          → Workshop configuration
            → Platform control lock
              → Role permission template
                → Delegation
                  → User override
                    → Staff restriction
                      → Resource ownership (checked separately, in the controller)
```

## 3. The eleven layers, in evaluation order

Each layer returns `null` — *no opinion, defer* — or a real `LayerResult { allowed, locked, reason? }`.

The running decision starts at `DEFAULT_DECISION` (**deny**) and is overwritten by every non-null result in order. **Iteration stops the moment a layer returns `locked: true`**, so no lower layer can ever override a higher one's definitive answer. If every layer defers, deny stands.

| # | Layer | Kind | Answers |
|---|---|---|---|
| 1 | `PlatformControlLayer` | **ceiling** | Has the platform locked this role/permission for this tenant? |
| 2 | `PlanEntitlementLayer` | **ceiling** | Does the tenant's plan include this at all? |
| 3 | `TenantStatusLayer` | **ceiling** | Is the tenant frozen, suspended, read-only, archived? |
| 4 | `StaffRestrictionLayer` | **ceiling** | Is *this one account* under investigation? |
| 5 | `TenantCapabilityLayer` | **ceiling** | Does this workshop perform this function at all? |
| 6 | `ModuleEnabledLayer` | **ceiling** | Is the owning module on? |
| 7 | `FeatureEnabledLayer` | **ceiling** | Is the specific feature on? |
| 8 | `WorkshopConfigurationLayer` | narrows only | Workshop-level narrowing |
| 9 | `DelegationLayer` | narrows only | Has the owner handed this over at all? |
| 10 | `RolePermissionTemplateLayer` | tenant default | Does this role hold it? |
| 11 | `UserOverrideLayer` | most specific | This account's own grant or denial |

### The three orderings that carry real weight

**Capability above role and user (5 before 10 and 11).**

> A permission must never be able to resurrect a function the workshop does not perform.

Granting `inventory.request.issue` in a workshop with no inventory **still denies.** Without this ordering, the whole capability model becomes decoration — a hidden button that a permission grant can un-hide.

**Delegation above the role template (9 before 10).** Team management is the owner's. A role template that offers `team_setup.branch.manage` must not be able to hand it over *on the owner's behalf*. That is why the Branch Manager template carries the key as `true` and the manager still cannot use it: the template says *this role would do this if allowed to*; the delegation layer says *whether anyone but the owner may at all*.

**Staff restriction beside tenant status (4).** A true ceiling, scoped to one account rather than the whole tenant — an owner or the platform investigating one person must never need a tenant-wide freeze to curtail that one person.

## 4. Purity and cost

**Layers are pure functions over a `PermissionContext` loaded once per request. None of them queries the database.**

Six of the original nine did, which meant resolving ten permission keys for one page cost sixty round-trips on the hottest path in the system. `PermissionContextService` loads the snapshot; `resolveMany` answers many keys against it, so **asking for ten permissions costs the same queries as asking for one.**

Purity has a second payoff: each layer is trivially testable — a snapshot in, a decision out, no Prisma stub, no async. Every layer has its own `.spec.ts`.

## 5. The permission key

**Convention:** `{resource}.{scope?}.{action}` — all lowercase, dot-separated. The resource segment need not match the module name.

**80 keys today**, each declared in `permission-manifest.ts` with the coarse product **module** it belongs to: `PLATFORM` · `ORGANIZATION` · `OPERATIONS` · `FINANCE` · `INVENTORY` · `TEAM_MANAGEMENT` · `REPORTS` · `AUDIT` · `CUSTOMER_PORTAL`.

Module and resource are **different granularities**, and the mapping is explicit rather than derived from the key text. Splitting the key string was tried and rejected: it would have made `task.*` and `inspection.*` register as two independently togglable modules when the spec toggles them together as one `OPERATIONS` module.

The manifest is **deliberately not exhaustive**. A key declared ahead of the page that will use it is normal and expected.

### The lint rule

`tools/lint-permission-keys.mjs` checks that every permission-key **string literal that reaches the resolver** is a declared key. `can(session, permissionKey: string)` takes a bare `string` — deliberately, since a couple of call sites build the value at runtime — so TypeScript alone cannot catch `"finance.invoice.isue"`.

It does **not** flag a declared key that nothing checks. That is stated in the tool's own comment as intentional.

## 6. The 80 keys

| Module | Keys |
|---|---|
| **PLATFORM** (5) | `platform.workshop.create` · `platform.workshop.view` · `platform.control_center.access` · `platform.live_view.access` · `platform.reports.view` |
| **ORGANIZATION** (4) | `organization.access.manage` · `organization.forms.manage` · `organization.messages.manage` · `organization.workflow_health.view` |
| **OPERATIONS** (17) | `workorders.branch.{view,reassign_technician,manage_blockers,release_delivery}` · `workorders.review.decide` · `workorders.qc.decide` · `customer.intake.create` · `decisions.branch.view` · `customer_decision.{create,send,record_on_behalf}` · `task.{view_assigned,finish_attempt,complete}` · `inspection.{quick.create,full.create,codes.view}` · `blocker.report` · `notes.create` |
| **FINANCE** (9) | `finance.configuration.manage` · `finance.invoice.{view,issue}` · `finance.payment.record` · `finance.running_invoice.add_line` · `finance.discount.{request,decide}` · `finance.refund.{request,decide}` |
| **INVENTORY** (16) | `inventory.home.view` · `inventory.requests.view` · `inventory.request.{create,approve,issue,reject,mark_unavailable}` · `inventory.catalog.manage` · `inventory.cost.view` · `inventory.stock.{view,adjust}` · `inventory.stock.return.{accept,reject,clarify}` · `inventory.movements.view` · `inventory.warehouse.manage` · `inventory.transfer.create` · `inventory.supplier_order.create` |
| **TEAM_MANAGEMENT** (6) | `team.home.view` · `team.technicians.view` · `team.workorders.view` · `team.supervision_note.create` · `team.issue.flag_to_branch_manager` · `team_setup.branch.manage` |
| **REPORTS** (13) | `dashboard.owner.view` · `reports.{owner,company,team,inventory}.view` · `analytics.{home,operations,people,inventory,decisions,feature_adoption}.view` · `analytics.saved_views.manage` · `analytics.export` |
| **AUDIT** (1) | `audit.own_tenant.view` |
| **CUSTOMER_PORTAL** (5) | `customer.portal.view` · `customer.asset.view_own` · `customer.service.view_own` · `customer.invoice.view_own` · `customer.history.view_safe` |

## 7. The baseline role map

`DEFAULT_ROLE_PERMISSIONS` is seeded as real `RolePermission` rows for every new tenant. It is deliberately **not exhaustive**: a key with no entry gets no seeded row, the template layer defers, and the resolver's deny-by-default settles it. There is nothing unsafe about an absent row, so only keys with a confidently-known default belong there.

**Explicit `false` entries are documentation, not redundancy.** Omitting the key would already deny it; writing `false` records that the denial is *deliberate*, with a comment naming the spec section that requires it:

| Role | Key | Why written `false` |
|---|---|---|
| `TECHNICIAN` | `finance.running_invoice.add_line` | *Not automatically granted* — the owner delegates |
| `TECHNICIAN` | `finance.discount.request` | Same discipline |
| `BRANCH_MANAGER` | `finance.invoice.issue`, `finance.payment.record` | Money is Owner-only unless delegated |
| `BRANCH_MANAGER` | `finance.refund.decide`, `finance.discount.decide` | May **request**; deciding stays with the Owner |
| `INVENTORY_MANAGER` | `inventory.cost.view` | **Managing the catalogue does not imply seeing margin** |

## 8. The four other mechanisms that say no

The resolver is not the only gate, and a reader who assumes it is will design the next feature wrongly.

| Mechanism | Where | Applies to |
|---|---|---|
| **`PlatformGuard`** | `identity/auth` | Platform sessions. **Deliberately bypasses the resolver** — every layer defers with no `tenantId`, and per the spec Super Admin has unconditional control. The check is *are you a platform account, yes or no* |
| **`session.accountType`** | Customer portal controllers | Customer sessions. The resolver has no real opinion about them |
| **Resource ownership** | The controller | `requireTechnician` also asserts the job is this technician's; `requirePartOnMyJob` likewise. **A permission is not a claim about a specific record** |
| **Scope** | `ScopeResolverService` | Branch and category scope narrow *what rows you see*, not *what actions you may take*. Team Leader adds `managedTechnicianIds` |

## 9. Keys with no production consumer

20 of 80 keys are never checked by production code. Three distinct causes — only the third is a defect.

**By design — `PlatformGuard` covers them (5).**
`platform.workshop.create` · `platform.workshop.view` · `platform.control_center.access` · `platform.live_view.access` · `platform.reports.view`
The guard is a legitimate mechanism. But the keys imply a granularity within the platform role that does not exist, and a future reader may assume it does.

**By documented deviation — customers bypass the resolver (5).**
`customer.portal.view` · `customer.asset.view_own` · `customer.service.view_own` · `customer.invoice.view_own` · `customer.history.view_safe`
Owed as a permission-engine rework.

**Genuinely orphaned (5), plus 5 more checked only in tests.**

| Key | Situation |
|---|---|
| `workorders.branch.reassign_technician` | **No reassignment endpoint exists** |
| `workorders.branch.manage_blockers` | **No blocker-clearing endpoint exists**, though `resolveBlocker` is implemented and tested |
| `team.issue.flag_to_branch_manager` | No endpoint |
| `inventory.transfer.create` | No transfer endpoint, no graph states |
| `inventory.supplier_order.create` | No supplier-order endpoint |
| `decisions.branch.view` | The Approvals queue does not check it |
| `inspection.codes.view` | No consumer |
| `finance.invoice.view` | Referenced only in tests |
| `inventory.stock.view` | Referenced only in tests |
| `inventory.stock.adjust` | Referenced only in tests; no adjustment endpoint |

Carried in doc 37 as **G-PERM-01..03**.

## 10. The client side

`apps/web/src/app/identity/access.api.ts` calls `GET /access/check`. It is used to **shape the interface**, never to enforce anything:

- A control the user may never reach is **absent, not disabled** — a greyed-out control invites a support ticket; an absent one does not exist.
- **Restricted data is absent from the response.** If it is in the payload and hidden by CSS, it has already leaked.
- The browser's answer is a convenience. **The server checks again, every time.**

## 11. Implementation status

| Element | Status |
|---|---|
| Eleven-layer ordered array, actually iterated | ✅ `[VERIFIED]` |
| Deny-by-default; `locked` short-circuit | ✅ `[VERIFIED]` |
| Capability above role and user override | ✅ `[VERIFIED]` |
| Delegation above the role template | ✅ `[VERIFIED]` |
| Pure layers over a per-request context; `resolveMany` | ✅ `[VERIFIED]` |
| 80 keys with module mapping, lint-enforced | ✅ `[VERIFIED]` |
| Baseline role map with deliberate `false` entries | ✅ `[IMPLEMENTED]` |
| Platform role permission locks, audited with a reason | ✅ `[INTEGRATED]` |
| Staff restriction layer | 🟡 — layer real; `restrict`/`lift` have **no endpoint** |
| `CUSTOMER` sessions inside the resolver | 🔴 `[INTENDED]` — G-SEC-02 |
| Platform sessions inside the resolver | 💤 deliberate — `PlatformGuard` is the mechanism |
| 10 genuinely orphaned or test-only keys | ⚠️ G-PERM-01..03 |

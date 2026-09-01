# 03 — Capability Engine Audit

**Sources:** `packages/shared/src/capabilities/*` (read fully), consumers in `apps/api/src` (traced), `apps/web` (nav/permission mirror).

## 1. The registry — 12 capabilities

| Capability | Tier of removal | Owns gate(s) | Depends on | Removal behavior (what the process becomes) | Verified runtime effect |
|---|---|---|---|---|---|
| MULTI_BRANCH | DROP_STEP | – | – | branchId column retained; BRANCH_MANAGER orphaned→READ_ONLY_ROLE | role/permission layering; scoping convention |
| MULTI_WAREHOUSE | DROP_STEP | – | INVENTORY | HIDE_ROLE for extra warehouses | warehouse surfaces |
| INVENTORY | REROUTE | `parts.received_used_or_returned` | – | WAITING_PARTS disabled; parts-wait becomes Blocker reason `WAITING_PART`; customer-safe message supplied; INVENTORY_MANAGER REQUIRE_REASSIGNMENT | **verified**: PartRequest entity never created when off (`part-request.service.ts:76` requires capability); graph skips PART_REQUEST_GRAPH entirely; gate dropped via `gatesOwnedBy` |
| PART_RETURNS | DROP_STEP | `parts.no_pending_return` | INVENTORY | return states disabled; REQUIRE_MANUAL_RESOLUTION | gate liveness + edge removal |
| EXTERNAL_PARTS | DROP_STEP | `parts.external_resolved` | – | own gate dropped | gate liveness |
| TEAMS | DROP_STEP | – | – | PRESERVE_READ_ONLY supervision history; REQUIRE_REASSIGNMENT | team-leader surface denial |
| TEAM_REVIEW | REROUTE | `review.team_review_passed` | TEAMS | READY_FOR_TEAM_REVIEW disabled; MIGRATE_TO_TERMINAL | finish routing changes |
| QC | REROUTE | `qc.passed` | – | READY_FOR_QC/QC_FAILED disabled; MIGRATE_TO_TERMINAL | finish routing changes |
| CUSTOMER_PORTAL | REROUTE | *(none, deliberately)* | – | SENT/VIEWED/PARTIALLY_RESPONDED disabled; **adds** PENDING→RESOLVED and PENDING→EXPIRED counter edges | decision channel switching |
| FINANCE_CORE | EXTERNALIZE | `payment.settled_or_policy_allows` | – | PAYMENT_PENDING disabled; **adds** IN_PROGRESS→READY_FOR_DELIVERY and review→delivery FINISH edges | delivery without internal money |
| BILLING | EXTERNALIZE | `invoice.issued` | FINANCE_CORE | External Billing Mode; EXTERNAL_REFERENCE_ONLY history | document suppression verified in `billing.service.ts` |
| QUICK_INSPECTION | DROP_STEP-that-drops-nothing | – | – | inspection_completed stays core | label-level only |

**Registry honesty notes:** every `conflicts: []` is empty (CONFLICT code unreachable in production); no capability is CORE (`CORE_CAPABILITY_DISABLED` fires only against injected registries in tests). Both facts are fine but mean two validator codes are effectively test-only.

## 2. Resolution chain (definition → runtime effect)

```
registry.ts / workflow-graphs.ts        (definitions, pure)
  → TenantCapability rows (time-ranged)  (storage)
  → CapabilityResolutionService.resolveCurrent / resolveAsOf
      → EffectiveAccessService layers:
          PlatformControl → Plan → TenantStatus → StaffRestriction
          → TenantCapability (LOCKED deny) → ModuleEnabled → Feature
          → WorkshopConfig → Delegation → RoleTemplate → UserOverride
          (11 layers; deny-by-default; locked short-circuit)
      → WorkOrderLifecycleService.routingContext()
          resolveIntent(WORK_ORDER_GRAPH, profile, status, intent, policies, facts)
      → GateEvaluatorService.isLive() drops gates whose owner is inactive
```

- Absent key ⇒ ENABLED ("a profile records deviations") — central convention, `isCapabilityActive()`.
- "A permission can never resurrect a disabled capability": `capabilityForPermissionKey()` map consumed at `tenant-capability.layer.ts:31`. Chain verified.
- Change pipeline: `POST /platform/workshops/:id/capabilities/{preview,apply}` re-runs `validateCapabilityProfile()` server-side (:82), counts real stranded records before applying, writes time-ranged row + audit in one tx. Effect immediate next request (no cache anywhere).

## 3. The reachability guarantee — real

`validator.ts`: static integrity (dependencies, conflicts, core check, gate ownership via the *gate registry* rather than self-declared lists — the anti-drift move that killed a historic Inventory/PartReturns double-drop) then per-graph BFS forward-reachability from initial + backward reachability to terminals over edges filtered by capability-active `requires` plus removal-policy replacement edges. Codes: STRANDED_STATE / DISABLED_STATE_REACHABLE / TERMINAL_UNREACHABLE / GATE_NOT_OWNED etc. CI runs it against all 7 shipped profiles. Known safe over-approximation: replacement-edge policy/fact conditions ignored by the validator (router still honors them); currently harmless.

## 4. Do capabilities affect…?

- **Permissions:** yes (locked deny above roles).
- **Pages:** yes indirectly — nav rails are static but all data/actions deny; landing resolution per role.
- **Modules:** yes — `enabledModules` derived from profile at creation (`modulesForProfile`), enforced by layer.
- **Workflow:** yes — live edge filtering + reroute replacement edges; this genuinely rewires graphs per workshop.
- **Database behavior:** partially — entity *creation* gated (PartRequest), historical interpretation via `resolveAsOf` (dossier shows capability shape at open time).
- **API behavior:** yes — 403s with distinct codes; gate results carry human blockedMessages.
- **Combinations validated:** yes — statically per profile, exhaustively across policies×facts by `validatePolicyGraphSafety()`.

## 5. Label-only capabilities?

None are pure labels, but **QUICK_INSPECTION** is the thinnest (drops nothing; inspection remains core regardless) and **MULTI_WAREHOUSE**'s effect is largely presentational given single-warehouse shops keep one hidden warehouse row anyway (Rule 2: data shape never changes).

## 6. Verdict

**The capability engine is the most genuine subsystem in MOP** — definitions, validation, storage, resolution and consumers all exist and compose, with CI-grade tests including the six required smart-delete cases. Its one systemic caveat: it rewires workflows whose early intents have no triggers (Report 01 §2.2), so its most impressive guarantees protect a journey the product cannot yet start on its own.

Maturity: engine Operational · storage Operational · enforcement Operational · combination safety Operational · downstream product effect limited by spine break.

# 02 — Workshop Creation Readiness Audit

**Question:** does Workshop Creation actually construct a meaningful operational workshop, or mostly configuration records around an otherwise generic system?

**Short answer:** it constructs a *genuinely shape-forming* configuration — capabilities, policies, modules, gates and permissions are evaluated at runtime by every request, so two workshops created with different drafts demonstrably behave differently (verified in code on both sides of the wire). But the shaping acts on an operational spine whose early stages have no triggers (see Report 01 §2.2), so the differentiation is currently proven more strongly in reads/permissions/routing than in a completable job cycle.

---

## 1. The creation pipeline as it exists

UI: `apps/web/src/app/experiences/platform/onboarding/*` — 9 stage components + rail + review/consequences/policy-impact components, one route-scoped `OnboardingStore` (`onboarding.store.ts`) holding `WorkshopDraft` **in memory only** (refresh loses it; deliberate, documented at `onboarding-page.ts:34–38`).
API: `OnboardingController` (`GET /platform/onboarding/blueprint`, `POST .../validate` — unused by UI), `PlatformController.createWorkshop` → `PlatformService.createWorkshop` (:118) → `attemptCreateWorkshop` (:184) — one `$transaction`.

### Stage-by-stage

| Stage | What exists | What is stored | What is enforced at runtime | Downstream reaction |
|---|---|---|---|---|
| IDENTITY | name/slug/country from 127-entry registry (`countries.ts`) deriving currency/timezone; email/phone; availability checks (courtesy endpoints) | `Tenant`, owner `Account` (INVITED, sha256 invite hash 14d) + `StaffUser` TENANT_OWNER | login blocks FROZEN/SUSPENDED/ARCHIVED/PENDING_SETUP (`auth.service.ts:26`) | tenant status drives `TenantStatusLayer` |
| PLAN | plan row selection; ceilings maxBranches/maxUsers/maxWarehouses/allowedExports | `Tenant.planId`; `PlanLimitsService` asserts capacity **ongoing** (branch/warehouse/staff create paths) | `PlanEntitlementLayer` (modules, exports); ceilings → real 403s | analytics export double-gated |
| CAPABILITIES | 12-capability profile w/ cascades via shared `applyCapabilityChange()`; browser preview = server truth (same pure engine both sides) | `TenantCapability` deviation rows only (absent ⇒ ENABLED), time-ranged | `TenantCapabilityLayer` hard-deny; workflow router filters edges; gate liveness drops owned gates | pages, permissions, graphs all change (Report 03) |
| SPECIALIZATION | 7 packs / 11 cards (`specialization-packs.ts`), category-filtered | `SpecializationDefinition` rows via `defineCard` | **nothing** — no consumer reads values back | metadata only (Report 04) |
| POLICIES | question set derived from capability profile (`applicablePolicies()`); defaults with reasons; stranded-answer pruning | `WorkshopPolicy` deviation rows only (defaults omitted) | 16 consumers read values per-request (`resolveValue`) — Report 05 | workflow edges narrow (4 edge policies), finance flags materialize |
| RESPONSIBILITY | 3 questions mapping capabilities→roles; `grantsForResponsibilities()` moves only positive grants, never laundered denials | extra `RolePermission` upserts | role layer + capability layer compose | prevents orphaned INVENTORY/TEAMS/MULTI_BRANCH operators |
| STRUCTURE | branches (≥1 fallback MAIN), warehouses, branch⇄warehouse matrix | `Branch`,`Warehouse`,`BranchWarehouseAccess`; plan-ceiling checked | branch scoping is manual `branchId IN scope` convention (empty = everything) — Report 11 | board/delivery/intake scope |
| SERVICES | price catalog entries (minor-unit strings) | `PriceCatalogEntry` effective-dated rows | Finance resolves prices; tasks with unknown serviceKey refused (`technician-work.service.ts:78–88`) | billing amounts real |
| REVIEW | shared `validateDraft` BLOCKER/WARNING list; publish = create | `TenantConfiguration` (enabledModules derived via `modulesForProfile` — cannot disagree with capabilities), `FinanceConfiguration` (delivery-gate flags, visibility, external-billing), baseline RolePermission+RolePage for **all 7 roles regardless of shape** (deliberate: capability layer blocks at runtime — comment platform.service.ts:531–537), `TenantConfigurationVersion` v1 snapshot, HIGH audit row | modules layer denies non-enabled modules | audit/history |

Publish is atomic and idempotent-ish (registration-code collision retry ×3, P2002 translation). Owner receives raw invite link because no mail transport exists.

## 2. The pointed questions

**Does creation produce different runtime behavior?** Yes — through *evaluated configuration*, not divergent provisioning:
- Permissions: same baseline rows everywhere, but `TenantCapabilityLayer` + `ModuleEnabledLayer` deny differently per profile (locked short-circuit above roles).
- Workflow: router computes live edges from profile+policies+facts; e.g. QC-off jobs finish straight to payment; portal-off adds counter edges PENDING→RESOLVED.
- Gates: inventory-owned gates die with INVENTORY; delivery gate reads materialized `FinanceConfiguration`.
- Pages: nav rails static but every action 403s correctly; landing per role.

**What happens when a capability is disabled post-creation?** Platform-only endpoint re-validates reachability (shared validator), writes time-ranged rows, audited; effect immediate next request (no cache). Existing sessions not revoked — acceptable since layers read live.

**Responsibility with no actor?** Creation refuses to publish while an enabled capability has no operator (`operator-orphan` blocker in `validateDraft`). Post-creation there is no re-check — deactivating the only storekeeper later strands part approvals (visible in Approvals queue only as unapproved items).

**Incompatible policy combinations?** No pairwise option validation exists; safety is guaranteed structurally instead: `graph-safety.ts` exhaustively walks profile × option-combos × facts proving no stranded states, and relevance predicates hide questions that don't apply. Impossible workshops are prevented at graph level, not questionnaire level.

**After creation?** Owner invite → accept → lands `/owner`. Runtime matches configuration (verified by reading both sides; PROJECT_STATE records a manual browser verification 2026-08-20).

## 3. Verdict

**Real configuration engine, honestly implemented; not decorative.** Gaps that matter:
1. Draft persistence absent (memory-only wizard).
2. Policies immutable after creation despite GOVERNED mutability labels.
3. Permission tables identical for every workshop — shape comes from runtime evaluation; defensible, but it means "what does this role see" requires simulating layers mentally or in tests.
4. Specialization stage seeds rows nothing consumes (stage is ceremony today).
5. The shaped workflows cannot be driven past REGISTERED by the product itself (Report 01) — the strongest config engine wrapped around a stalled spine.

Maturity: **Creation pipeline Operational · Specialization stage Metadata-only · Policy mutability Partial · overall the best-engineered subsystem in the repo.**

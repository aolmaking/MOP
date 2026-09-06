# 10 — Configuration Combinatorics / Variability Audit

**Question:** can Capability × Specialization × Policy × Responsibility choices combine without contradictions, dead ends, or unavailable actors?

**Method:** the architecture was tested against representative configurations by reading the exact code paths each choice affects (graphs, gates, layers, materialized flags), plus the CI-grade exhaustive walk that exists in-repo (`graph-safety.ts` covers profile × every option-combination of the 4 edge policies × fact-powerset × all graphs).

## 1. Representative configurations

### Config 1 — Single-bay quick service (INVENTORY off, TEAMS/QC/TEAM_REVIEW off, portal on, defaults)
Expected: no parts anywhere; finish goes straight to payment; counter approval edges exist.
Actual: PartRequest entity never created (`part-request.service.ts:76` requires INVENTORY); PART_REQUEST_GRAPH skipped in validation; inventory gates die via `gatesOwnedBy`; FINISH intent resolves to PAYMENT_PENDING edge; portal adds PENDING→RESOLVED/EXPIRED. **Coherent.**
Residual dead ends: abandoned decisions still block `customer_decisions_resolved` (no EXPIRED writer); job progression break (Report 01) applies regardless.

### Config 2 — Full dealership (everything on, TWO_TIER approvals, MANDATORY_ALWAYS QC, REVIEW_REQUIRED tech send)
Expected: review→QC→payment chain with critical-ack modal and routed finish.
Actual: graph narrows exactly so (edges :116–168); facts gate RISK paths; acknowledgement enforced server-side. **Coherent — for jobs that reach IN_PROGRESS.** They cannot via UI (spine).

### Config 3 — External finance + external billing
FINANCE_CORE=EXTERNAL, BILLING=EXTERNAL: PAYMENT_PENDING disabled, replacement FINISH edges added; billing suppresses documents; delivery gate's payment gate satisfied by design; P-01 still asked (object-form relevance).
**Coherent**, and the only configuration where a tenant is not `compliantBlocked`.

### Config 4 — Inventory ON but no storekeeper hired; responsibility answered "owner"
Creation refuses publish (operator-orphan blocker). Post-creation: owner holds moved grants (`grantsForResponsibilities` never launders denials like `inventory.cost.view`). If the storekeeper is later deactivated: part approvals strand in queue — **no ongoing operator-orphan check**. Dead end possible after creation.

### Config 5 — Policy miscombination probes
P-08 WARN_ONLY + returns pending → gate downgraded, finish allowed with open returns (intended loosening, reachability-safe per exhaustive walk). P-07 DIFFERENT_PERSON with single storekeeper → self-approval refused; if storekeeper also requests… request comes from technician side, so approver≠requester holds unless tech IS storekeeper (possible in tiny shops ⇒ real deadlock option; policy warns via question copy, nothing structural blocks choosing it).
No pairwise validator exists; safety is graph-level only. **Impossible workshops are prevented; inconvenient ones are not.**

### Config 6 — Plan ceilings vs structure choices
maxBranches=1 with MULTI_BRANCH enabled: creation allows (capability ≠ usage), ongoing asserts block second branch with clear 403s. Coherent but UX-surprising; no draft-time cross-check of capability-vs-plan contradiction beyond counts.

## 2. Cross-cutting findings

1. **Composability is genuinely engineered** — the four axes interact through typed conditions (`requires`, `requiresPolicy`, `relevantUnder`, grants), validated statically and exhaustively; this is rare and real.
2. **Specialization contributes nothing to any combination** (Report 04).
3. **Responsibility axis is creation-only**: post-creation staffing changes can orphan capabilities silently.
4. **Policy mutability axis missing**: combinations are safe to *choose* but effectively impossible to *change* later (no setter endpoint).
5. **The spine break dominates**: every configuration inherits Cycle C's stranding; differentiation below REGISTERED is unobservable in live usage today.
6. Actor availability inside workflows (e.g., who can press APPROVE once it exists) is undesigned territory — permission keys exist (`workorders.review.decide`) but intent ownership doesn't.

## Verdict

Architecture: composable, proven at graph level. Product: one shared blocker (spine) plus three composition gaps (operator orphaning over time, policy immutability, specialization inertness). Different configurations produce genuinely different permissions/gates/routing/pages — different *completable businesses*, not yet.

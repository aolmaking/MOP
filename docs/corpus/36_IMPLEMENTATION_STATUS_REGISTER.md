# MOP — Implementation Status Register

> **Document ID:** DOC-36
> **Purpose:** the current-state document — for every significant element, how far along the chain it actually is.
> **Authority:** STATUS. Volatile by nature; **cite the canonical trackers rather than duplicating them.**
> **Scope:** subsystems, capabilities, policies, pages, features, APIs, tests.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Canonical trackers this file cites and does not duplicate:** [`../PAGE_INVENTORY.md`](../PAGE_INVENTORY.md) (page completion) · [`../PHASE_MAP.md`](../PHASE_MAP.md) (phase status) · [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) (session history) · [`../AUTONOMOUS_EXECUTION_STATE.md`](../AUTONOMOUS_EXECUTION_STATE.md) (the live work queue).
> **Related:** 37 (gaps), 35 (journeys), 17 (features).

---

## 1. The five stages

| Stage | Means |
|---|---|
| **Designed** | A design record exists |
| **Implemented** | Code exists |
| **Integrated** | A real user reaches it through a real page and endpoint, and the downstream effect lands |
| **Verified** | A named test or recorded run proves it |
| **Production-ready** | Verified + multi-tenant-safe + permission-correct + audited + performant at real sizes |

> **Implemented is not Integrated.** This project's record contains four finished systems that shipped with no door and six domain commands that still have none.

---

## 2. Headline

| | |
|---|---|
| **Pages** | 47 ✅ · 6 🟡 · **0 ⬜** of 53 — *canonical: `PAGE_INVENTORY.md`* |
| **Capabilities** | 12 / 12 implemented, validated in CI |
| **Policies** | 16 / 16 `ENFORCED` with named, CI-asserted consumers |
| **Permission keys** | 80 declared · 60 checked in production · **20 unconsumed** |
| **Endpoints** | 132 across 30 controllers |
| **Domain commands with no endpoint** | **6** |
| **Tests** | 871 API · 243 shared · 272 web; 62 real-Postgres integration |
| **Golden journeys** | 6 ✅ · 2 🟡 · **2 ⚠️ blocked** |
| **Phases** | 12 ✅ · 6 🟠 · 3 partial — *canonical: `PHASE_MAP.md`* |

---

## 3. Subsystems

| Subsystem | Designed | Implemented | Integrated | Verified | Prod-ready | Note |
|---|:--:|:--:|:--:|:--:|:--:|---|
| Capability engine | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Policy engine | ✅ | ✅ | ✅ | ✅ | 🟡 | No Owner-facing post-creation editor |
| Permission resolver | ✅ | ✅ | ✅ | ✅ | 🟡 | Customer sessions outside it |
| Workflow engine | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Operations | ✅ | ✅ | 🟡 | ✅ | ❌ | Task creation and blocker resolution have no door |
| Inventory | ✅ | ✅ | 🟡 | ✅ | ❌ | Four commands have no door; 4 unreachable statuses |
| Finance Core | ✅ | ✅ | ✅ | ✅ | 🟡 | Rounding rule unnamed |
| Billing | ✅ | ✅ | ✅ | ✅ | ❌ | **No country adapter — every real country is compliance-blocked** |
| People & Performance | ✅ | ✅ | 🟡 | ✅ | 🟡 | Specialisation and credentials have no consuming page |
| Customer | ✅ | ✅ | ✅ | ✅ | 🟡 | Authorization outside the resolver |
| Forms | ✅ | ✅ | 🟡 | ✅ | ❌ | Authoring only; nothing captures values |
| Messaging | ✅ | ✅ | 🟡 | ✅ | ❌ | **No transport at all** |
| Governance | ✅ | ✅ | 🟡 | ✅ | 🟡 | Staff restriction and disputes have no surface |
| Tenant relationships | ✅ | ✅ | ❌ | ✅ | ❌ | Modelled and tested, **no surface** |
| Platform | ✅ | ✅ | ✅ | ✅ | 🟡 | Builder Control's broader scope unbuilt |
| Insights | ✅ | ✅ | ✅ | ✅ | 🟡 | No date-range UI; platform reports partial |
| Audit | ✅ | ✅ | ✅ | ✅ | 🟡 | No retention policy |
| Runtime | ✅ | ✅ | ✅ | ✅ | 🟡 | Translation pass never done |

---

## 4. Capabilities — 12 / 12

Every one is implemented with a complete removal policy and validated against every shipped profile in CI. `MULTI_BRANCH` · `MULTI_WAREHOUSE` · `INVENTORY` · `PART_RETURNS` · `EXTERNAL_PARTS` · `TEAMS` · `TEAM_REVIEW` · `QC` · `CUSTOMER_PORTAL` · `FINANCE_CORE` · `BILLING` · `QUICK_INSPECTION` — all **Verified**.

## 5. Policies — 16 / 16 `ENFORCED`

All sixteen name real consumers, asserted against the source tree by `policy-consumers.spec.ts`. Three carry an **honest partial** inside an otherwise-enforced policy — the option exists and behaves conservatively rather than silently doing nothing:

| Policy | Partial |
|---|---|
| `DELIVERY_BLOCKED_UNTIL_PAID` | `REQUIRES_OVERRIDE` blocks like `ALWAYS`; the audited release action is unbuilt |
| `UNCOVERED_COUNTRY_BILLING` | `BLOCK_WITH_OVERRIDE` refuses; the platform exception is unbuilt |
| `APPROVAL_REQUIRED_SCOPE` | Routing is real; the **scope-delta derivation** is not — staff still choose which items are decision-worthy |

## 6. Roles

| Role | Pages | State |
|---|---|---|
| Platform Super Admin | 6 | 4 ✅ · 2 🟡 |
| Branch Manager | 7 | 7 ✅ — two orphaned permissions |
| Technician | 3 | 3 ✅ — four commands with no door |
| Inventory Manager | 6 | 6 ✅ — queue cannot be filled from the technician side |
| Team Leader | 4 | 4 ✅ |
| Tenant Owner | 8 | 4 ✅ · 4 🟡 |
| Data Analyst | 7 | 7 ✅ |
| Customer | 6 | 6 ✅ — authorization outside the resolver |

## 7. The six domain commands with no endpoint

**The highest-value, lowest-cost work in the product.** Each is implemented and tested.

| Command | Consequence | Gap |
|---|---|---|
| `TechnicianWorkService.resolveBlocker` | **A blocked job can never be finished** | G-OPS-01 |
| `TechnicianWorkService.createTask` | **Tasks exist only in the demo seed** | G-OPS-03 |
| `PartRequestService.requestReturn` | The Returns queue cannot be filled | G-INV-02 |
| `PartRequestService.respondToClarification` | The clarify loop has no reply | G-INV-03 |
| `PartRequestService.markArrived` | A travelled part cannot be confirmed | G-INV-04 |
| `PartRequestService.resolveRejectedReturn` | A rejected return cannot be closed out | G-INV-05 |

Plus subsystems with no surface at all: tenant relationships, staff restriction, work-order disputes, specialisation entry-filling, credentials, position taxonomy.

## 8. Permission keys — 80

| | Count |
|---|---|
| Checked in production | 60 |
| Covered by `PlatformGuard` by design | 5 |
| Covered by `accountType` (documented deviation) | 5 |
| **Genuinely orphaned** | **7** |
| Referenced only in tests | 5 |

Orphaned: `workorders.branch.reassign_technician` · `workorders.branch.manage_blockers` · `team.issue.flag_to_branch_manager` · `inventory.transfer.create` · `inventory.supplier_order.create` · `decisions.branch.view` · `inspection.codes.view`

## 9. Cross-cutting mechanisms

| Mechanism | State |
|---|---|
| Single status writer | ✅ — convention + review, **no lint rule** |
| Single audit writer | ✅ **lint-enforced** |
| Money as string | ✅ **lint-enforced** |
| Permission keys declared | ✅ **lint-enforced** |
| No directional CSS | ✅ **lint-enforced** |
| Touch targets | ✅ **lint-enforced** |
| No hard delete | ✅ **lint-enforced** |
| Reachability validator | ✅ CI |
| Policy graph safety | ✅ CI |
| Policy consumers exist | ✅ CI |
| Event vocabulary declared in one place | ✅ |
| **Event union enforced on the emit path** | ❌ G-EVT-01 — `eventKey: string`; 4 undeclared keys emitted today |
| Exhaustive capability copy | ✅ types |
| **A door check for domain commands** | ❌ — the one missing mechanism |

## 10. What "production-ready" is still waiting on

In priority order — the first is a compliance blocker, the next three trap real work.

1. **A country billing adapter (ZATCA / ETA).** Without one, every real country is compliance-blocked. `[INTENDED]`
2. **The six missing endpoints.** Two golden journeys are blocked and one is partial. `[IMPLEMENTED]`, needing only a door.
3. **Enum ↔ graph parity for `PartRequestStatus`.** Four statuses are read by live code and written by nothing.
4. **The message transport.** Templates are complete; nothing sends.
5. **Value capture for forms and specialisation.** Authoring is complete; nothing records.
6. **Customer sessions inside the permission resolver.**
7. **The platform-lock mechanism** — three Owner/Platform pages wait on this one piece.
8. **The translation pass.** The RTL mechanism is real; the strings are not translated.
9. **Retention for `AuditLog` and `OperationEvent`.**
10. **End-to-end browser tests**, plus a CI scan for door-less commands.

## 11. How to update this register

- **Never upgrade a stage without its evidence.** `[VERIFIED]` names its test or recorded run; `[INTEGRATED]` names the page and the endpoint.
- **Cite the canonical tracker** for page counts and phase status rather than repeating a number here — three trackers once disagreed (23/53, 34/53, 48/53) because each kept its own.
- **A gap discovered here gets an id in doc 37** in the same pass.
- **Never change product behaviour to make this table look better.**

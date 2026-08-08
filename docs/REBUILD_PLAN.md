# Rebuild — Decision Record

> ⚠️ **This is not the plan.** The live plan is [`PHASE_MAP.md`](./PHASE_MAP.md).
> This file records *how the rebuild started and why the architecture is shaped the way it is* — the decisions that would otherwise be re-litigated every few weeks. It is history plus rationale, not a task list.
> **Date:** 2026-08-08.

---

## 1. The rebuild was already underway

The instruction that started this work was *"the whole project needs to be rebuilt totally."* That was correct about **v11.9** and wrong about this repository — because the rebuild it asked for had already begun.

| Commit | What happened |
|---|---|
| `a38b9af` | Initial commit — the v11.9 build |
| `b0a4e68` | **Remove v11.9 implementation to rebuild from canonical spec** |
| `6297054` | Canonical spec + gap analysis committed as source of truth |
| `1c55066` | Data model drafted from the full spec |
| `0331351`…`51d4a70` | API foundation, interleaved with the 9 detailed role specs |

None of the files `GAP_ANALYSIS_CANONICAL_SPEC.md` criticises still exist — `builder.service.ts`, `technician.service.ts`, `team-review.component.ts` and the rest were removed at `b0a4e68`. **Read that gap analysis as the record of why the rebuild happened, not as a description of current code.** Reading it without checking git history makes the present codebase look far worse than it is.

Restarting from zero would have deleted working, tested, spec-derived code and repeated months of work.

## 2. What was found broken, and fixed

- **The environment was completely dead.** Every `node_modules` symlink pointed at `C:\Users\Stanikzai\...` — the folder had been copied between Windows accounts. Nothing could build, typecheck, test or run. Repaired; Prisma client regenerated.
- **~40 files of finished work were uncommitted** — the entire `access/`, `platform/` and `scheduler/` API modules, the whole web app, CI, the seed, and a migration existed only in the working tree, on a folder that had already been copied once. Now committed.
- **The lockfile was out of sync.** `@nestjs/schedule`, eslint 10, supertest and Angular CDK were in `package.json` but absent from `pnpm-lock.yaml`. CI installs with `--frozen-lockfile`, so the first CI run was a guaranteed failure.
- **`.gitignore` was corrupted** by an external tool appending an entry in UTF-16, injecting NUL bytes. Git began treating it as binary, which makes ignore rules unreliable — that is how `node_modules` gets committed by accident. Rewritten as clean UTF-8.
- **The original rebuild plan was lost** with the old Windows account, while every role spec referenced "Phases 2–9" of it. The plan now lives in-repo.

## 3. Architectural decisions taken

Each of these changes what gets built, so they are recorded with their reasoning rather than left implicit.

### 3.1 Smart delete is workflow rewiring, not feature hiding
Disabling a capability must answer *"what does the business process become without this?"*, not *"should I hide this button?"*. Formal guarantee: **after any capability change, every reachable non-terminal state must still have a path to a terminal state**, checked before apply.
→ [`CAPABILITY_MODEL.md`](./CAPABILITY_MODEL.md). Built and tested; 31 tests.

### 3.2 Removal never changes the shape of the data
A single-branch workshop keeps exactly one hidden `Branch` row and `branchId` stays required — never `null`. Otherwise re-enabling a capability becomes a migration and every record created meanwhile is malformed. This is what makes capability changes reversible and history-safe.

### 3.3 The business step is separate from the channel
Customer approval is core; the customer portal is a channel. Removing the portal moves approval to the counter with the same acknowledgement record and audit weight — it does not delete consent. Same distinction for payment vs. online payment, invoice vs. PDF, inspection vs. quick inspection, branch (a data dimension) vs. multi-branch (a capability).

### 3.4 Capabilities sit above permissions
A permission can never resurrect a disabled capability. Effective order: Platform Control → Plan → **Tenant Capability** → Module/Feature → Workshop Config → Role Permission → User Override → Scope → Workflow Status → Record Rule.

### 3.5 Billing is a separate bounded system from Finance Core
*Decided 2026-08-08.* Finance Core owns pricing, discounts, tax policy, payments, refunds, balances. Billing owns the legal invoice document, numbering, immutable snapshots, country adapters, e-invoicing clearance, credit/debit notes.

The reason is compliance, not tidiness: Saudi ZATCA Phase 2 requires Fatoora integration in a prescribed format, and Egypt's ETA requires registration, integration and electronic signing. In those markets **an invoice that has not been cleared is not a valid invoice** — a lifecycle with its own failure modes that has no business inside pricing logic. The split also immediately buys *External Billing Mode*, which is impossible if the two are one module.
→ [`SYSTEMS.md`](./SYSTEMS.md)

### 3.6 MOP is six systems on one spine
Operations · Inventory · Finance Core · Billing/Invoicing · People & Performance · Governance & Control. Commercially presentable as five, with *Financial Suite = Finance Core + Billing*. **A system never reads or writes another system's tables directly** — cross-system reads go through published contracts, changes through domain events.

### 3.7 The capability-aware lifecycle comes before role pages
The workflow router does not exist yet. Building it capability-aware from its first line is nearly free; retrofitting it after five roles depend on hardcoded transitions is months. This is why the Operations spine is sequenced ahead of every role phase.

### 3.8 Time-ranged capability history
A 2026 work order with no part requests reads as *corrupt* unless the system knows Inventory was disabled in 2026. History must be interpreted under the rules in force when it happened, so `TenantCapability` is time-ranged rather than a flat array.

## 4. Cheap now, ruinous later

Decisions deliberately pulled early because their cost rises steeply with time:

| Decision | Why now | Where |
|---|---|---|
| Capability-aware lifecycle | Before any role depends on a transition | Phase 4 |
| i18n / RTL foundation | 8 components today, dozens after Phase 6 | Phase 1 |
| Customer-supplied parts | `PartRequest.inventoryItemId` is a required FK; changing it later spans 6 tables | Phase 2 |
| Billing adapter seam | Retrofitting clearance into a flow that assumes issuing is instant is a rewrite | Phase 9 |
| Two-tenant seed | A single-tenant seed makes isolation bugs invisible | Phase 1 |
| Worker/scheduler split | In-process cron double-fires the moment there are two replicas | Phase 13 |

---

**The plan itself:** [`PHASE_MAP.md`](./PHASE_MAP.md) · **Current phase:** [`phases/PHASE_1.md`](./phases/PHASE_1.md)

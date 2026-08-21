# MOP Documentation — Index

Read in this order the first time through.

> **Updated 2026-08-21.** This index was previously out of date relative to the doc set it points to — it didn't list several documents that had become important (`PAGE_INVENTORY.md` among them) and pointed at scenario directories using paths that no longer existed after an archival pass. Both are fixed below. See `PROJECT_STATE.md` §0 for the full account of the documentation consolidation this was part of.

## Start here

| Document | What it is |
|---|---|
| [`VISION.md`](./VISION.md) | What MOP actually is, the architectural ideas, the hard problems, what "done" means, and the failure modes being guarded against |
| [`SYSTEMS.md`](./SYSTEMS.md) | The five systems running simultaneously, their boundaries, and the contracts between them. Also the going-global constraints |
| [`CAPABILITY_MODEL.md`](./CAPABILITY_MODEL.md) | How Super Admin shapes a workshop and removes what it doesn't need **without creating logical errors** — the smart-delete architecture |
| [`PHASE_MAP.md`](./PHASE_MAP.md) | **The plan.** All 21 phases, their main points, ordering rules and dependencies. Start here to know what happens next |
| [`PAGE_INVENTORY.md`](./PAGE_INVENTORY.md) | **The canonical, current page-completion count.** Every one of the 53 spec'd pages, whether it's built, and exactly what's missing if it isn't. The single source of truth for "how much is done" — `PROJECT_STATE.md` and `PHASE_MAP.md` both cite this file's total rather than keeping their own |
| [`../PROJECT_STATE.md`](../PROJECT_STATE.md) | Where the project is *right now*, session by session — the companion to `CLAUDE.md`'s permanent knowledge |
| [`phases/PHASE_1.md`](./phases/PHASE_1.md) | Full working detail of the first phase; each phase has its own file under `phases/` |
| [`REBUILD_PLAN.md`](./REBUILD_PLAN.md) | Decision record — how the rebuild started, what was found broken, and the architectural decisions with their reasoning. Not a task list |
| [`../CODE_MAP.md`](../CODE_MAP.md) | **"I need to change X, where do I go?"** A directory-by-directory index of the current code layout |
| [`../REORGANIZATION_REPORT.md`](../REORGANIZATION_REPORT.md) | Why `apps/api/src` and `apps/web/src` are laid out the way `CODE_MAP.md` describes — the reasoning behind the layered structure (`audit/`, `runtime/`, `identity/`, `control/`, `systems/`, `experiences/`, `insights/` on the API side). Structural only; no behaviour changed |

## Product specification

| Document | What it is |
|---|---|
| [`PRODUCT_SPEC_CANONICAL.md`](./PRODUCT_SPEC_CANONICAL.md) | The authoritative business spec, pasted by the product owner. Source of truth for *intent*. Note the 2026-08-07 amendment at the top and the truncation warning |
| [`SCENARIOS.md`](./SCENARIOS.md) | The scenario matrix — what must work, under which capability profiles, with a schema verdict each |
| [`detailed-specs/`](./detailed-specs/README.md) | Field-level, interaction-level detail for every page, one file per role |
| [`POLICY_DECISION_INVENTORY.md`](./POLICY_DECISION_INVENTORY.md) | The Phase 21 deliverable — ~70 policy/architecture decisions with a schema, defaults doctrine, and a build-posture verdict each. Documents only; no implementation yet, by design |

## Archived discovery passes

These directories are **consumed input, not living documents** — each produced findings that were already synthesized into a phase (see the synthesis file in each) and then absorbed into `PHASE_MAP.md`. Kept for historical reference and to trace a phase's reasoning back to its source scenario, not maintained going forward.

| Document | What it is |
|---|---|
| [`archive/discovery/scenarios/`](./archive/discovery/scenarios/) | 20 workshop-floor walkthroughs across four differently-shaped tenants, discovering what MOP is missing for real, specialized workshops. Synthesized in `FINDINGS_SYNTHESIS.md`. Source of Phases 15–17 |
| [`archive/discovery/scenarios2/`](./archive/discovery/scenarios2/) | 40 platform-layer walkthroughs across eight tenant profiles, testing super admin control, workshop creation using only the product, and the server under real multi-tenant load. Synthesized in `SYNTHESIS.md`. Source of Phases 18–20 |
| [`archive/discovery/scenarios3/`](./archive/discovery/scenarios3/) | 20 edge cases (10 hard, 10 extremely hard) — rare conditions a real deployment will eventually hit: races, clock skew, migrations against dormant data. Not persona-driven; attributed to existing phases via `EDGE_CASE_REGISTER.md`, not new phase numbers |

## Archived audits

One-time "verify the codebase against its own claims" passes, each produced at a different point in the project's history. Each was found, in turn, to go stale as more code shipped after it was written — two of them (`IMPLEMENTATION_AUDIT.md`, `PHASE_COMPLETION_AUDIT.md`) claimed Platform Super Admin's Governance Controls and Workshop Live View pages were unbuilt, when a direct 2026-08-21 code read found both real and working. Kept for their debt-register/decision-catalog content, which is still substantially valid — just don't trust any status claim in them without checking it against the current code or against `PAGE_INVENTORY.md`.

| Document | What it is |
|---|---|
| [`archive/audits/PHASE_COMPLETION_AUDIT.md`](./archive/audits/PHASE_COMPLETION_AUDIT.md) | The most recent and most rigorous of the four — a phase-by-phase re-verification with a deduplicated debt register (D1–D21). Most of its findings are still live; its claims about Platform Super Admin are not (see above) |
| [`archive/audits/IMPLEMENTATION_AUDIT.md`](./archive/audits/IMPLEMENTATION_AUDIT.md) | A full 53-page evidence-based classification pass, done independently of the phase-level audit above. Same caveat applies |
| [`archive/audits/ENGINEERING_KNOWLEDGE_TRANSFER.md`](./archive/audits/ENGINEERING_KNOWLEDGE_TRANSFER.md) | A confidence-tagged (VERIFIED/PARTIAL/MOCK) handoff snapshot from an earlier point in the project |
| [`archive/audits/ARCHITECTURE_DECISION_INVENTORY.md`](./archive/audits/ARCHITECTURE_DECISION_INVENTORY.md) | The open-questions document that triggered `POLICY_DECISION_INVENTORY.md` and Phase 21. Superseded by that inventory's resolution pass |
| [`archive/audits/UI_UX_EXECUTION_LEDGER.md`](./archive/audits/UI_UX_EXECUTION_LEDGER.md) | A large, session-by-session UI execution tracker from an earlier multi-session run |
| [`archive/audits/GAP_ANALYSIS_CANONICAL_SPEC.md`](./archive/audits/GAP_ANALYSIS_CANONICAL_SPEC.md) | Spec vs. the **v11.9** implementation. **Historical** — v11.9 was deleted at commit `b0a4e68`. Read it as the record of *why* the rebuild happened and which mistakes must not recur, not as a description of current code |

## Engineering charters

The measures and precautions each layer must hold, with `DONE` / `PARTIAL` / `TODO` status per item. These were last reviewed around 2026-08-08 and have not been re-verified against the current code in the 2026-08-21 consolidation pass — treat their per-item status markers as a starting point to check, not a current fact.

| Document | Covers |
|---|---|
| [`DATABASE_STRATEGY.md`](./DATABASE_STRATEGY.md) | Tenant isolation depth, money handling, immutability and lock moments, concurrency races, history and deletion, migrations, growth and indexes, permission-resolver query amplification |
| [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) | Environments, topology, secrets, security posture, sessions and revocation, file/photo handling, realtime, observability, backups and DR, the scaling path, workshop connectivity |
| [`DESIGN_LANGUAGE.md`](./DESIGN_LANGUAGE.md) | Why every visual value is what it is — colour, elevation, radius, motion, spacing, type |
| [`UX_PRINCIPLES.md`](./UX_PRINCIPLES.md) | Next-action primacy, role-shaped surfaces, priority ordering, the six states, never-leak-by-hiding, Arabic/RTL, the technician field tool, consistency, accessibility, governed actions |
| [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md) | Model-by-model reference for the Prisma schema |

## Conventions used across these documents

- **`DONE` / `PARTIAL` / `TODO`** — every claim about the codebase is marked with its real status. If something is a stub, it says so.
- **Evidence over assertion** — claims about current behaviour cite a file path, a commit, or a command that was actually run.
- **Cheap now, expensive later** — decisions flagged this way (RTL, customer-supplied parts, realtime transport, worker separation) cost days today and months after later phases build on top. They are called out deliberately so they are decided rather than defaulted.
- **One canonical tracker per fact.** As of 2026-08-21, page-completion status lives only in `PAGE_INVENTORY.md`; phase status lives only in `PHASE_MAP.md`'s Progress table; session history lives only in `PROJECT_STATE.md`. Before this pass, three documents each kept their own page count and disagreed. Don't reintroduce a second place that tracks the same fact — cite the canonical one instead.

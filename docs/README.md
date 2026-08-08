# MOP Documentation — Index

Read in this order the first time through.

## Start here

| Document | What it is |
|---|---|
| [`VISION.md`](./VISION.md) | What MOP actually is, the four architectural ideas, the six hard problems, what "done" means, and the failure modes being guarded against |
| [`REBUILD_PLAN.md`](./REBUILD_PLAN.md) | Current verified state of the repo, Phase 0 work items, and the roadmap for Phases 2–11 |

## Product specification

| Document | What it is |
|---|---|
| [`PRODUCT_SPEC_CANONICAL.md`](./PRODUCT_SPEC_CANONICAL.md) | The authoritative business spec, pasted by the product owner. Source of truth for *intent*. Note the 2026-08-07 amendment at the top and the truncation warning |
| [`detailed-specs/`](./detailed-specs/README.md) | Field-level, interaction-level detail for every page, one file per role |
| [`GAP_ANALYSIS_CANONICAL_SPEC.md`](./GAP_ANALYSIS_CANONICAL_SPEC.md) | Spec vs. the **v11.9** implementation. **Historical** — v11.9 was deleted at commit `b0a4e68`. Read it as the record of *why* the rebuild happened and which mistakes must not recur, not as a description of current code |

## Engineering charters

The measures and precautions each layer must hold, with `DONE` / `PARTIAL` / `TODO` status per item.

| Document | Covers |
|---|---|
| [`DATABASE_STRATEGY.md`](./DATABASE_STRATEGY.md) | Tenant isolation depth, money handling, immutability and lock moments, concurrency races, history and deletion, migrations, growth and indexes, permission-resolver query amplification |
| [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) | Environments, topology, secrets, security posture, sessions and revocation, file/photo handling, realtime, observability, backups and DR, the scaling path, workshop connectivity |
| [`UX_PRINCIPLES.md`](./UX_PRINCIPLES.md) | Next-action primacy, role-shaped surfaces, priority ordering, the six states, never-leak-by-hiding, Arabic/RTL, the technician field tool, consistency, accessibility, governed actions |
| [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md) | Model-by-model reference for the Prisma schema |

## Conventions used across these documents

- **`DONE` / `PARTIAL` / `TODO`** — every claim about the codebase is marked with its real status. If something is a stub, it says so.
- **Evidence over assertion** — claims about current behaviour cite a file path, a commit, or a command that was actually run.
- **Cheap now, expensive later** — decisions flagged this way (RTL, customer-supplied parts, realtime transport, worker separation) cost days today and months after later phases build on top. They are called out deliberately so they are decided rather than defaulted.

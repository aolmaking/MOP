# MOP — Maintenance Operations Platform

A multi-tenant SaaS platform for running maintenance and service workshops. One codebase serves many workshops, each with its own staff, customers, branches, warehouses, inventory, pricing, and — critically — its own **shape**: a one-bay quick-service shop and a twelve-branch dealership network run the same code with different capabilities switched on.

> **Status (2026-08-21, code-verified):** the foundation (data model, permissions, capability engine, auth, platform administration) and all 9 role-specific workspaces are built and largely real — 44 of 53 specified pages are complete, 6 are partial, and 3 have no implementation yet (a dedicated Access Denied page, Password Reset, and Data-Analyst exports). See [`docs/PAGE_INVENTORY.md`](docs/PAGE_INVENTORY.md) for the exact per-page state and [`docs/PHASE_MAP.md`](docs/PHASE_MAP.md) for the phase plan. Two things matter more than any remaining page right now: most of the API is tested only at the service layer, not through a real guarded HTTP request; and no country-specific billing/invoicing adapter exists yet, so no tenant can legally invoice in a real market today.

---

## What problem it solves

A single vehicle repair is a distributed transaction across five roles — receptionist, technician, inventory manager, team leader, branch manager — acting at different times, from different devices, each seeing a different slice of the truth. The customer watches from outside. At the end, money changes hands based on what everyone believes happened.

**MOP's job is to make sure that transaction never silently lies to anyone.** If the technician's screen says "part used", the stock ledger says "still on the shelf", and the invoice says "not billed", the system has failed — even though every page rendered without an error.

## Architecture in one minute

MOP is **six systems on one operational spine**, not one application with many pages:

| System | Owns |
|---|---|
| **Operations** | Work orders, tasks, inspections, faults, blockers, the lifecycle |
| **Inventory** | Catalog, multi-warehouse stock, part requests, movements, returns |
| **Finance Core** | Pricing, discounts, tax policy, payments, refunds, balances |
| **Billing / Invoicing** | Legal invoice documents, numbering, country e-invoicing adapters |
| **People & Performance** | Staff, teams, scoping, supervision, technician performance |
| **Governance & Control** | Platform control, capabilities, permissions, audit |

They communicate through domain events and published contracts. **A system never reads or writes another system's tables directly** — see [`docs/SYSTEMS.md`](docs/SYSTEMS.md).

### The capability engine

The part that makes one codebase serve differently-shaped workshops. Platform Super Admin can remove what a workshop doesn't need — no team leader, no inventory, a single branch — and removal is **workflow rewiring, not feature hiding**.

Disabling Inventory by merely denying `inventory.*` permissions would leave the Finish Gate still demanding "parts received must be used or returned", stranding every job in that workshop forever. So every removable capability declares what the business process *becomes* without it, and the engine enforces one guarantee:

> After any capability change, every reachable non-terminal state must still have a path to a terminal state.

That is a graph reachability check, run before a change is applied, covering work orders, part requests and customer decisions. A configuration that could strand a record is rejected at validation time rather than discovered in production. See [`docs/CAPABILITY_MODEL.md`](docs/CAPABILITY_MODEL.md).

## Repository layout

```
apps/
  api/           NestJS API — auth, access control, platform administration
  web/           Angular application
packages/
  shared/        Types, permission manifest, capability engine + validator
  database/      Prisma schema, migrations, seed
tools/           Repo-level checks (doctor, audit boundary, directional CSS)
docs/            Specification, engineering charters, phase plan
```

## Getting started

Full instructions, including three environment traps this project has actually hit, are in **[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)**.

```bash
corepack enable && corepack pnpm install
```

```bash
docker compose up -d && corepack pnpm db:generate && corepack pnpm db:migrate && corepack pnpm db:seed
```

```bash
corepack pnpm run doctor && corepack pnpm test
```

`doctor` checks every environment failure mode encountered so far and tells you how to fix each one.

## Engineering standards

This project is built **waterfall**: the structure laid down early is inherited by everything after it, so foundations are deliberately over-invested in relative to features.

Three rules are enforced by the build rather than by review:

| Rule | Enforced by |
|---|---|
| No `AuditLog` write outside the audit module | `tools/lint-audit-boundary.mjs` |
| No physical direction CSS (`margin-left`) — the UI must mirror for Arabic | `tools/lint-directional-css.mjs` |
| No capability profile may strand a work order | `packages/shared` reachability tests, run in CI |

Other standing rules: money is `Decimal` and crosses the API as a **string**, never a JS number; restricted data is **absent from the response**, never hidden client-side; and integration tests run against a **real** Postgres, because mocked databases prove nothing about constraints, transactions or cascades.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for conventions and [`docs/README.md`](docs/README.md) for the full documentation map.

## Documentation

| Start here | |
|---|---|
| [`docs/VISION.md`](docs/VISION.md) | What MOP is, the architectural ideas, the hard problems |
| [`docs/PHASE_MAP.md`](docs/PHASE_MAP.md) | The 21-phase plan and where the project currently is |
| [`docs/PAGE_INVENTORY.md`](docs/PAGE_INVENTORY.md) | The canonical, current, per-page build status — the definition of "done" |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Setup, commands, troubleshooting |
| [`docs/SYSTEMS.md`](docs/SYSTEMS.md) · [`docs/CAPABILITY_MODEL.md`](docs/CAPABILITY_MODEL.md) | System boundaries; the capability engine |
| [`docs/DATABASE_STRATEGY.md`](docs/DATABASE_STRATEGY.md) · [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) · [`docs/UX_PRINCIPLES.md`](docs/UX_PRINCIPLES.md) | Engineering charters, each item marked `DONE` / `PARTIAL` / `TODO` |

## Tech stack

TypeScript · NestJS · Angular · PostgreSQL · Prisma · pnpm workspaces · Jest · Vitest · GitHub Actions

## Licence

Proprietary. All rights reserved.

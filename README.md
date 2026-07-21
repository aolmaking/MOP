# MOP Product Platform v4.0

This folder is the first production-grade restructuring of the MOP prototype.
It keeps the V3/V1 product behavior as domain reference, but changes the
architecture from a static mock app into a SaaS monorepo.

## Stack

- Angular standalone application for the web frontend.
- Tailwind CSS for the design system and responsive UI.
- NestJS API for backend modules, guards, and service boundaries.
- Prisma ORM with PostgreSQL as the production database.
- Shared TypeScript contracts for frontend/backend DTO alignment.

## Main Commands

```bash
pnpm install
docker compose up -d
pnpm db:reset-local
pnpm dev
```

The default local database URL is:

```text
postgresql://mop:mop@localhost:5432/mop_platform?schema=public
```

The local web app runs on `http://localhost:4200`.
The local API runs on `http://localhost:4000/api/v1`.
During local development, Angular proxies `/api/v1` to the API server through `apps/web/proxy.conf.json`, so browser requests should appear as same-origin requests from the web app.

Use these checks when the login screen cannot reach the backend:

```bash
docker ps
pnpm db:doctor
curl http://localhost:4000/api/v1/health
curl http://localhost:4200/api/v1/health
pnpm validate:network
```

Seeded local accounts use role-based login identifiers and `0000000` as the development password.
If the local database was seeded before this change, run `pnpm db:demo-logins` once to update existing demo accounts without resetting data.

If Prisma seed fails after an old or partial local database setup, reset the local development database with:

```bash
pnpm db:reset-local
```

`pnpm db:doctor` checks the runtime chain before seeding: environment discovery, `DATABASE_URL`, generated Prisma Client delegates, database connection, and required tables. Use it before debugging authentication, because login cannot work when the database layer is not healthy.

## Product Boundary

V4 starts the real product architecture. It creates the multi-tenant identity
spine, database schema, backend module boundaries, API contracts, and Angular
frontend shell. The next migration steps can move one operational workflow at a
time from the static V3 screens into real API-backed Angular screens.

## Important Paths

- `apps/web`: Angular + Tailwind frontend.
- `apps/api`: NestJS backend API.
- `packages/database/prisma/schema.prisma`: production database model.
- `packages/database/prisma/seed.ts`: demo tenant seed for local development.
- `packages/shared/src`: shared API contracts and product constants.
- `docs/architecture.md`: architecture decisions and scaling notes.
- `docs/v2-customer-decision-flow.md`: Version 2 scope and implementation notes.
- `docs/v3-technician-simple-execution-mode.md`: Version 3 technician UX rules.

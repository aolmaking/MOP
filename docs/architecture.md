# MOP v4 Architecture

## Goal

Turn MOP from a static prototype into a production SaaS platform that can be
sold to many tenants and used by a large number of staff and customers.

## Core Principles

1. Tenant isolation is a first-class model, not a UI filter.
2. Every route and action is authorized by backend policy.
3. Customer records are mandatory; customer portal accounts are optional.
4. Customer asset ownership controls portal visibility and safe history.
5. Every sensitive change writes an audit event.
6. Frontend state is session-derived and never trusted as the source of truth.

## Runtime Shape

- Web: Angular standalone components, Tailwind, route guards, API client.
- API: NestJS modules, request tenant context, auth/session guards, access
  service, domain services.
- Database: PostgreSQL with Prisma schema, indexed tenant and ownership fields.
- Shared: DTO contracts exported from `@mop/shared`.

## Scaling Notes

- `tenantId` is indexed on operational tables.
- Audit, ledger, and event-like tables are append-only.
- Large tenants can later be moved to partitioned tables by `tenantId` or date.
- Long-running integrations such as WhatsApp, billing callbacks, and report
  exports should move to queues/workers after the API foundation is stable.

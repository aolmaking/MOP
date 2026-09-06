# 15 — Final Engineering Assessment

## What product do we actually have?
A **multi-tenant workshop-platform foundation of unusual quality** (capability engine, policy consumers, permission resolver, transactional money/stock, disciplined API) with **nine role workspaces that mostly read and write real data**, wrapped around an **operational core whose early lifecycle has no triggers**. It is best described today as: *an excellent configuration-and-governance platform for workshops, plus a set of correctly built post-intake subsystems that cannot yet be reached in sequence by the product's own UI.*

## What can a real workshop use today?
Register customers, book jobs (intake), manage catalog/stock/returns from the manager console, configure the business through creation/policies/pricing, view rich reporting/analytics/audit, administer tenants as Super Admin — and, for any job seeded into IN_PROGRESS with tasks: execute technician work, run the full parts loop up to "used", decide approvals via portal/token/counter, invoice, take payments (via API-shaped flows), refund, and deliver. What it cannot do: move its own new job out of REGISTERED; return a part as a technician; send anyone a message; capture inspection/custom-form values; issue a legal invoice in any country; change a policy after creation.

## Which complete cycles actually work end-to-end?
Workshop creation · intake · pricing/catalog · finance (charges→invoice→payments→settle) · delivery gate+release (given arrival) · customer decision ask→answer→charge · inventory manager console incl. returns adjudication · reporting/export. (Full chains in Report 06.)

## Which cycles stop halfway?
WO progression (strands at REGISTERED — the break), technician execution (entry + task creation + return leg), customer-decision lifecycle writers (VIEWED/EXPIRED/CANCELLED), communication (no sender), forms/specialization consumption.

## Which pages are real? Which are shells?
**Zero shells.** 47 of 53 spec pages render real server data with working writes; 6 are real-but-partial (Builder Control, Platform Reports, Forms, Messages, Pricing, Audit per Report 07). The honesty inversion: the fake-looking things aren't pages, they're **buttons** (Attention actions no-ops) and an **orphaned screen** (Take Payment).

## Which backend systems are real / disconnected?
Real: capability engine, policy resolution+consumers, permission resolver, auth/sessions, lifecycle engine+gates, stock ledger, finance core, billing seam, decisions, portal, analytics, workflow-health. Disconnected (built, unreachable): early lifecycle intents, task creation, part-return leg, policy setter, staff restriction, disputes, tenant groups/stakeholders, message sending, forms validation, specialization runtime, SUSPENDED writer.

## Is Workshop Creation producing different operational workshops?
**Yes — genuinely.** Same code, evaluated configuration: different permissions (locked layers), modules, live workflow graphs, gates, finance flags, catalogs. Verified on both sides of the wire; CI proves every shipped profile reachable-to-CLOSED. Caveats: specialization stage is ceremony; policies frozen post-creation; identical permission rows everywhere (differentiation is interpretive).

## Are Capabilities real? Specializations? Policies?
- Capabilities: **real**, the strongest subsystem.
- Specializations: **metadata-only** (seeding works; nothing consumes).
- Policies: **real consumers (16/16)** with graph-level combination safety — but **unchangeable after creation** and four of them govern edges no production trigger can fire.

## Can different configurations produce genuinely different behavior?
Yes — demonstrably in permissions/routing/gates/pages today; fully in completable businesses once G1/G2 exist.

## What prevents us from delivering the product?
In order: G1+G2 (the spine), G3 (legal invoicing), G4–G11 (the week-one experience breaks), G19–G21 (deploy/observability/security fixes). Nothing on this list is architecturally hard; the hard external dependency is the billing adapter; the hardest behavioral one is deciding who owns each unowned intent.

## Minimum honest bar to claim "complete, usable Workshop Management SaaS"
1. All six stranded intents + task creation wired to endpoints and UI (G1,G2).
2. Decision expiry/cancel sweeps so gates can't deadlock (G4).
3. Technician return leg + attention/take-payment wiring (G5,G10,G11).
4. One country billing adapter clearing a real invoice (G3).
5. Policy setter + operator-orphan guard (G6,G15).
6. Web refresh flow + security fixes S1–S3 (G9,G21).
7. HTTP test suites over money/stock/operations (G12); deploy image + executed CI + structured logs (G19,G20).
8. Arabic string pass if Gulf/Egypt launch is intended (G18).

## Evidence of audit reliability
Every §-reference above traces to file:symbol evidence in Reports 01–14; load-bearing negatives (unreachable intents, unconsumed services) were verified by three independent grep strategies plus full-file reads; contradictions between docs were recorded rather than averaged (Report 01 §5.9). Where docs claimed completeness beyond what code supports — notably around phase completion vs the spine break — this report sides with the code.

**One-sentence truth:** MOP is not a facade — it is a real platform missing its ignition switch, a legal invoice, a mailbox, and a deployment story; fix the ignition first.

# Detailed Page Specifications — Index

Full field-level, interaction-level detail for every page in the product, one file per role, matching the build order in [`REBUILD_PLAN.md`](../REBUILD_PLAN.md) (Phases 2–9). Each file is self-contained but references shared conventions established in earlier files rather than repeating them (server-side pagination, lock-icon-plus-tooltip for restricted controls, the customer-safe "never leaks by construction" rule, etc.) — read them in order the first time through.

This is the "final vision" layer between `docs/PRODUCT_SPEC_CANONICAL.md` (what the product does and why) and actual code: every field's type/validation/data source, every button's exact effect, every state a page can be in, and the specific cross-system dependencies between pages — so implementation is a translation exercise, not a design exercise.

| Role | File | Pages |
|---|---|---|
| *(none — public/shared)* | [`shared-system-pages.md`](./shared-system-pages.md) | Login/Identity Gateway, Register as Customer, Invite Accept/Set Password, Access Denied, Tenant Frozen/Workspace Unavailable, Password Reset (placeholder), plus the shared UI states/components reference (empty vs. no-results, Locked-by-Platform badge, Role Preview, pagination vs. virtualization) |
| Platform Super Admin | [`platform-super-admin.md`](./platform-super-admin.md) | Add Workshop Owner, Workshops, Control Center (Governance + Builder Control), Platform Reports, Workshop Live View |
| Tenant Owner / Tenant Admin | [`tenant-owner.md`](./tenant-owner.md) | Organization & Access, Forms & Fields, Messages & Templates, Pricing & Financial Configuration, Reports & Analytics, Audit & Change History, Workflow Health/Operations Integrity, Owner Home |
| Branch Manager | [`branch-manager.md`](./branch-manager.md) | Branch Home/Attention Center, Customer Intake, Work Orders, Work Order Workspace, Approvals & Customer Decisions, Delivery & Payments Status, Team Setup |
| Technician | [`technician.md`](./technician.md) | Technician Home, My Work, Work Card (10 tools: Quick Inspection, Inspect, Codes, Services/POS, Parts, Ask Customer, Blocker, Notes, History, Finish) |
| Inventory Manager | [`inventory-manager.md`](./inventory-manager.md) | Inventory Home, Technician Requests, Inventory POS/Catalog Control, Quantity Control & Stock Status, Returns/Movements, Reports & Stock Insights |
| Team Leader | [`team-leader.md`](./team-leader.md) | Team Leader Home, Technicians View, Vehicles/Work Orders View, Technician Performance Reports |
| Data Analyst | [`data-analyst.md`](./data-analyst.md) | Analytics Home, Operations, Technician & Team, Inventory, Customer Decision, Feature Adoption, Saved Views/Exports |
| Customer | [`customer.md`](./customer.md) | Customer Portal Home, My Assets, Current Service, Decision Page/Approvals, Invoice & Payment Status, Safe Technical History |

## Cross-cutting rules established once, referenced everywhere

- **Tenant isolation is per-currency and per-timezone too**, not just per-record — every money figure renders in `Tenant.currency`, never summed across tenants; every timestamp converts from stored UTC using `Tenant.timezone`.
- **Multi-branch / multi-warehouse is the default assumption**, not an edge case — every list/table is built to look identical whether the count is 1 or 1,000, with scale showing up only in row counts and pagination, never in layout.
- **Nothing leaks by hiding — it leaks by not being in the response.** Every role-restricted or customer-restricted field is absent from that role's DTO/API response entirely, not present-and-hidden client-side. This is the single most-repeated rule across all 8 files because it's the one the previous implementation got wrong most often.
- **Design/layout/role-experience/workflow-policy/the permission matrix belong to Super Admin, per workshop** — not Owner self-service. See the Amendment note at the top of `docs/PRODUCT_SPEC_CANONICAL.md`.
- **Governed changes (Super Admin's Control Center, Builder Control) always go through Draft → Validate → Preview → Impact Preview → Publish → Apply → Audit → Rollback.** Direct-save pages (Owner's remaining pages, most day-to-day staff actions) still audit every write, just without the full pipeline.
- **Server-side pagination for anything that grows across tenants/time; client-side virtualization for the few long lists that live *inside* an already-open view** (a Details drawer's branch sub-list, the Permission Matrix's rows) — see `shared-system-pages.md` for why these are deliberately different mechanisms, not an inconsistency.

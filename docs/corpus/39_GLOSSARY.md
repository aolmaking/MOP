# MOP — Glossary

> **Document ID:** DOC-39
> **Purpose:** MOP-specific definitions. Where a word means something narrower here than in ordinary usage, this file says so.
> **Authority:** DEFINITIONAL.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** every other document.

---

## The five configuration axes — the distinctions that matter most

**Capability** — *Does this step exist in this workshop at all?* Stored in `TenantCapability`, time-ranged. **The only axis that may change reachability.** Twelve exist. Removing one is **rewiring, not hiding**.

**Policy** — *What rule does an existing step run under?* Stored in `WorkshopPolicy`, time-ranged. **May never change reachability** — that is the mechanical test separating it from a mis-classified capability. Sixteen exist, all `ENFORCED`.

**Specialisation** — *What kind of work is this, and what shape of record does it produce?* Vocabulary and record shape, not behaviour.

**Custom field** — *What extra data does this form capture?* A workshop's addition to one of nine fixed forms.

**Permission** — *May this account perform this action?* 80 keys, resolved through eleven layers. **A permission can never resurrect a disabled capability.**

**Responsibility** — *Which role covers the work a capability creates, in this workshop?* Asked at creation; the answer writes real permission rows. Exists because a capability can otherwise be turned on that **nobody in the building can operate**.

---

## Workflow vocabulary

**Intent** — the action a *person* takes (`FINISH`, `APPROVE`, `DELIVER`), as opposed to the states it happens to connect. 20 exist. *"Technician finishes"* lands on review, QC, invoicing or delivery depending on the workshop's shape.

**Transition / edge** — a permitted move between two states, possibly guarded.

**Guard** — a condition on an *edge*: `requires` (capability), `requiresPolicy`, `requiresFact`.

**Gate** — a condition on the *record* that must hold before a checkpoint. Twelve exist across two checkpoints. **A guard decides whether an edge exists for this tenant; a gate decides whether this particular record may take an existing edge right now.**

**Fact** — a per-work-order condition, computed from that job's own data. One exists: `work_order.has_critical_fault`. **A missing fact is false** — never assumed risk-flagged, never assumed exempt.

**Finish Gate** — the ten possible checks before a technician may finish. Five are core; five die with their capability.

**Delivery Gate** — `invoice.issued` and `payment.settled_or_policy_allows`. The only thing between a customer and their vehicle.

**Core gate** — `owner: null`. No capability profile may ever drop it.

**Effective graph** — the transitions a *specific tenant* actually has, after capability filtering and removal policies.

**Declaration order is precedence** — where several intent edges from one state are live at once, the router takes the **first declared**. Reordering lines in `workflow-graphs.ts` changes product behaviour.

**Reachability guarantee** — after any capability change, **every reachable non-terminal state must still have a path to a terminal state.** Checked before a change is applied.

**Stranded state** — a state reachable with no route out. The failure the validator exists to refuse.

**Journey / workflow strip** — the stage projection read by three roles. Stages: `DONE` · `CURRENT` · `WAITING` · `BLOCKED` · `AHEAD`. Derived from the *effective* graph, so a workshop without QC never shows a QC stage.

---

## Operations

**Work Order** — the spine. 16 states. **Only `WorkOrderLifecycleService` writes its status.**

**Asset** — the thing worked on. Not *Vehicle*: a generator has no plate, and the model must serve `CARS`, `MOTORCYCLES` and `HEAVY_EQUIPMENT`.

**Task** — one unit of work. `actualMinutes` is the technician's **reported** figure, never derived from timestamps.

**Inspection** · **Fault** — a recorded examination and a finding. A `CRITICAL` fault drives the QC routing fact.

**Blocker** — a recorded reason work stopped. `no_open_blocker` is a core Finish gate.

**Dossier** — the job history drawer, rendering the workshop shape **in force when the job opened**.

**Attention Center** — the branch manager's landing page. It **ranks**, it does not list, and its ageing is working-week aware.

**Relink** — a job re-opened against an earlier one.

---

## Inventory

**Part Request** — a technician asking for a part. 15 graph states; the whole graph is skipped without `INVENTORY`.

**Provenance** — where a part came from: `INVENTORY` · `EXTERNAL_PURCHASE` · `CUSTOMER_SUPPLIED`. A customer-supplied part **cannot be modelled as an inventory item priced at zero**: no stock movement, no cost, and a different liability position, because warranty disputes turn on who supplied the part.

**Stock Movement** — the immutable ledger. **A balance with no movement behind it is a defect**, and `replay()` proves it.

**The five buckets** — `availableQty` · `reservedQty` · `issuedQty` · `returnPendingQty` · `damagedQty`. The fourth exists because a returned part is genuinely **neither sellable nor still issued**.

**`RETURN_PENDING`** — a movement always reversed by a `RETURN_TO_STOCK` or `DAMAGED` of the same quantity, **never left standing**.

**`BLOCK_UNTIL_ZERO`** — a warehouse holding stock cannot be deactivated.

**Counter hand-over** — `ISSUED → RECEIVED_BY_TECHNICIAN` directly. A part from the branch's own store does not *arrive* anywhere; writing an `ARRIVED` nobody witnessed would put a transit event in the ledger **that never happened**.

---

## Money

**Money** — `Decimal(12,2)` in the database, **`string` across the API**, integer minor units internally. More than two decimal places is **refused, not rounded**.

**Chargeable Work Item** — the cross-system contract carrying an item into Finance with its provenance and its **frozen** approved price.

**Running invoice** — the live total while the job is open.

**Issued invoice** — permanent. **Only a credit note follows it.**

**Effective-dated** — a price edit **closes the old row and opens a new one**. An old invoice never reprices.

**Compliant-blocked** — a tenant in a country with no billing adapter. Real, surfaced on the platform workshops list.

**Idempotency key** — what actually prevents a duplicate payment: a **unique constraint**, not a check-then-write. A replay with different content returns `409`.

---

## Customer

**Decision Request** — a question put to the customer. 7 states. `secureToken` powers the public `/decide/:token` path with no login.

**Counter approval** — staff recording an answer the customer gave verbally. **Always attributed to staff, never the customer**, under all three policy options.

**Critical acknowledgement** — the formal confirmation required before a safety-critical rejection is recorded. Enforced **server-side**; required under both `APPROVAL_WEIGHT` options — the floor the policy cannot lower.

**Safe Technical History** — what a *future* owner may see. Scoped by `AssetOwnershipHistory`, so a new owner sees technical history and **never the previous owner's financials**.

**Asymmetric visibility** — the same fact rendered differently, or not at all, by audience. **A translation, not a filter**, and a security boundary rather than a presentation concern.

**Never leak by hiding** — restricted data is **absent from the response**. If it is in the payload and hidden by CSS, it has already leaked.

---

## Platform and governance

**Tenant** — one workshop. **Workshop** is the same thing in product language.

**Platform Super Admin** — the only actor that legitimately crosses tenants. Gated by `PlatformGuard`, deliberately outside the resolver.

**Live View** — the only cross-tenant read in the product. **Counts and event kinds only, never payload.**

**Impact preview** — what a destructive action will affect, shown before it happens. *"14 jobs are in Payment Pending; turning this off releases all of them."*

**Permission lock** — a platform-set ceiling on a role's permission. Audited, **reason required**, and it short-circuits the resolver.

**Delegation** — the owner's own switch: *has anyone but me been allowed to do this at all?* Off by default; denies **whatever the role template says**.

**Plan ceiling** — `maxBranches` / `maxUsers` / `maxWarehouses`, enforced **on an ongoing basis**, not only at creation.

**Frozen** — a tenant whose staff cannot sign in. A valid credential returns `tenant_unavailable`, and **the freeze reason is never surfaced**.

---

## Architecture

**Bounded system** — one of six: Operations · Inventory · Finance Core · Billing · People & Performance · Governance & Control. **A system never reads or writes another's tables.**

**Contract** — a published cross-system read type in `packages/shared/src/contracts/`.

**Domain event** — a cross-system change. A **closed union of 46 keys**, so a typo is a compile error.

**Experience** — a per-role surface composed over systems. **Never writes directly.**

**Insight** — a read-only derived view.

**Configuration island** — a setting whose change produces no downstream behavioural difference. The failure the `ENFORCED`/`RECORDED` distinction exists to prevent.

**Island subsystem** — one that passes its own tests while its edges are broken.

**Metric without lineage** — a number that cannot be traced to the records that produced it. **Not reported.**

**Silent stub** — a check hardcoded to pass. *Believable, visible and false.*

**Decorative abstraction** — a named structure nothing uses, while something else does the real work.

**Write-only configuration** — a value written by a UI and read by nothing.

---

## Status vocabulary

**Designed · Implemented · Integrated · Verified · Production-ready** — five distinct stages. **Implemented is not Integrated**: this project's record contains four finished systems that shipped with no door.

**No door** — implemented, tested, and unreachable because no endpoint or control leads to it. Six domain commands are in this state today.

**Absent, not empty** — a section with nothing meaningful does not render as a blank shell.

**Absent, not locked** — a control the user may never reach is not rendered greyed out.

**Honest partial** — an option that behaves conservatively and says so, rather than silently doing nothing. `REQUIRES_OVERRIDE` blocking like `ALWAYS` is one.

**Not computable** — a metric whose inputs do not exist, reported as such rather than faked.

---

## Environment

**`corepack pnpm`** — `pnpm` is not on PATH. Node must be added first in Bash: `export PATH="/c/Program Files/nodejs:$PATH"`.

**`CI=true corepack pnpm install`** — without `CI=true` it hits an interactive prompt, **no-ops, and still exits 0**.

**`corepack pnpm run doctor`** — `pnpm doctor` is a built-in that shadows the project script.

**`db:test:prepare`** — run after every new migration, or integration tests fail with a confusing 500.

**Rebuild `@mop/shared`** — after adding an export, or `apps/api` typecheck will not see it.

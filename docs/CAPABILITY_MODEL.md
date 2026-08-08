# Workshop Capability Model — Shaping and Smart Delete

> **Scope:** how one codebase serves a one-man oil-change shop and a twelve-branch dealership network without forking, and how Platform Super Admin removes what a given workshop doesn't need **without creating logical errors**.
> **Status:** §3–§6 are **built and tested** — `packages/shared/src/capabilities/`, 31 passing tests including all six required smart-delete cases. §8–§9 (governance pipeline, schema, resolver wiring) are still design.
> **Date:** 2026-08-08.

---

## 1. The problem

MOP must run all of these on the same code:

| Workshop | Branches | Warehouses | Roles present | Notes |
|---|---|---|---|---|
| Single-bay quick service | 1 | 0 | Owner, 2 technicians | Buys parts per job; no stock; no QC; no team leader |
| Multi-branch full service | 12 | 3 | All 7 | Central warehouse + per-branch; QC department; team leaders |
| Heavy equipment field service | 1 office | 1 | Owner, technicians, inventory | Work happens on customer sites; hour-meters; no customer waiting room |
| Motorcycle workshop | 2 | 1 | Owner, branch manager, technicians | Quick services dominate; full inspection rare |
| Diagnostics-only specialist | 1 | 0 | Owner, technicians | Sells diagnosis, not repair; no parts, no fitting |

The differences are not cosmetic. The diagnostics-only shop has **no parts lifecycle at all**. The single-bay shop has **no team leader to review anything**. Yet the work order lifecycle, the finish gate, the invoice, and the customer's approval must all still work.

**Super Admin decides this per workshop.** The Owner does not (2026-08-07 amendment). New workshops start from a template and are adjusted, so creation stays simple.

## 2. Why feature flags are not enough

A flag answers *"should I show this button?"* Smart delete must answer *"what does the business process become without this?"*

Take the diagnostics-only shop and naively disable the Inventory module the way the code does today — deny every `inventory.*` permission. Result:

- The technician cannot request a part. Fine, intended.
- But the Finish Gate still checks *"parts received must be marked used or returned."*
- And the work order can still enter `WAITING_PARTS`.
- So a work order that never had a part can still be **stranded in a state only the deleted module could clear.**

The workshop is now permanently broken, and the error surfaces days later as "why can't anyone finish a job." **That is the logical error to design out.** Disabling a capability is not subtraction — it is *rewiring*.

## 2a. Capabilities are not permissions

The distinction that makes the whole model coherent:

- **Capability** — *this workshop's business model includes an inventory.*
- **Permission** — *this user may issue a part from it.*

A permission can never resurrect a disabled capability. If `INVENTORY` is off and an Owner grants someone `inventory.request.issue`, the action is still denied — because capability sits **above** role and user permission in the effective order:

```
Platform Control → Plan / Entitlement → Tenant Capability → Module / Feature
→ Workshop Configuration → Role Permission → User Override → Scope
→ Workflow Status → Record Rule
```

Lower levels never override higher ones. The resolver already implements this shape as a literal iterated array with a `locked` short-circuit; capability slots in at position 3 (see §9).

## 2b. Five statuses, not a boolean

`ENABLED · DISABLED · READ_ONLY · EXTERNAL · LOCKED`

`EXTERNAL` is the one that earns its place. A workshop that issues legal invoices from separate accounting software is not "billing disabled" — the business function still happens, just outside MOP. So MOP must still record an external invoice reference and may still gate delivery on it. Modelling that as `DISABLED` would silently drop a real business requirement; modelling it as `ENABLED` would promise a document MOP never produces.

`READ_ONLY` and `LOCKED` keep a capability's transitions and gates live while restricting who may act — so they count as *active* for reachability purposes. `DISABLED` and `EXTERNAL` are the two that trigger a removal policy.

## 3. The capability registry

Every capability is a declared, typed entity in code — not a string in a database array. It lives in code because it encodes *behaviour*, and behaviour must be type-checked and tested.

```ts
interface Capability {
  key: CapabilityKey;            // "TEAM_REVIEW"
  tier: "CORE" | "STRUCTURAL" | "OPTIONAL";
  dependsOn: CapabilityKey[];    // must be present for this to work
  owns: {
    lifecycleStates: WorkOrderStatus[];  // states only this capability can create or clear
    gateChecks: GateCheckKey[];          // finish/delivery checks it contributes
    permissionKeys: PermissionKey[];
    pages: PageId[];
    roles: StaffRole[];                  // roles that exist only because of it
  };
  removal: RemovalPolicy;        // required for anything not CORE
}
```

### Three tiers

**CORE — never removable.** Tenancy and isolation, authentication, work orders, the audit trail, the finish gate *as a concept*, customer approval *as a concept*, invoicing. Remove any of these and it isn't MOP. The registry must make them structurally impossible to disable, not merely discouraged.

**STRUCTURAL — collapses a dimension.** Multi-branch, multi-warehouse, inventory, teams. These change from *many* to *one* or *zero*.

**OPTIONAL — a step or a convenience.** QC, team review, quick inspection, diagnostic codes, customer portal, WhatsApp links, part returns, refunds, discounts.

## 4. The removal policy — the heart of it

Anything non-CORE must declare a `RemovalPolicy` answering five questions. A capability without a complete policy **cannot be registered** — enforced by the type system and a test.

```ts
interface RemovalPolicy {
  reroute:      LifecycleReroute[];  // where does the flow go instead?
  gateChanges:  GateChange[];        // which checks are dropped or replaced?
  dataFate:     "PRESERVE_READ_ONLY" | "MIGRATE_FORWARD" | "BLOCK_IF_PRESENT";
  roleFate:     RoleFate[];          // what happens to users of an orphaned role?
  reversible:   boolean;
}
```

### Rule 1 — Reroute, never delete a step

If a capability owns a lifecycle state, removal must say what replaces the transition — never leave a dangling edge.

### Rule 2 — Removal changes behaviour and presentation, never the shape of the data

**A single-branch workshop still has exactly one `Branch` row.** "No branches" is modelled as *one branch, hidden from the UI*, never as `branchId = null`.

This rule is load-bearing. If collapsing a dimension changed the schema, then re-enabling it would be a data migration, and every record created while it was off would be malformed. Keeping the shape constant makes capability changes **reversible and history-safe**, which is what lets Super Admin adjust a live workshop without fear.

### Rule 2a — A gate belongs to the capability that produces what it checks

Found by a failing test while building §6, and worth recording because it is the same class of bug as the Inventory case.

When Inventory *and* Part Returns are both removed, Inventory's policy drops `parts.received_used_or_returned` while Part Returns' policy lists it under `gatesToKeep` (correct in isolation: if only returns are off, you still check parts were used). Resolving that by letting "keep" win resurrects a gate that nothing can satisfy — stranding every job, which is exactly the failure the model exists to prevent.

**The rule: a gate dies with the capability that owns it.** Dropped gates are derived from each inactive capability's `affectedGates`, never from the union of policy wish-lists. `gatesToKeep` means only *"my own removal does not drop this"* — it is never a veto over an owner having gone away. The validator additionally rejects any policy that claims to drop a gate it does not own (`GATE_NOT_OWNED`).

### Rule 3 — Separate the step from the channel

Customer approval is CORE. The *customer portal* is optional. A workshop with no portal still needs approvals — they happen at the counter and a receptionist records them, with the same acknowledgement record and the same audit weight. Conflating "the customer must agree" with "the customer clicks a link" is how removing the portal would silently delete consent.

The same distinction applies to QC (the *check* vs. *who performs it*) and to team review.

## 5. Worked examples

These four are the proof the model works. Every other capability is easier than at least one of them.

### TEAM_REVIEW removed
| | |
|---|---|
| **Reroute** | Finish → `READY_FOR_QC` if QC present, else → `PAYMENT_PENDING`. `READY_FOR_TEAM_REVIEW` becomes unreachable |
| **Gates** | Drop the "awaiting team review" delivery block |
| **Data** | `PRESERVE_READ_ONLY` — past supervision notes and `TeamMembership` rows stay readable in history. Who supervised job #123 last year must not become unanswerable |
| **Roles** | `TEAM_LEADER` orphaned → users must be reassigned or deactivated, explicitly, before apply. Never leave a user logged in with no pages |
| **Reversible** | Yes |

### INVENTORY removed — the case that proves the model
| | |
|---|---|
| **Reroute** | `WAITING_PARTS` unreachable. Parts become **priced catalogue lines with no stock movement**; the whole `PartRequest` lifecycle is skipped, not blocked |
| **Gates** | **Drop** "parts received must be used or returned" — it is meaningless with no issuing. **Keep** "approved work completed." This is precisely the check whose survival would strand every job |
| **Data** | `PRESERVE_READ_ONLY` — stock balances and movement ledger freeze, remain auditable |
| **Roles** | `INVENTORY_MANAGER` orphaned |
| **Reversible** | Yes, but re-enabling requires a stock-take: the frozen balances are stale |

### MULTI_BRANCH removed
| | |
|---|---|
| **Reroute** | None — no lifecycle state is owned |
| **Gates** | None |
| **Data** | One `Branch` row persists and is auto-selected. Branch scoping becomes a no-op. Branch selectors and columns disappear from the UI |
| **Roles** | `BRANCH_MANAGER` may remain (running the single branch) or merge into Owner — Super Admin's choice, made explicitly |
| **Reversible** | Yes, cleanly — because of Rule 2 |

### CUSTOMER_PORTAL removed
| | |
|---|---|
| **Reroute** | `AWAITING_CUSTOMER_APPROVAL` **remains** — the step is CORE. Decision requests become staff-recorded: a receptionist records the customer's verbal or in-person answer |
| **Gates** | Unchanged. Approval is still required before approved work proceeds |
| **Data** | `PRESERVE_READ_ONLY` — past portal decisions stay visible |
| **Roles** | None orphaned |
| **Reversible** | Yes |

## 6. Validation — proving a configuration is safe

Three checks, all run at *validate* time, before anything is applied.

**Static — dependency integrity.** Cannot disable a capability another enabled capability depends on. `PART_RETURNS` requires `INVENTORY`; `TEAM_REVIEW` requires `TEAMS`.

**Dynamic — live-data preconditions.** Count real records that only the departing capability can clear. *"14 work orders are in Ready for Team Review. Disabling this will move them to Ready for QC."* Stated as a number, in the impact preview, before confirmation — never discovered afterwards.

**Reachability — the formal version of "no logical errors."**

> From every non-terminal lifecycle state reachable under the proposed capability set, there must exist a path to a terminal state (`CLOSED` or `CANCELLED`).

This is a graph reachability check over the lifecycle with the proposed capabilities applied. A configuration that can strand a work order is **rejected at validate time**. This single check is what turns "smart delete" from an aspiration into something the system can guarantee, and it is cheap to compute and easy to unit-test.

It runs in CI against every shipped template, so a change to the lifecycle can never silently strand one of the standard profiles.

**Reachability applies to every entity with a lifecycle**, not only Work Orders — Tasks, Part Requests, Customer Decisions, Invoices and Payments each have their own terminal set, and each can be stranded independently. A graph whose entity is never created under a profile (a `PartRequest` in a workshop with no inventory) is skipped rather than reported: *"this never happens here"* is not the same defect as *"this happens and then gets stuck."*

### Built and proven

`packages/shared/src/capabilities/` — a pure function over a graph, no database, no framework, no clock, so it is exhaustively testable in isolation. 31 tests cover all six required smart-delete cases (Inventory, Customer Portal, Team Review, Multi-Branch, Billing-off-Finance-on, Finance externalised), every shipped profile, and the static integrity checks.

The test that matters most reconstructs the naive implementation — deny `inventory.*`, hide the pages, but leave the transition *into* `WAITING_PARTS` ungated — and asserts the validator **rejects** it, naming `WAITING_PARTS` and reporting that it has no path to a terminal state. That is the bug this layer exists to make impossible to ship.

## 7. Capability profiles (templates)

Named starting points, so creating a workshop is a choice rather than an assembly job:

- **Single-Bay Quick Service** — no inventory, no teams, no QC, single branch
- **Multi-Branch Full Service** — everything on
- **Heavy Equipment Field Service** — inventory on, multi-branch off, site/hour-meter fields on
- **Motorcycle Workshop** — quick service emphasised, full inspection optional
- **Diagnostics Only** — no inventory, no parts, no returns

A template is a starting capability set plus seed data. Super Admin applies one at creation and adjusts afterwards through the same governed pipeline.

## 8. Governance — capability changes are high-risk changes

Capability changes go through the existing pipeline, which already exists in the spec and now has its most important use:

**Draft → Validate → Preview → Impact Preview → Publish → Apply → Audit → Rollback**

- **Validate** runs §6's three checks.
- **Impact Preview** is computed live at dialog-open time and states affected users, roles, pages, in-flight records to be migrated, and reversibility.
- **Apply** runs in one transaction: capability rows, record migrations, role reassignments, audit — all or nothing.
- **Audit** records who, what, why, before/after, and the migration counts.

## 9. What exists today, and what has to change

**Built:** the registry, workflow graphs, removal policies, the reachability validator, and the shipped profiles (§3–§6), with 31 tests in CI.

**Still flat:** `TenantConfiguration.enabledModules` / `enabledFeatures` remain `String[]`, and `ModuleEnabledLayer` still denies with *"This module is not enabled for your workshop."* That is §2's naive version, and it is now the part that has to be replaced — the validator exists but nothing enforces its verdict at runtime yet.

**Schema changes needed:**

- **`TenantCapability`** — one row per (tenant, capability, period): `status`, `effectiveFrom`, `effectiveTo`, `source` (platform / plan / owner / migration / system), `lockedByPlatform`, `configuredBy`, `reason`. **Time-ranged**, because interpreting a two-year-old work order requires knowing which capabilities were active when it was created. A flat array cannot answer that.

  Concretely: a Work Order from 2026 has no part requests because Inventory was off then; Inventory was enabled in 2027. Without time-ranging, that old record reads as *corrupt* — missing stock movements, missing part lifecycle. With it, the record reads correctly as *"created while Inventory was disabled; parts were handled externally."* History must be interpreted under the rules that were in force when it happened.
- **`CapabilityChangeRequest`** — the draft/validate/preview/apply record, with computed impact and migration counts retained for audit.
- The registry itself stays **in code** — typed, tested, versioned with the behaviour it describes.

**Resolver changes:** capabilities feed layers 4–5, which is where they already belong. But smart delete needs something the resolver does not do — **workflow routing**. A `WorkflowRouter` must become the single component that answers "given this tenant's capabilities, what is the next state after finish?"

The timing here is fortunate: **that routing logic does not exist yet.** The lifecycle is Phase 3+. Building it capability-aware from the first line is nearly free; retrofitting it after five roles depend on hardcoded transitions is the expensive version of this document.

---

**Related:** [`SYSTEMS.md`](./SYSTEMS.md) · [`VISION.md`](./VISION.md) · [`REBUILD_PLAN.md`](./REBUILD_PLAN.md)

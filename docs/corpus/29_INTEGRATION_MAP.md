# MOP — Integration Map

> **Document ID:** DOC-29
> **Purpose:** how the subsystems reach each other, in what order, and where they must not.
> **Authority:** ARCHITECTURAL.
> **Scope:** cross-system dependencies, contracts, events, and the configuration cascade.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 18 (subsystems), 25 (backend layering), 08 §7 (events), 22 (invariants).

---

## 1. The rule

> **A system never reads or writes another system's tables directly.**
> Cross-system **reads** go through a published contract. Cross-system **changes** go through a domain event.

Without it, six systems collapse into one mud ball with six names — and the specific failure that produces is the one doc 01 §1 describes: the technician's screen, the stock ledger and the invoice each telling a different truth about one physical part.

## 2. The configuration cascade

Setting up a workshop is a chain, and each link constrains the next. Reading it top to bottom is the fastest way to understand why a given tenant behaves as it does.

```
Plan                    ceilings and allowed modules/reports/exports
  ↓
Capabilities            which steps exist at all
  ↓
Specialisation          what kind of work, and what shape of record
  ↓
Policies                the rule each existing step runs under
  ↓
Responsibility          who covers the work each capability creates
  ↓
Structure               branches and stores, and which draws from which
  ↓
Services & prices       what is sold, at what price
  ↓
Permissions             who may do each action
  ↓
Pages                   what each role sees
  ↓
Workflow                what may happen next to a job
```

**Each arrow is a real dependency, not a sequence.** Policies are only *asked* if their capabilities are active. Responsibility questions are only raised for capabilities that are on. Pages only appear for roles with permissions that survived every ceiling above them.

This is also the failure chain: a break high up is invisible until it surfaces low down. The `INVENTORY`-with-no-storekeeper hole (doc 03 §6) is exactly that — a capability turned on, a permission nobody held, and a part request that stuck.

## 3. Runtime dependency graph

```
                    ┌──────────────────┐
                    │  identity/access │  ← every request
                    └────────┬─────────┘
                             │ reads
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      control/capabilities  control/policies  control/platform
              │              │
              └──────┬───────┘
                     ▼
            systems/operations  ← the spine
                     │
      ┌──────────────┼───────────────┬──────────────┐
      ▼              ▼               ▼              ▼
 systems/inventory  systems/finance  systems/customer  systems/people
                     │
                     ▼
              systems/billing
                     │
      ┌──────────────┴──────────────┐
      ▼                             ▼
   audit/                     insights/  (read-only)
```

`experiences/` sits above everything and composes downward. Nothing depends on it.

## 4. The published contracts

`packages/shared/src/contracts/cross-system.ts`.

| Contract | From → To | Carries |
|---|---|---|
| `ChargeableWorkItem` | Operations / Inventory → Finance Core | `itemType`, `provenance`, quantity, `sourceType`/`sourceId`, `approvalStatus`, **frozen** `approvedUnitPrice` / `approvedLabourPrice` |
| `InvoiceCandidate` | Finance Core → Billing | Lines, tax breakdown, subtotal, discount, tax, total, currency, country, `billingProfile`, `invoiceType` |
| `InvoiceIssued` | Billing → Finance Core / Operations | Number, total, currency, `clearanceStatus`, issued-at |
| `InvoiceSnapshot` | Billing → anyone reading history | The immutable printed content |
| `BillingValidationResult` | Billing → Finance Core | Whether this country may issue at all |

Three properties make these contracts do real work:

- **Money is a `string`** on every one of them.
- **`provenance` travels with the item**, so Finance never has to ask Inventory what kind of part this was — which is what makes `CUSTOMER_SUPPLIED` (zero cost, labour billed, no warranty) expressible at all.
- **The approved price is frozen on the item**, not looked up later. That is the *approved price is immutable* rule of doc 10 §2, implemented at the boundary rather than trusted across it.

## 5. The event bus

`OperationEventsService` is the **only** place fan-out happens. 45 declared keys; see doc 21 §4 for the full list.

⚠️ Two caveats that matter before relying on this: the key list is **not type-enforced on the emit path** (`eventKey: string`), and there are effectively **two vocabularies** — 45 declared, 27 emitted, only 9 in both, with Finance and Inventory emitting entirely undeclared schemes. Separately, some built flows emit nothing at all. Gaps G-EVT-01/02.

### The worked example

A technician presses *mark part used* — one press:

```
technician.controller  POST /technician/parts/:id/used
  → PartRequestService.markUsed
      ├─ PartRequest → USED
      ├─ StockService.record(...)          issuedQty ↓         [Inventory]
      ├─ WorkOrderPartLine                                      [Inventory→Finance bridge]
      ├─ emit part.used                                         [event]
      └─ within the same transaction:
            ├─ ChargeableItemsService → ChargeableWorkItem      [Operations→Finance]
            ├─ RunningInvoice updated                           [Finance]
            ├─ CustomerTimelineEvent                            [Customer]
            └─ AuditLog                                         [Audit]
```

Downstream, without another write: the branch Attention Center re-ranks, the team leader's view changes, the journey strip's next poll shows the new state, and reports and analytics recompute from the ledger.

**Five systems agreed about one physical event, in one transaction.** That is the product's central claim, and this is where it is kept.

## 6. Where systems must NOT reach

| Forbidden | Instead |
|---|---|
| Finance reading `PartRequest` | Consume a `ChargeableWorkItem` |
| Inventory writing `RunningInvoiceLine` | Emit `part.used`; Finance builds the line |
| Operations writing `StockMovement` | Call `StockService.record()` |
| `experiences/` writing any table | Call the owning system's service |
| Any service writing `AuditLog` | `AuditService.record()` — **lint-enforced** |
| Any service writing `WorkOrder.status` | `WorkOrderLifecycleService.apply()` with an intent |
| `insights/` writing operational data | Read and derive only |
| `systems/` importing `experiences/` | Pass what the rule needs, not who is asking |
| Any tenant service writing `control/` tables | The governed change pipeline |

## 7. Shared code as an integration surface

`packages/shared` is imported by both `apps/api` and `apps/web`, which makes it the third integration boundary — and the one most likely to drift silently.

Two mechanisms keep it honest:

- **Exhaustive records.** `CAPABILITY_PRESENTATION` is a `Record<CapabilityKey, …>`, so adding a capability without copy **fails the build** rather than rendering a raw key. `Record`, not an array, deliberately.
- **CI assertions against the source tree.** `policy-consumers.spec.ts` asserts that every `ENFORCED` policy's named `Service.method` consumers actually exist; `lint-permission-keys.mjs` asserts every key literal is declared.

> **Trap:** after adding an export here, rebuild — `corepack pnpm --filter @mop/shared run build` — or `apps/api` typecheck will not see it.

## 8. External integrations

| Integration | State |
|---|---|
| **Postgres** | ✅ the only external dependency in the running system |
| **ZATCA / ETA billing adapters** | 🔴 `[INTENDED]` — `GenericBillingAdapter` holds the seam; **every real country is compliance-blocked until one ships** |
| **WhatsApp / SMS / email** | 🔴 `[INTENDED]` — templates complete, no transport |
| **Payment gateway** | 🔴 `[INTENDED]` — payments are recorded, not taken online |
| **File / photo storage** | 🟡 `Attachment` exists; storage strategy is in `INFRASTRUCTURE.md`, not implemented |
| **Push transport (WS/SSE)** | 🔴 `[INTENDED]` — polling is the current, deliberate choice |

**One external dependency today is a feature, not a limitation.** Every one added is a new failure mode to operate, and the country adapters are the only ones the product genuinely cannot ship without.

## 9. Integration failures this map is designed to prevent

Each has been seen, here or in v11.9.

| Failure | Countermeasure |
|---|---|
| **Island subsystems** — each passing its own tests while the edges break | Integration tests against real Postgres; golden journeys crossing every boundary |
| **Configuration islands** — a setting whose change produces no downstream difference | Every policy names its runtime consumers, asserted in CI |
| **A module bypassing the event pipeline** | One fan-out point — ⚠️ but the key union is not type-enforced, and several built flows do not emit (G-EVT-01/02) |
| **Two systems disagreeing about one fact** | One owner per table; contracts for reads |
| **A contract drifting from its producer** | Types in `shared`, imported by both sides |
| **A capability added without copy** | Exhaustive `Record` — compile error |
| **A permission key that is a typo** | `lint-permission-keys.mjs` |
| **⚠️ A service method with no HTTP door** | **None. Six exist today** — doc 25 §12 |

The last row is the open one: every other integration failure has a mechanism, and *implemented-but-unreachable* has only review.

## 10. Adding a cross-system interaction

1. **Ask whether it is a read or a change.** Read → contract. Change → event.
2. **The owning system stays the only writer** of its tables.
3. **Add the contract type to `shared`** and rebuild it.
4. **Add the event key to the closed union** if the interaction is a change.
5. **One transaction** for the write, the event and the audit row.
6. **Integration-test the boundary**, not just each side.
7. **Trace the whole chain to a page** — a contract nobody consumes is a configuration island with better types.

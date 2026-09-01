# INVENTORY EXECUTION MAP — 14-Day Quick-Service Launch

**Purpose:** make the *existing* inventory subsystem a first-class participant in the launch journey. Nothing here invents architecture; every row cites verified code (`a8c8bb5`). Primary sources: audit reports 06 §Cycle E, 08 §3, 03 (gates), 00 Phase 5 chains.

---

## A. Current inventory capabilities — page by page

| Surface | Implementation status | Backend | Database | API | Permissions | Workflow integration today | Missing pieces for launch |
|---|---|---|---|---|---|---|---|
| **Inventory Home** (`inventory-home.ts` ↔ `GET /inventory/home`) | Real; triage cards incl. "requests awaiting store" count | `inventory-home.service.ts` (220 L projection) | counts on PartRequest/WarehouseStockBalance | exists | SessionGuard + inventory perms | passive overview | none |
| **Requests queue** (`inventory-requests.ts`) | Real; approve / reject / unavailable / issue (issue qty capped by shelf qty in UI) | `PartRequestService.approve/reject/markUnavailable/issue` | PartRequest + IssuedItem + balance + movement + WorkOrderPartLine in ONE tx on issue | `POST /inventory/requests/:id/{approve,reject,unavailable,issue}` | `inventory.requests.*` keys | `approve` enforces P-07 separation-of-duties; `issue` performs `PART_RECEIVED` lifecycle move | **reject/unavailable unlock rule** (see D) |
| **Stock** (`inventory-stock.ts` ↔ `GET /inventory/stock?q=`) | Real | `StockService` read paths | WarehouseStockBalance buckets (available/damaged/returnPending…) | exists | inventory perms | ledger truth feeding gates | none |
| **Item detail** (`inventory-item.ts` ↔ `GET /inventory/items/:id`) | Real; "the ledger IS the page" — movements with beforeQty/afterQty | `inventory-view.service.ts` | StockMovement history | exists | cost hidden w/o `inventory.cost.view` | replayable audit trail | none |
| **Catalog** (`inventory-catalog.ts`) | Real; create/update item master; quantity deliberately NOT settable here | `CatalogService` | InventoryItem (+cost column gated) | `GET/POST /inventory/catalog[/:id]` | SKU clash refused | prices snapshot into billable lines at issue | pilot catalog data (seed/content task) |
| **Returns/Movements** (`inventory-returns.ts`, 246 L) | Real; queue accept/reject/clarify + filterable movements ledger; accept wraps `acceptReturn`+`completeReturn` (stock reversal at recorded warehouse, RETURN_TO_STOCK or DAMAGED, `unbillReturnedQuantity`) | `PartRequestService.return*` family | PartReturnRequest + negative RETURN_PENDING + movements + bill-line edit | `GET /inventory/returns`, `POST /inventory/returns/:id/{accept,reject,clarify}`, `GET /inventory/movements` | inventory return keys; `parts.no_pending_return` gate reads pending states | full manager half live | **technician-side trigger endpoints** (see F — G5) |
| **Reports** (`inventory-reports.ts`) | Real; velocity/usage/risk | `inventory-reports.service.ts` | aggregates | exists | – | feeds analyst analytics later | out of launch polish scope |
| **Warehouse deactivate** | Real; BLOCK_UNTIL_ZERO + HIGH audit | `WarehouseService` | warehouse.active | `POST /inventory/warehouses/:id/{deactivate,reactivate}` | org perms | protects ledger integrity | none |

**Already-true guarantees the launch inherits (do not re-test from scratch, do assert in CI):** FOR UPDATE row lock on issue; `afterQty ≥ 0` refused in service AND DB CHECKs; before/afterQty stored per movement; partial fulfilment derived (never cached); billable line upserted on unique `(workOrderId, partRequestId)` so a part bills exactly once; return shrinks/deletes the bill line; P-07 self-approval refusal.

---

## B. The real part lifecycle (existing domain model — no parallel states invented)

```
            ┌────────────── Workshop part path ──────────────┐
Technician "needs part"
   POST /technician/work-orders/:id/parts
   ⇒ PartRequest(REQUESTED) + WO moveIfPossible(REQUEST_PART) → WAITING_PARTS
        │ IM approves (P-07: not self if policy DIFFERENT_PERSON)
        ▼
     APPROVED ─── IM issues (qty ≤ shelf) ──▶ ISSUED
        │                                     │  one tx: IssuedItem + StockMovement(ISSUE,
        │                                     │  before/afterQty) + WorkOrderPartLine(price
        │                                     │  snapshot) + event + WO moveIfPossible(
        │                                     │  PART_RECEIVED) ⇒ back to IN_PROGRESS
        │                                     ▼
        │                        TECHNICIAN receives ⇒ RECEIVED_BY_TECHNICIAN
        │                                     │  (ARRIVED optional: ISSUED→RECEIVED edge exists)
        │                                     ▼
        │                              USED (fitted) ⇒ gate satisfied
        │
        ├── IM rejects / marks UNAVAILABLE ⇒ request closed;
        │     WO remains WAITING_PARTS until unlock rule (D-R3) satisfied
        │
        └── Return path (PART_RETURNS ON):
             Tech requests return ⇒ RETURN_REQUESTED (+RETURN_PENDING movement)
                ├ IM clarifies ⇒ RETURN_CLARIFICATION_REQUESTED ⇄ Tech answers
                ├ IM rejects ⇒ RETURN_REJECTED (Tech may resolve ⇒ USED, pending cleared)
                └ IM accepts + completes ⇒ RETURNED_TO_STOCK | DAMAGED
                     + stock reversal at recorded warehouse + bill line reduced/deleted
```

States deliberately **excluded from the launch surface** (exist in enum/view filters but nothing sets them): `WAITING_TRANSFER`, `WAITING_SUPPLIER`, `ARRIVED` (optional bypass), supplier-order flows. They remain dormant, reachable later without migration.

---

## C. Role responsibilities across the loop

| Actor | Responsibility in the inventory loop | Sees |
|---|---|---|
| Technician | declares need; receives; fits (USED); answers store clarifications; requests returns | own jobs' parts panel: state + plain-language waitingOn/action |
| Inventory Manager | approves (or refuses w/ reason), issues against shelf truth, adjudicates returns, keeps catalog/stock honest | full queue + ledger + cost (if granted `inventory.cost.view`) |
| Branch Manager | never touches stock pages to learn *why* a job is stuck: Attention WAITING_PARTS tile + workspace journey stage + dossier parts section | job-level aggregation, no warehouse internals beyond need |
| Customer | observes truthfully-delayed progress | journey stage "waiting for part" + timeline sentence; **no** warehouse/staff/cost data (safe projection) |
| Finance (system) | part value enters money chain exactly once at issue-price-snapshot; returns reverse it | billable line ↔ running invoice absorption |

## D. Workflow consequences — explicit state/gate map

**Work-order level transitions (all through `WorkOrderLifecycleService` — sole writer):**

| Trigger | From → To | Notes |
|---|---|---|
| Tech requests part (`REQUEST_PART`) | IN_PROGRESS → **WAITING_PARTS** | verified existing behavior |
| IM issues final qty (`PART_RECEIVED`) | WAITING_PARTS → IN_PROGRESS | fires inside issue tx |
| IM rejects / marks unavailable | *(no transition)* | job stays WAITING_PARTS — see rule R3 |
| (INVENTORY off — not our profile) | blocker `WAITING_PART` instead | why the engine matters |

**Gate effects (`GateEvaluatorService`, FINISH checkpoint):**

| Gate | Blocked while | Unlock |
|---|---|---|
| `parts.received_used_or_returned` | any request in ARRIVED / RECEIVED_BY_TECHNICIAN (i.e., issued-but-not-yet-accounted) — suppressed entirely if policy P-08 ∈ {WARN_ONLY, NOT_REQUIRED} | tech marks USED |
| `parts.no_pending_return` | any request in RETURN_REQUESTED / RETURN_CLARIFICATION_REQUESTED | return completed/rejected-resolved |
| `parts.external_resolved` | CUSTOMER_SUPPLIED / EXTERNAL_PURCHASE part-lines with empty name | named entry recorded |

**Launch operating rules (to implement/verify, small):**
- **R1:** partial issue keeps request APPROVED ⇒ gate stays blocked ⇒ job cannot falsely finish. (Existing behavior — add explicit test.)
- **R2:** clarification loop keeps `no_pending_return` shut until answered. (Existing.)
- **R3 (the one real gap):** a rejected/unavailable request leaves the job in WAITING_PARTS by design. Launch rule: the technician's parts panel offers, for a closed request, the two truthful continuations that already exist — request a different part (new REQUESTED row; its later issue fires PART_RECEIVED), or record an external/customer-supplied line (EXTERNAL_PARTS ON). **Verify the external-line entry path end-to-end on Day 3; if the write path lacks an endpoint, add the minimal one inside `PartRequestService`/controller — no new model.**
- **R4:** customer-visible wording comes only from the safe projection/journey labels; staff names, warehouse ids, costs never appear (already enforced by shape).

## E. Database records involved (per part, happy path)

1. `PartRequest` (tenantId, workOrderId, itemId, qty, status REQUESTED→…, approvedById stamped on transition-in)
2. `IssuedItem` (partRequestId **non-unique**, qty, warehouseId, arrivedAt null-able)
3. `WarehouseStockBalance` bucket update + `StockMovement` (type ISSUE, beforeQty, afterQty)
4. `WorkOrderPartLine` (unique key per request; lockedUnitPrice/sellingPrice snapshot; provenance WORKSHOP)
5. `OperationEvent` part_request.{requested,issued,…} + AuditLog rows (risk-tiered)
6. Downstream: `RunningInvoiceLine`(sourceType PART_REQUEST, sourceId) absorbed → `InvoiceLine.lockedUnitPrice`
Return path adds: `PartReturnRequest`, reversal movement(s), bill-line reduction/deletion, `RETURNED_TO_STOCK|DAMAGED` booking.

## F. API surface

**Existing & verified (no work):** `GET /inventory/home|stock|reports|movements|returns`; `GET|POST /inventory/catalog[/:id]`; `GET /inventory/items/:id`; `POST /inventory/requests/:id/{approve,reject,unavailable,issue}`; `POST /inventory/returns/:id/{accept,reject,clarify}`; `GET /branch-manager/attention` (WAITING_PARTS detector); dossier parts section; journey endpoints ×3 audiences.

**New for launch (small, contracts fixed Day 1):**
| Endpoint | Owner | Purpose |
|---|---|---|
| `POST /technician/parts/:id/return {qty, reason}` | A1 → A2 consumes | wraps existing `requestReturn()` (creates PartReturnRequest + RETURN_PENDING at recorded warehouse) |
| `POST /technician/parts/:id/clarification {answer}` | A1 → A2 consumes | wraps `respondToClarification()` (loop back to RETURN_REQUESTED) |
| `POST /technician/work-orders/:id/external-part {name, provenance, qty?}` *(only if Day-3 verification finds no write path)* | A1 | records customer-supplied/external line satisfying `parts.external_resolved` |

Explicitly **not** added: markArrived surface (ARRIVED optional by graph), transfers, supplier orders.

## G. UI changes (exact)

1. **Tech Work Card — parts panel:** states/actions already largely render (waitingOn/action map exists in `technician-work-view.service.ts`); ADD: return button (state-gated), clarification answer form (currently shows "waitingOn YOU, action: null" — give it the action), external/customer-part entry when R3 applies. Remove nothing.
2. **IM Requests queue:** verify partial-issue input honors shelf cap (exists); badge counts consistent with Home cards.
3. **BM surfaces:** Attention CHECK_PARTS action links to filtered requests (S-1 subset now MUST-lite: this one action); workspace journey already shows WAITING_PARTS stage — verify label wording.
4. **Customer:** no new component — verify journey stage + timeline sentences via safe projection (copy check only).
5. **Surface narrowing pass** (from launch scope) explicitly preserves all inventory pages/routes.

## H. Tests — existing vs. required additions

Existing (keep green; they are strong): `stock.integration.spec.ts` (lock/negatives), `part-request.integration.spec.ts` (685 L), `partial-fulfilment.integration.spec.ts`, `inventory-walkthrough.integration.spec.ts`, `warehouse.integration.spec.ts`, gate tests within lifecycle suite.

Additions mapped to acceptance tests A–J (§19 of approval): HTTP-level kit specs — A queue visibility, B issue-over-HTTP, C before/after assertions incl. concurrent double-issue refusal, D card payload states, E customer journey stage during WAITING_PARTS (audience CUSTOMER), F exactly-once billing (absorption idempotency + unique line), G return reversal (stock + bill line), H false-completion prevention (finish 409 while gate blocked), I tenant isolation (cross-tenant request invisible), J CLOSED termination. All land in Honesty Harness scenario.

## I. Browser journeys (staging, manual + scripted)

1. Tech requests part → sees WAITING state; job leaves board "In progress" lane for "Waiting parts".
2. IM approves → issues → shelf qty drops; ledger shows movement.
3. Tech receives → fits (USED) → finish-check reflects accounted part.
4. Customer (token/portal) sees "waiting for part" then progression — never internal detail.
5. Invoice contains part at snapshotted price exactly once.
6. Return flow: request → clarify → answer → accept → stock restored, bill reduced.
7. Full journey reaches CLOSED with all three parts gates satisfied.

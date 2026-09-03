# MOP — The Customer Experience

> **Document ID:** DOC-11
> **Purpose:** everything the vehicle's owner sees and does, and the privacy boundary that governs it.
> **Authority:** DESCRIPTIVE — but §2 is a **security specification**, not a presentation guideline.
> **Scope:** the customer portal, the public decision link, the customer decision lifecycle, the safe-history rules.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `apps/api/src/systems/customer/`, `apps/web/src/app/experiences/customer/`, `packages/shared/src/capabilities/workflow-graphs.ts` (`CUSTOMER_DECISION_GRAPH`), `docs/detailed-specs/customer.md`.
> **Related:** 01 §4.5 (asymmetric visibility), 04 (`APPROVAL_WEIGHT`, `PORTAL_COUNTER_APPROVAL`, `CUSTOMER_INVOICE_VISIBILITY`), 33 (security).

---

## 1. Who this person is

The customer is **the only actor in MOP who is not an employee**. Everyone else is subject to a contract, a policy and a manager. The customer is an outsider with a link.

That makes this the **highest-consequence surface in the product**: a mistake here is a real-world privacy incident, not a bug report. It is also the *trust product* of doc 01 §3 — its quality bar is that the customer always knows two things:

1. What is happening to their vehicle.
2. Whether it is their turn to do something.

## 2. The privacy boundary

> **Restricted data must be ABSENT from the response, never hidden client-side.**

Anyone can open developer tools. If it is in the payload and hidden by CSS, **it has already leaked**.

### Asymmetric visibility is a translation, not a filter

*"Inventory Manager created a supplier order for unavailable brake pads"* becomes, for the customer:

> *"We are waiting for a required part. The branch will update you when it arrives."*

Not a shortened version — **a different statement**, produced deliberately. That exact string is the `customerSafeMessage` on the `INVENTORY` capability's removal policy, which is why it survives capability changes rather than living in a component.

### The four things a customer must never receive

| Never | Because |
|---|---|
| Internal cost or margin | Commercial |
| Staff notes, supervision notes, internal reasons | They are about employees, not the customer |
| Another customer's anything | Isolation |
| **A previous owner's data on a transferred asset** | `AssetOwnershipHistory` closes the previous owner's window; a new owner sees technical history, never the previous owner's financials |

### Verified, not asserted

- Customer Decision Analytics carries **no customer-identifying field**, asserted by its own test.
- A **smuggled price field** on a decision response is refused — walked end to end against a running stack.
- Safe Technical History labels entries by **plate or VIN cross-referenced from the customer's own asset list**, never a raw asset id.

## 3. The two ways in

| Path | Auth | Why both exist |
|---|---|---|
| `/decide/:token` | **None.** `CustomerDecisionRequest.secureToken` scopes it to one request | This is what a WhatsApp message points at. Requiring a login first would break the flow the whole feature exists for |
| `/customer/**` | A `CUSTOMER` account behind `authGuard` | The other end of the same feature, for a customer who no longer has the message |

`/register` is the **only self-registration path in the whole product**. It resolves `Tenant.slug` or `customerRegistrationCode` — case-insensitively, excluding frozen, suspended and archived tenants — as its own step, then creates the linked `Account` + `Customer`. It **does not auto-login**, matching Invite Accept's precedent.

## 4. The six pages

| Page | Route | What it shows | Notes |
|---|---|---|---|
| **Portal Home** | `/customer` | Pending decisions lead the screen when nonzero | Per the spec's own note: that is usually why the portal was opened at all |
| **My Assets** | `/customer/assets` | The customer's vehicles or machines | A **card grid, not a table** — most customers own exactly one asset |
| **Current Service** | `/customer/service` | One plain-language phrase per open job | 🟡 The spec asks for a full lifecycle strip; the API exposes status only, so the phrase is honest rather than a client-side fabrication. Real future work against the same page |
| **Decision Page** | `/decide/:token` | The question, the items, and the answer control | Public. Critical-rejection acknowledgement enforced **server-side** |
| **Invoice & Payment Status** | `/customer/invoices` | `total` / `paid` / `balance` | Rendered as **the exact strings the server sends** |
| **Safe Technical History** | `/customer/history` | What was done to this asset | Ownership-scoped |

All six are `[INTEGRATED]`. The shell uses **bottom navigation**, like the technician's — for the same reason (a phone held one-handed), though the two personas are otherwise unrelated.

## 5. The customer decision lifecycle

`CUSTOMER_DECISION_GRAPH`. Initial `PENDING`; terminal `RESOLVED`, `EXPIRED`, `CANCELLED`.

```
PENDING ──► SENT ──► VIEWED ──┬─► PARTIALLY_RESPONDED ──► RESOLVED
   │          │        │      └─► RESOLVED
   │          └────────┴─────────► EXPIRED
   └──► CANCELLED
```

**Every edge except `PENDING → CANCELLED` requires `CUSTOMER_PORTAL`.**

### The step is core; the channel is optional

Removing `CUSTOMER_PORTAL` disables `SENT`, `VIEWED` and `PARTIALLY_RESPONDED` and adds two replacement edges:

- `PENDING → RESOLVED` — *approval recorded at counter by staff*
- `PENDING → EXPIRED` — *customer never returned*

Without those, every decision request would strand at `PENDING` and **no work could ever be approved** in a workshop without a portal.

Correspondingly, `customer_decisions_resolved` and `critical_warning_acknowledged` are **core gates with no owner**. A workshop with no portal still needs the customer's answer; it is recorded at the counter with the same acknowledgement record and the same audit weight.

## 6. The three policies that shape this surface

### `APPROVAL_WEIGHT` — how much ceremony an answer carries

| Option | Behaviour |
|---|---|
| `TWO_TIER` *(default)* | Formal acknowledgement — the same modal every `CRITICAL` rejection already showed — for `HIGH` and `CRITICAL` items only. `LOW` and `MEDIUM` record with a single choice, no modal |
| `SINGLE_WEIGHT` | The same acknowledgement for **every** item, including a routine `LOW` one |

**`CRITICAL` requires acknowledgement under both.** That is the floor the policy cannot lower.

`PER_ITEM_CHOICE` was **dropped rather than faked**: it needs a real per-item tier chosen when the item is raised, and the backend flow for a technician to raise and send a decision item does not exist yet — there is nothing for a per-item choice to attach to.

### `PORTAL_COUNTER_APPROVAL` — may staff answer for the customer?

| Option | Behaviour |
|---|---|
| `ALLOWED_ATTRIBUTED` *(default)* | Staff may record it |
| `ALLOWED_WITH_EVIDENCE` | A non-empty `evidenceReference` is required first |
| `PORTAL_ONLY` | Refused outright |

**Attribution to staff — never the customer — holds unconditionally under all three.** That is what lets a dispute three weeks later distinguish *"the customer clicked approve"* from *"someone said the customer agreed on the phone."*

### `CUSTOMER_INVOICE_VISIBILITY` — is a price shown beside a finding?

`SHOWN` (default) or `HIDDEN`. The only policy that sets `changesVisibility: true`, and therefore the only one subject to §2's absent-not-hidden rule.

## 7. The critical-rejection path

The awkward scenario the product must not fumble: **the customer rejects a safety-critical repair and drives away.**

1. The item is `CRITICAL`; the customer rejects it.
2. The formal acknowledgement is required **server-side**, under either `APPROVAL_WEIGHT` option. An unacknowledged safety rejection is **refused** — verified end to end against a running stack.
3. `critical_warning_acknowledged` — a core Finish gate — cannot pass until it exists.
4. The job can then finish and the vehicle can be delivered, with the acknowledgement on record.

The product does not prevent the customer from making that choice. It prevents the workshop from ever being unable to prove the choice was made.

## 8. What the customer's timeline actually is

`CustomerTimelineEvent` is **produced**, not filtered. Internal events fan out through `OperationEventsService`, and the customer-facing statement is generated deliberately from the safe vocabulary — which is why removing a capability can change the wording (`customerSafeMessage`) rather than leaving a dangling reference to a step that no longer exists.

`SafeTechnicalHistory` is the durable version of the same idea: what a *future* owner may see about this asset.

## 9. Messaging — the honest gap

`MessageTemplate` holds all **8** customer-facing templates: immutable per-version rows, a variable-insertion toolbar, live preview, and Publish blocked with the exact missing-variable name until every required `{{var}}` is present. A real platform-default body backs every template before an Owner ever publishes one.

⚠️ **No message-sending code exists anywhere in the product.** No WhatsApp, no SMS, no email, no Ask-Customer send panel. The templates are the complete, real source of truth **ready for that code to read from**, deliberately not a second hardcoded copy.

This is why Feature Adoption Analytics reports Message Templates as **not trackable yet** rather than showing a fabricated count. See doc 30.

## 10. The permission-model deviation, recorded

⚠️ **The eleven-layer permission resolver has no real opinion about a `CUSTOMER` session.** Every layer defers when there is no tenant-staff role to evaluate. Portal access is therefore checked directly on `session.accountType` / `enabledModules`, mirroring the public decision controller's own reasoning.

Consequence: the five `customer.*` permission keys — `customer.portal.view`, `customer.asset.view_own`, `customer.service.view_own`, `customer.invoice.view_own`, `customer.history.view_safe` — are **declared and seeded but never checked by any production code path.**

This is documented rather than smoothed over because a reader who assumes the resolver covers customers will design the next customer feature wrongly. Owed as a permission-engine rework; gap **G-SEC-02** in doc 37.

## 11. Implementation status

| Element | Status |
|---|---|
| All 6 customer pages, real API, real routes | ✅ `[INTEGRATED]` |
| Public `/decide/:token`, token consumed on use | ✅ `[VERIFIED]` — walked end to end |
| Server-side critical-rejection acknowledgement | ✅ `[VERIFIED]` |
| Smuggled-price refusal | ✅ `[VERIFIED]` |
| Counter approval, attributed to staff | ✅ `[VERIFIED]` |
| Self-registration by slug or registration code, frozen tenants excluded | ✅ `[INTEGRATED]` |
| Ownership-scoped safe history | ✅ `[INTEGRATED]` |
| Money rendered as server strings | ✅ `[INTEGRATED]` |
| Current Service full lifecycle strip | 🟡 — one plain-language phrase today; the API exposes status only |
| Message delivery (any channel) | 🔴 `[INTENDED]` — templates ready, transport absent |
| Journey freshness | ✅ `[IMPLEMENTED]` — a deliberate 20-second poll (`journey-poller.ts`), never optimistic: the strip is redrawn only from a server response |
| Push realtime (WebSocket / SSE) | 🔴 `[INTENDED]` — polling is the current transport by decision, not by omission |
| `CUSTOMER` sessions inside the permission resolver | 🟡 — checked on `accountType`; 5 permission keys unconsumed |
| Customer-initiated payment | 🔴 `[INTENDED]` — the portal shows the balance; paying happens at the counter |

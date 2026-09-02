# MOP — Known Gaps and Technical Debt

> **Document ID:** DOC-37
> **Purpose:** every known gap with an id, an impact, a root cause and a resolution — so no agent rediscovers the same problem twice.
> **Authority:** STATUS.
> **Scope:** the whole product.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`. Findings marked **NEW** were discovered while building this corpus and are not recorded elsewhere.
> **Related:** 36 (status), 35 (journeys), 22 (invariants), 38 (decisions).

---

## Severity

| | Meaning |
|---|---|
| **S1** | Blocks a real user from completing real work, or blocks trading |
| **S2** | A finished system is unreachable, or a claim in the product is untrue |
| **S3** | A named piece of a spec is missing; the surface works without it |
| **S4** | Debt with no user-visible effect today |

**A gap is not a plan.** Several entries below are deliberate deferrals with recorded reasoning; those are marked 💤 and are not debt.

---

## S1 — Blocking

### G-BILL-01 · No country-specific billing adapter
**Impact.** In markets where an invoice must be cleared by a government portal (Egypt ETA, Saudi ZATCA), **an uncleared invoice is not legally valid.** Every real country is compliance-blocked until an adapter ships.
**Root cause.** Phase 9 built the engine and the seam; no adapter was written.
**Affected.** Billing · Finance · every tenant in a regulated market.
**Present state.** `GenericBillingAdapter` holds the seam. `UNCOVERED_COUNTRY_BILLING` defaults to `WARN_ONLY` **precisely because the covered-country list is empty**, and `FinanceConfiguration.compliantBlocked` is surfaced on the platform workshops list and drawer. The product is honest about being blocked.
**Resolution.** One real adapter, behind the existing interface.
**Status.** 🔴 Open. **The single largest gap in the product.**

### G-OPS-01 · A blocked job can never be finished · **NEW**
**Impact.** `BLOCKED` is the only non-terminal state with **no user-facing exit**. `no_open_blocker` is a core Finish gate, so a job that hits a blocker cannot be finished. The only remaining route out is `BLOCKED → CANCELLED`, which is not what a blocker means. **A real job is trapped.**
**Root cause.** `TechnicianWorkService.resolveBlocker` is implemented, tested (including the H1 race) and **has no controller route**. `workorders.branch.manage_blockers` exists and is checked by nothing.
**Evidence.** `resolveBlocker` appears only in `technician-work.service.ts` and three integration specs.
**Resolution.** One endpoint plus one control. Blocks golden journey GJ-8.
**Status.** 🔴 Open.

---

## S2 — Finished systems with no door

### G-OPS-03 · Tasks cannot be created through the product · **NEW**
**Impact.** `TechnicianWorkService.createTask` is the **only writer of `Task`** anywhere in the codebase, and nothing routes to it. `Task` rows exist only in `seed-demo.ts`. Everything downstream — task start/complete, the `task.*` permissions, `TIME_TRACKING`, the `approved_work_completed` gate, technician throughput analytics — operates on rows the running application cannot produce.
**Root cause.** Intake creates a work order and no tasks; no page creates one.
**Resolution.** Decide who creates a task (intake, approval, or the technician) and give it a door. Makes GJ-1 fully passing.
**Status.** 🔴 Open.

### G-INV-02..05 · The technician half of the returns loop has no door · **NEW**
**Impact.** The Inventory Manager's accept / reject / clarify queue is complete, integrated and tested — **and can only ever be filled by the demo seed.**

| Id | Command | Missing |
|---|---|---|
| G-INV-02 | `requestReturn` | A technician cannot return an unused part |
| G-INV-03 | `respondToClarification` | The clarify loop has an ask and no reply |
| G-INV-04 | `markArrived` | A travelled part cannot be confirmed arrived |
| G-INV-05 | `resolveRejectedReturn` | A rejected return cannot be closed out |

**Root cause.** Phase 7 built the manager's side; the technician's side was never routed.
**Resolution.** Four endpoints on `TechnicianController` and four Work Card controls. Blocks GJ-2.
**Status.** 🔴 Open.

### G-INV-01 · Four part-request statuses are read but never written · **NEW**
**Impact.** `PartRequestStatus` declares 19 values; `PART_REQUEST_GRAPH` declares 15. `WAREHOUSE_REVIEWING`, `IN_TRANSIT`, `WAITING_TRANSFER` and `WAITING_SUPPLIER` have **no edge and no writer** — yet live code reads them:
- `inventory-view.service.ts:72` filters open requests on three of them
- `inventory-home.service.ts:98,106` counts triage cards using two
- `technician-work-view.service.ts:85–95` carries customer-facing copy for all four

**The reading side already behaves as though these states occur.** A technician can never see *"On its way from another branch."*
**Root cause.** Enum values added ahead of the transfer and supplier-order flows that would produce them. Identical in kind to the `RETURN_REJECTED` / `RETURN_CLARIFICATION_REQUESTED` bug already fixed — *the graph is what `canTransition()` checks, not the enum.*
**Resolution.** Either add the graph edges and the flows that write them (G-INV-06/07), or remove the statuses and the dead reads. **Do not leave them half-alive.**
**Status.** 🔴 Open. Violates invariant W-6.

### G-CTRL-01 · Subsystems modelled and tested with no surface
| Subsystem | State |
|---|---|
| Tenant relationships (`TenantStakeholder`, `TenantGroup`) | Services, models, tests; **no controller, no page**. Phase 18.B/C deferred |
| Staff restriction | `restrict` / `lift` + audit actions; **no surface** — and it is a resolver ceiling |
| Work-order disputes | `WorkOrderDispute` + `raise`; **no surface** |
| Specialisation entries | `fillEntry` / `entriesFor` / `reviseFields`; **no page fills a card in** |
| Credentials | `define` / `grant` / `forTechnician`; **no surface** |
| Position taxonomy | `forCategory`; **no consumer** |

**Status.** 🔴 Open. Partly deliberate (18.B/C), partly drift.

### G-MSG-01 · No message transport
**Impact.** 8 complete templates, versioned, previewed, publish-gated — **and nothing sends.** `CustomerDecisionStatus.SENT` is unreachable. Feature Adoption reports templates as *not trackable yet*.
**Root cause.** Channel adapters were always future work; the templates were built first, deliberately, so no service would hardcode a body.
**Resolution.** doc 30 §4 specifies the shape.
**Status.** 🔴 Open.

### G-FORM-01 · Nothing captures a form or specialisation value
**Impact.** `CustomFieldDefinition` and `validateValues()` are real and tested; `SpecializationDefinition` versioning is real. **No page captures a value for either.** Owner Forms & Fields is 🟡 for exactly this reason.
**Resolution.** One technician-side recording page closes both halves.
**Status.** 🔴 Open.

### G-SEC-02 · Customer authorization bypasses the resolver
**Impact.** The eleven layers have no opinion about a `CUSTOMER` session; portal access is checked on `session.accountType`. Five `customer.*` permission keys are declared, seeded, and **checked by nothing**.
**Why it holds today.** The portal services shape their own responses — **by care, not by mechanism.**
**Resolution.** Extend the resolver to customer sessions.
**Status.** 🔴 Open, documented since Phase 11.

### G-PERM-01 · Seven orphaned permission keys · **NEW (partly)**
`workorders.branch.reassign_technician` · `workorders.branch.manage_blockers` · `team.issue.flag_to_branch_manager` · `inventory.transfer.create` · `inventory.supplier_order.create` · `decisions.branch.view` · `inspection.codes.view`

Plus five checked only in tests: `finance.invoice.view` · `inventory.stock.view` · `inventory.stock.adjust` · and two above.

**Root cause.** `lint-permission-keys.mjs` deliberately does not flag a declared-but-unchecked key — a key ahead of its page is normal. That correct decision leaves genuinely orphaned keys invisible.
**Resolution.** Either give each an endpoint, or remove it. `manage_blockers` and `reassign_technician` should be closed with G-OPS-01/02.
**Status.** 🔴 Open.

### G-OPS-02 · No technician reassignment · **NEW**
`workorders.branch.reassign_technician` is held by Branch Manager and there is **no reassignment endpoint or control anywhere.**
**Status.** 🔴 Open.

### G-EVT-01 · The domain-event union is decorative on the emit path · **NEW**
**Impact.** `OPERATION_EVENT_KEYS` exists so that *"a typo is a compile error"* and *"which events exist has one answer"*. **Neither holds.** `EmitOperationEventInput.eventKey` is typed `string`, not `OperationEventKey`, and `OperationEventKey` is imported **only by its own spec** (`contracts.spec.ts`) — nothing in `apps/api` type-checks against it.
**Evidence.** Four undeclared keys are emitted in production today: `task.started`, `task.blocked`, `task.return_for_rework`, `customer_decision.recorded`. A test fixture emits a fifth, `some_future.event_nobody_mapped`.
**Root cause.** The union was defined in `shared`; the emit interface was written independently in `apps/api` and never narrowed to it.
**Why it matters beyond tidiness.** This is precisely the **decorative abstraction** class that D-001 exists to prevent — a named structure that looks like it enforces something and does not. It is the same shape as v11.9's permission hierarchy that nothing iterated.
**Resolution.** Type `eventKey` as `OperationEventKey`, then either declare the four keys in use or rename them to declared ones. One-line change plus whatever it surfaces.
**Status.** 🔴 Open.

### G-EVT-02 · 26 of 45 declared event keys are never emitted · **NEW**
**Impact.** Some are honest vocabulary ahead of unbuilt features (`invoice.cleared`, `debit_note.issued`, `asset.ownership_transferred`). **Others belong to flows that are built and simply do not emit:**

`stock.movement_recorded` · `chargeable_item.added` / `.removed` · `running_balance.updated` · `invoice_candidate.created` · `refund.requested` / `.approved` · `credit_note.issued` · `part.unavailable` · `part.return_requested` / `.return_accepted` / `.return_rejected` · `workshop.frozen` / `.reactivated` · `permission.changed` · `platform_control.changed` · `customer_decision.sent` / `.expired` · `task.finish_attempted`

**Consequence.** Those flows change state **without emitting the event that would fan it out**, so the truth-propagation guarantee (doc 01 §4.4) holds for the paths that emit and not for these. A stock movement, a refund and a credit note happen without a domain event; anything downstream that would have subscribed sees nothing.
**Root cause.** The vocabulary was declared up front (correctly); emission was added per feature and did not keep pace.
**Resolution.** For each built-but-silent flow, emit at the existing write site inside the existing transaction. For the genuinely-future keys, leave them and let G-EVT-01's typing keep them honest.
**Status.** 🔴 Open.

### G-MODEL-01 · Eight Prisma models with no production access · **NEW**
**Impact.** No production code reads or writes them:

| Model | Note |
|---|---|
| `Subtask` | Task decomposition — modelled, unused |
| `Attachment` | Files against a record — no storage strategy implemented |
| `BlockerReasonDefinition` | The workshop's own blocker vocabulary; blockers use the enum instead |
| `InventoryTransfer` | See G-INV-06 |
| `SupplierOrder` | See G-INV-07 |
| `Quotation`, `QuotationItem` | A priced proposal — no surface |
| `PlatformLiveViewSession` | Live View reads `OperationEvent`, not this table |

**Not orphaned, despite appearances:** `InvoiceSequence` and `CreditNoteSequence` are accessed through **raw SQL** (`INSERT … ON CONFLICT DO UPDATE`) rather than the Prisma accessor, which is deliberate — it is what makes numbering gap-free under concurrency.
**Resolution.** For each: build the surface, or remove the model in a migration. **A model nobody reads is a claim the schema makes and the product does not keep.**
**Status.** 🔴 Open.

---

## S3 — Named pieces of the spec

| Id | Gap | Detail |
|---|---|---|
| **G-PLAT-01** | Builder Control's broader scope | Theme, page layouts, role experience, workflow-policy editing, permission matrix, config-version rollback. Only capability shaping exists |
| **G-PLAT-02** | Platform Reports' 5 sections | Feature Usage · Builder Adoption · Operational Activity · Commercial Snapshot · Health & Risk. **Named as owed, not shipped as empty tabs** |
| **G-OWN-01** | *Who Can Handle Money* | Blocked on the platform-lock mechanism |
| **G-OWN-02** | Per-role report visibility | Same blocker |
| **G-OWN-03** | Audit rollback | Deep-links to pages that do not exist. `TenantConfigurationVersion` snapshots exist and nothing reads them |
| **G-OWN-04** | Workshop-timezone timestamps | The session does not carry the timezone; audit uses the reader's locale |
| **G-CUST-01** | Current Service lifecycle strip | One plain-language phrase today; the API exposes status only |
| **G-CUST-02** | Customer-initiated payment | The portal shows the balance; paying happens at the counter |
| **G-INS-01** | Date-range filter UI | No analytical page has one, so exports reflect the server default range |
| **G-INS-02** | 6th Workflow Health check | **Declared not computable**, not faked — needs `TenantConfiguration.workflowPolicy` |
| **G-I18N-01** | The translation pass | Logical CSS, `dir` and bidi isolation are real; **strings are not translated** |
| **G-INV-06** | Inter-warehouse transfers | Model, enum, permission; no graph states, no endpoint, no page |
| **G-INV-07** | Supplier orders | Model, enum, permission; nothing closes the loop to `SUPPLIER_RECEIPT` |
| **G-INV-08** | Stock reconciliation page | `inventory.stock.adjust` + `ADJUSTMENT` exist; doc 09 §1 argues this must become first-class |
| **G-OPS-04** | Asset ownership transfer | Model and privacy rule real; no page performs one |
| **G-OPS-05** | Real per-state entry timestamps | SLA over-run uses `updatedAt` as a **named** proxy |
| **G-FIN-01** | Stable `serviceId` on invoice lines | *Top services* is grouped by line text, and says so |
| **G-PEOPLE-01** | Exit reason / rehire eligibility | Named in Phase 10, pushed to Phase 19 |
| **G-POL-01** | Owner-facing policy editing | `GOVERNED` semantics exist; no editing surface |
| **G-POL-02** | Scope-delta derivation | `APPROVAL_REQUIRED_SCOPE` routes correctly; staff still choose which items are decision-worthy |
| **G-POL-03** | Override actions | `REQUIRES_OVERRIDE` and `BLOCK_WITH_OVERRIDE` both block; the audited release is Governance Controls' work |

---

## S4 — Debt

| Id | Debt | Detail |
|---|---|---|
| **G-DEBT-01** | No end-to-end browser tests | Nothing catches *"the page does not call the endpoint"* — the gap through which every S2 above arrived |
| **G-DEBT-02** | No CI scan for door-less commands | Would have caught all six in one run |
| **G-DEBT-03** | No lint rule for the single-status-writer invariant | W-1 is convention + review, unlike the audit boundary it resembles |
| **G-DEBT-04** | No retention for `AuditLog` / `OperationEvent` | Both grow without bound |
| **G-DEBT-05** | E13 — capability rollback vs. an in-flight transition | The one open race. Design spike owed |
| **G-DEBT-06** | E15 — halfway rounding has no named rule | Verified correct once; *specified* is different from *correct today* |
| **G-DEBT-07** | No optimistic concurrency on `WorkOrder` | Two managers editing one job are last-write-wins |
| **G-DEBT-08** | Idempotency keys only on payments | Part issue, capability apply and staff invite could double-submit |
| **G-DEBT-09** | `experiences/platform/add-workshop/` is orphaned | Routes use `onboarding/`; dead directory |
| **G-DEBT-10** | `TenantConfiguration.workflowPolicy` empty and unread | Blocks G-INS-02 |
| **G-DEBT-11** | `TENANT_ADMIN` page set mirrors Owner | The specs do not distinguish them; recorded honestly rather than guessed |
| **G-DEBT-12** | No contract tests between web and API | |
| **G-DEBT-13** | No performance or load testing | Scale claims are design claims |
| **G-DEBT-14** | No pen test, MFA, device binding, or security-event log | |
| **G-DEBT-15** | Motion spec thinner than colour and radius | Values exist; reasoning does not |

---

## 💤 Deliberate deferrals — not debt

| Decision | Reasoning |
|---|---|
| **Polling, not push** | No WS/SSE dependency for a screen whose truth changes on a human timescale. One place changes if push arrives |
| **Advisory lock, not a worker process** | Phase 13 narrowed deliberately and recorded it |
| **`PlatformGuard` outside the resolver** | Every layer defers with no `tenantId`; Super Admin has unconditional control by spec |
| **No row-level security** | Isolation is a service-layer property asserted by tests |
| **Per-workshop ceiling overrides** | A plan swap already expresses it end to end; no product surface asks for *"same plan, one exception"* |
| **`PER_ITEM_CHOICE` on `APPROVAL_WEIGHT`** | Dropped rather than faked — nothing exists for a per-item tier to attach to |
| **Service/Staff as separate report tabs** | Folded in; a second axis was not justified by data depth |
| **Optional per-job review under `DIRECT`** | Would need its own intent; recorded rather than faked |
| **The remaining ~54 policy decisions** | Phase 21 was an architectural resolution pass — documented with a verdict each, no implementation by design |

---

## Priority

**Close first — cheapest work with the largest effect.** G-OPS-01, G-OPS-03, G-INV-02..05. Six endpoints and their controls. Unblocks two golden journeys, closes one partial, and retires four orphaned permissions.

**Then G-EVT-01** — a one-line type change that converts a decorative abstraction into an enforced one, and surfaces whatever else is emitting undeclared keys.

**Then, in order:** G-INV-01 (decide the four statuses' fate) · G-EVT-02 (emit from the built-but-silent flows) · G-BILL-01 (the only trading blocker) · G-DEBT-02 (a scan so the no-door class never accumulates again) · G-MODEL-01 · G-SEC-02 · G-MSG-01 · G-FORM-01 · the platform-lock mechanism, which alone unblocks G-OWN-01, G-OWN-02 and part of G-PLAT-01.

---

## Recording a new gap

1. **Give it an id** — `G-<AREA>-<n>`.
2. **State the impact on a user**, not on the code.
3. **Name the root cause**, not the symptom.
4. **Cite evidence** — a file, a line, a query you ran.
5. **Say whether it is a gap or a deferral.** A deferral needs its reasoning; a gap needs its resolution.
6. **Never close one by changing the product to make a document look complete.**

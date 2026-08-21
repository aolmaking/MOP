# Policy Coverage Matrix

> Generated against `packages/shared/src/policies/registry.ts` at the commit that added it.
> Regenerate by hand when the registry changes — there is no build step that keeps this file honest, so treat a stale entry here as a bug the next audit should catch.

This is the answer to one question, asked policy by policy: **if a workshop
answers this differently, does anything actually happen?** `docs/POLICY_DECISION_INVENTORY.md`
is where a policy is decided; this is where it is checked against running code.

The distinction that matters, per this registry's own header comment:

> **ENFORCED** means a named service reads the value today. **RECORDED** means the row is written, audited and time-ranged, and the behaviour lands with the named work.

A `RECORDED` row is not a defect — it is an honest statement that the onboarding
question exists, the answer is stored and auditable, and nothing downstream
reads it yet. The defect this file exists to catch is the other direction: a
policy claiming `ENFORCED` with no real consumer, or a consumer that quietly
stopped existing. Both are covered below and both are covered by code, not
just this document — `apps/api/src/policies/dead-consumers.spec.ts` fails the
build the moment an `ENFORCED` policy's declared consumer disappears from the
source tree.

## Summary

| | Count |
|---|---|
| Total registered policies | 16 |
| `ENFORCED` (real runtime consumer today) | 8 |
| `RECORDED` (stored, audited, not yet read) | 8 |
| Narrow the workflow graph (`WORK_ORDER_GRAPH`) | 3 |
| `CORE` build posture (every workshop answers, whether or not asked) | 1 |
| `POLICY_CONTROLLED` build posture | 15 |
| `GOVERNED` mutability (changing later runs the impact-preview pipeline) | 14 |
| `FREELY` mutability | 2 |

## ENFORCED — a real service reads this today

| Policy | Question | Consumers | Graph edge | Changes |
|---|---|---|---|---|
| `DELIVERY_BLOCKED_UNTIL_PAID` | Is delivery blocked until the invoice is paid? | `GateEvaluatorService.check` (`payment.settled_or_policy_allows`), `PlatformService.writeFinanceConfiguration` | — | Billing |
| `APPROVAL_REQUIRED_SCOPE` | Which work needs the customer's approval before it proceeds? | `WorkOrderLifecycleService.routingContext` | `UNDER_INSPECTION → APPROVED_FOR_WORK` | Billing |
| `PARTIAL_PAYMENT` | May a customer pay part of the balance? | `FinanceService.recordPayment` | — | Billing |
| `PARTS_SEPARATION_OF_DUTIES` | Must a part request be approved by someone other than the person who raised it? | `PartRequestService.approve` | — | — |
| `RETURN_UNUSED_BEFORE_FINISH` | Must every issued part be accounted for before a job can be finished? | `GateEvaluatorService.suppressedByPolicy` | — | — |
| `TECHNICIAN_DIRECT_SEND` | May a technician send finished work onward directly, or must it pass review? | `WorkOrderLifecycleService.routingContext` | `IN_PROGRESS → READY_FOR_TEAM_REVIEW` | — |
| `PORTAL_COUNTER_APPROVAL` | May staff record a customer decision the customer gave verbally? | `CustomerDecisionService.recordOnBehalf` | — | — |
| `INSPECTION_REQUIRED` | May a customer decline inspection and request one named service directly? | `WorkOrderLifecycleService.routingContext` | `REGISTERED → AWAITING_CUSTOMER_APPROVAL` | — |
| `CUSTOMER_INVOICE_VISIBILITY` | Are prices shown to the customer before they approve a repair? | `CustomerDecisionService.pricingVisible`, `PlatformService.writeFinanceConfiguration` | — | **Visibility** |

Every `WORK_ORDER_GRAPH`-narrowing entry above is additionally proven, not
just declared: `packages/shared/src/policies/graph-safety.spec.ts` walks
every shipped capability profile against every combination of the policy
options that appear on an edge, and asserts no combination strands a
work order short of a terminal state (`CLOSED`/`CANCELLED`) — the mechanical
test `PHASE_21.md` §3.1 requires of anything with the power to change routing.
`APPROVAL_REQUIRED_SCOPE` and `INSPECTION_REQUIRED` additionally have a
Postgres-backed integration test that writes the real `WorkshopPolicy` row
through `PolicyResolutionService.set` and drives the real lifecycle service
through both routes (`apps/api/src/operations/work-order-lifecycle.integration.spec.ts`).

## RECORDED — stored and auditable, no consumer yet

| Policy | Question | What is missing |
|---|---|---|
| `APPROVAL_WEIGHT` | Does every customer decision carry the same weight? | `CustomerDecisionItem` needs a weight/tier field and the decision page needs a second, lighter form |
| `DISCOUNT_AUTHORITY` | Who may approve a discount, and above what value? | `FinanceConfiguration` already carries the threshold fields; the approval step (a `DiscountRequest` above threshold) is unbuilt |
| `TIME_TRACKING` | Is time tracking off, optional, or required? | No enforcement point exists on task completion yet |
| `UNCOVERED_COUNTRY_BILLING` | What happens when this country has no billing adapter yet? | The billing-adapter registry itself is future work; nothing to gate |
| `WORKING_WEEK` | Which days are this workshop's working week? | No SLA/ageing calculation reads a working-week calendar yet |
| `POST_CLOSE_ADDENDA` | May anything be added to a work order after it closes? | No append-after-close code path exists to gate |
| `QC_MANDATORY` | Is QC required for every finished job, or only above a threshold? | `MANDATORY_ALWAYS` is the graph's only behaviour; the other two options need a conditional QC route the graph does not have |

None of these are silently claimed otherwise anywhere in the product: the
onboarding Policies stage shows `enforcement.status` verbatim next to every
question (a "Recorded, not yet read" badge, not a "Live today" one), and
`packages/shared/src/policies/validator.spec.ts`'s
`"exactly the policies with a wired consumer are marked ENFORCED"` test
fails the build the moment a `RECORDED` entry gains real consumers without
its status being promoted, or an `ENFORCED` entry's consumers are removed
without its status being demoted.

## Cross-cutting — grouped by behavioural consequence, not by page

A single policy answer routinely moves more than one system at once. Grouped
here the way `docs/POLICY_DECISION_INVENTORY.md` groups by domain would not:

**Changes billing** (`impact.changesBilling`): `DELIVERY_BLOCKED_UNTIL_PAID`,
`APPROVAL_REQUIRED_SCOPE`, `PARTIAL_PAYMENT`, `DISCOUNT_AUTHORITY`,
`UNCOVERED_COUNTRY_BILLING`.

**Changes what someone can see** (`impact.changesVisibility`):
`CUSTOMER_INVOICE_VISIBILITY` — the only entry so far. Deliberately rare: a
policy that hides data must never be the only thing standing between a role
and something restricted (restricted data is absent from the response, never
hidden client-side, per this repo's own standing rule), so this flag marks a
policy controlling a genuine, structural omission (`FinanceConfiguration.customerInvoiceVisible`
gating what `CustomerDecisionService` even selects), not a UI toggle.

**Changes the workflow graph** (`WorkflowTransition.requiresPolicy`):
`APPROVAL_REQUIRED_SCOPE`, `TECHNICIAN_DIRECT_SEND`, `INSPECTION_REQUIRED`.
Every one of the three is additionally checked by
`policiesOnEdgesDeclareTheirCapability()` — a policy narrowing an edge that
itself requires a capability must depend on that same capability, so the
condition cannot outlive the capability that owns the states it narrows.

**Cross-capability** (`impact.capabilities.length > 1`): `DELIVERY_BLOCKED_UNTIL_PAID`
(`FINANCE_CORE` + `BILLING`), `APPROVAL_REQUIRED_SCOPE` (`CUSTOMER_PORTAL` + `FINANCE_CORE`),
`RETURN_UNUSED_BEFORE_FINISH` (`INVENTORY` + `PART_RETURNS`), `TECHNICIAN_DIRECT_SEND`
(`TEAMS` + `TEAM_REVIEW` + `QC` + `FINANCE_CORE`), `CUSTOMER_INVOICE_VISIBILITY`
(`FINANCE_CORE` + `CUSTOMER_PORTAL`).

**Multi-role** (`impact.roles.length > 1`, i.e. answering this changes what
more than one job title experiences): every `ENFORCED` policy except
`PARTS_SEPARATION_OF_DUTIES`, `RETURN_UNUSED_BEFORE_FINISH` and
`PORTAL_COUNTER_APPROVAL`, plus the `RECORDED` `DISCOUNT_AUTHORITY` and
`WORKING_WEEK`.

## Build posture and mutability

| Build posture | Policies | Meaning |
|---|---|---|
| `CORE` | `PORTAL_COUNTER_APPROVAL` | Every workshop has an answer, whether or not the onboarding flow asks — `CAPABILITY_MODEL.md` Rule 3's own worked example requires one to exist |
| `POLICY_CONTROLLED` | The other 15 | Genuinely per-workshop; asked when relevant, defaulted when not |

| Mutability | Policies |
|---|---|
| `GOVERNED` (impact-preview pipeline on change) | All but `TIME_TRACKING` and `WORKING_WEEK` |
| `FREELY` (no pipeline; nothing in flight depends on the old answer) | `TIME_TRACKING`, `WORKING_WEEK` |

No policy in this registry is `IMMUTABLE_AFTER_FIRST_USE` — the type exists
(`packages/shared/src/policies/types.ts`) for a future entry like a warranty
basis, not because it went unused by accident.

## What is deliberately not here

`docs/POLICY_DECISION_INVENTORY.md` catalogues roughly 70 candidate
decisions; 16 are registered. The gap is not oversight — every omission has
a reason on the inventory's own entry (an option needing data the schema
does not have, a dependency on an entity that does not exist yet, or a
status still `OPEN` pending a product call per that document's own §0). Two
entries this session's audit specifically checked and left out, with the
reason recorded on the entry that would have been affected:

- **`TAX_INCLUSIVE`** (P-22-adjacent, `FinanceConfiguration.taxInclusive`/`taxRatePercent`) —
  the arithmetic exists and is tested (`lineTotal()`'s `taxPercent` branch,
  `money.spec.ts`), but computes only the tax-exclusive case (added on top of
  a net price); nothing computes the inclusive case (backing tax out of a
  price that already contains it), and no call site in `finance.service.ts`
  passes `FinanceConfiguration.taxRatePercent` through at all — every real
  invoice's `tax` is `ZERO` today regardless of what the column holds.
  Registering the policy ahead of both pieces of real work would be exactly
  the "screen implying a stored string is live when nothing reads it" defect
  this whole registry is built to prevent.
- **`TECHNICIAN_PRICE_VISIBILITY`** (`FinanceConfiguration.technicianPriceVisible`) —
  the column exists with zero reads anywhere in `apps/api/src`; technician-facing
  views carry no price data at all today, so there is nothing for the policy
  to gate yet.
- **`DEPOSIT_REQUIRED`** — no deposit concept exists in the schema or any
  service (`Payment` has no deposit marker). Registering the question ahead
  of the data model would be an option nobody could honour.

## Verified end to end

- `packages/shared/src/policies/validator.spec.ts` — registry structural
  integrity, relevance-cycle detection, and the exact `ENFORCED` set.
- `packages/shared/src/policies/graph-safety.spec.ts` — exhaustive
  reachability proof for every graph-touching policy, across every shipped
  capability profile.
- `apps/api/src/policies/dead-consumers.spec.ts` — every `ENFORCED`
  consumer named in the registry still exists in the source tree.
- `apps/api/src/operations/work-order-lifecycle.integration.spec.ts` —
  a real `WorkshopPolicy` row, written through the real service, against
  real Postgres, changing what the real router allows.
- `apps/api/src/platform/onboarding/onboarding.integration.spec.ts` —
  a policy answer submitted at workshop creation reaching the
  `FinanceConfiguration` row a runtime consumer actually reads.
- `apps/api/src/customer/decision.integration.spec.ts` — the
  `CUSTOMER_INVOICE_VISIBILITY` consumer itself, withholding a price from
  the public decision projection.

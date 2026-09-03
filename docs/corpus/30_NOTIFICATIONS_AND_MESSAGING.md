# MOP — Notifications and Messaging

> **Document ID:** DOC-30
> **Purpose:** the message templates that exist, what would trigger each, and the honest statement of what is missing.
> **Authority:** DESCRIPTIVE.
> **Scope:** `apps/api/src/systems/customer/messages/`, `MessageTemplate`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 11 (customer experience), 21 (audit), 29 §8 (external integrations).

---

## 1. The state of this subsystem, stated first

> **The templates are complete and real. No message-sending code exists anywhere in the product.**

No WhatsApp, no SMS, no email, no push, no in-app notification centre. Not a stub, not a mock, not a disabled toggle — **absent**.

That is deliberate and it is recorded rather than disguised. The alternative — a hardcoded message body inside whatever service happened to need one — is exactly the *write-only configuration* failure the rebuild exists to escape. What ships is **the complete, real source of truth ready for that code to read from.**

The visible consequence: Feature Adoption Analytics reports Message Templates as **not trackable yet**, rather than showing a fabricated count.

## 2. The eight templates

`MESSAGE_TEMPLATE_KEYS`, `apps/api/src/systems/customer/messages/message-template-registry.ts`.

| Key | Would be sent when | Lifecycle anchor |
|---|---|---|
| `WHATSAPP_DECISION` | A decision link goes to the customer | `CustomerDecisionRequest` `PENDING → SENT` |
| `APPROVAL_REQUEST` | The workshop needs an answer before proceeding | `AWAITING_CUSTOMER_APPROVAL` |
| `WAITING_PARTS` | A job pauses for a part | `WAITING_PARTS` |
| `READY_FOR_DELIVERY` | The vehicle is ready to collect | `READY_FOR_DELIVERY` |
| `PAYMENT_PENDING` | A balance is outstanding | `PAYMENT_PENDING` |
| `CRITICAL_WARNING` | A safety-critical item was rejected | Critical `Fault` + rejection |
| `INVOICE_MESSAGE` | An invoice is issued | `invoice.issued` |
| `REMINDER` | A pending decision has gone unanswered | Decision ageing |

`MessageTemplateKey` is a closed union derived from the array, so a typo is a compile error and *which messages exist* has one answer.

## 3. What is real today

### Versioning
`MessageTemplate` rows are **immutable per version**, mirroring `WorkshopPolicy`'s time-ranged discipline. Publishing writes a new row at `version + 1`; it never rewrites the previous body. A message sent last month can therefore still be shown as it was sent — which is the whole reason for the discipline.

### Platform defaults
`PLATFORM_DEFAULT_BODY` is an exhaustive `Record<MessageTemplateKey, string>`, so **`currentBody()` never returns empty** — a workshop that has published nothing still has a real body for every template, and a new key without a default fails the build.

`currentBody()` returns `version: 0` for a platform default, which distinguishes *the platform's wording* from *this workshop's version 1* without a second flag.

### Required-variable enforcement
`firstMissingRequiredVariable(key, body)` blocks Publish and **names the exact missing `{{variable}}`**. A template that would render `Your vehicle {{plate}} is ready` with no `plate` in the body cannot be published — a message with a hole in it is worse than the default.

### Authoring surface
`/owner/messages`, permission `organization.messages.manage`:
`GET /organization/messages` · `POST /organization/messages/preview` · `POST /organization/messages`

Variable-insertion toolbar, live preview against sample values, Publish gated on the check above. Publishing writes an audit row: `message_template.published`, target `KEY:vN`, with the new body in `after`.

## 4. What a transport would need

Written down now so the eventual implementation is a known shape rather than an improvisation.

| Concern | Requirement |
|---|---|
| **Trigger** | A subscription to `OperationEvent` keys, not a call inside a service. Fan-out already has exactly one home |
| **Recipient** | `Customer` — with an explicit consent and contactability check |
| **Channel** | An adapter behind a stable interface, exactly like `GenericBillingAdapter` |
| **Rendering** | `MessageTemplateService.currentBody()` **at send time**, pinning the version actually used |
| **Delivery state** | Queued · sent · delivered · read · failed — a real record, not a fire-and-forget |
| **Retry** | Idempotency-keyed, so a retry cannot double-send |
| **Audit** | A `message.sent` event and an audit row naming the template version used |
| **Tenant isolation** | A recipient must be resolvable to exactly one tenant before anything is dispatched |
| **Customer-safe wording** | Only the sanitised vocabulary of doc 11 §2 — a message is the one place internal wording could escape by accident |
| **Quiet hours / working week** | `WORKING_WEEK` already exists and should govern it |

The `MessageTemplateService.currentBody()` method exists today with **no production caller** — it is the seam waiting for this work, not dead code.

## 5. Staff notifications

There is no staff notification system either, and that is a smaller gap than it looks.

MOP's design answer to *"how does a manager know?"* is **the Attention Center**, not a notification: every role's landing page answers *what needs me?* with no click, and the ranking already reads working-week-aware ageing. A notification stream would be a second, competing answer to the same question.

What is genuinely missing is **anything that reaches a person who is not looking at the screen** — a manager off-shift, a technician on another floor. That is the case a transport would eventually serve for staff as well as customers.

## 6. Implementation status

| Element | Status |
|---|---|
| 8 templates as a closed union | ✅ `[IMPLEMENTED]` |
| Immutable per-version rows | ✅ `[IMPLEMENTED]` |
| Exhaustive platform defaults | ✅ `[IMPLEMENTED]` |
| Required-variable enforcement, naming the missing variable | ✅ `[VERIFIED]` |
| Owner authoring page with toolbar and live preview | ✅ `[INTEGRATED]` |
| Publish audited with the version in `after` | ✅ `[IMPLEMENTED]` |
| `currentBody()` | 🧪 — real, tested, **no production caller** |
| **Any send transport** | 🔴 `[INTENDED]` — G-MSG-01 |
| **Delivery state tracking** | 🔴 `[INTENDED]` |
| **Customer consent / contactability model** | 🔴 `[INTENDED]` |
| **Staff notifications** | 💤 — the Attention Center is the design answer for on-screen staff; off-shift reach is unaddressed |
| **Quiet hours** | 🔴 `[INTENDED]` — `WORKING_WEEK` exists and should govern it |

**When the transport lands**, the honest completion test is not "a message was sent". It is: the template version used is recorded, a retry does not double-send, a customer in Workshop A can never receive Workshop B's message, and Feature Adoption Analytics can stop saying *not trackable yet*.

# CONTRACTS v0 — A3 ⇄ A2 API/UI contracts (FROZEN for Wave 1–2)

Amendments require a `decisions.md` entry + version bump. Both sides implement exactly this.

**Conventions (apply to all):** base `/api/v1` · cookie auth (`mop_access`) · success 200/201 JSON · error envelope `{ "code": string, "message": string, "details"?: unknown }` with HTTP 400/403/404/409 · money fields are strings `"12.00"` · all new routes sit beside existing siblings and inherit SessionGuard semantics.

Common error codes reused: `transition_not_allowed` (409, wrong workflow state), `gate_blocked` (409, finish/delivery gates), `forbidden` (403), `not_your_technician` (403), `not_found` (404, incl. out-of-scope), `service_not_in_catalog` (400).

---

### C1 — Start inspection
`POST /technician/work-orders/:id/start-inspection` — body: none
200 → `{ "workOrderId": string, "status": "UNDER_INSPECTION" }`
409 `transition_not_allowed` unless current status = REGISTERED.
Auth: assigned technician only (existing work-card ownership check). Side effect: `work_order.status_changed` event; journey advances for all audiences.

### C2 — Start work
`POST /technician/work-orders/:id/start-work` — body: none
200 → `{ "workOrderId": string, "status": "IN_PROGRESS" }`
409 unless current status = APPROVED_FOR_WORK.
Auth/side effects as C1.

### C3 — Create task
`POST /branch-manager/work-orders/:id/tasks`
Body: `{ "title": string(1..200), "serviceKey"?: string, "assignToStaffUserId"?: string }`
201 → created task object: `{ "id", "workOrderId", "title", "serviceKey": string|null, "assigneeStaffUserId": string|null, "status": <initial TaskStatus> }`
400 `service_not_in_catalog` when serviceKey not a live catalog entry · 403 on BM permission failure · 404 out-of-scope job.
UI: workspace "Add task" modal posts here; card list refreshes from existing work-card payload.

### C4 — Request approval (staff-initiated)
`POST /branch-manager/work-orders/:id/request-approval` — body: none
200 → `{ "workOrderId", "status": "AWAITING_CUSTOMER_APPROVAL" }`
409 `transition_not_allowed` when the live graph has no REQUEST_APPROVAL edge from the current state (e.g., ALWAYS_INSPECT policy with no inspection yet) — UI shows the refusal message verbatim.
Note: technicians trigger the same transition implicitly via decision raise (C5 side effect); this endpoint is the manager's explicit door.

### C5 — Decision response (EXISTING endpoints — additive behavior only)
Unchanged: `POST /public/decisions/:token/respond`, `POST /customer-portal/decisions/:requestId/respond`, `POST /branch-manager/approvals/:requestId/record`.
New server-side side effect after successful answer resolution: best-effort lifecycle moves — `APPROVE` when all items approved (→ APPROVED_FOR_WORK), then `CUSTOMER_RESPONDED` if job was WAITING_CUSTOMER (→ IN_PROGRESS). Moves are outside the answer transaction; refusals are swallowed+logged and NEVER alter the response shape or status code of the decision call.
UI contract: after any successful respond, clients MUST re-fetch journey/card — do not compute stage locally.

### C6 — Part return (technician)
`POST /technician/parts/:id/return`
Body: `{ "qty": number(≥1), "reason": string(3..500) }`
200 → `{ "partRequestId", "status": "RETURN_REQUESTED", "returnId": string }`
409 `invalid_state` when part not in a returnable state (USED / RECEIVED_BY_TECHNICIAN per service rules) · 400 validation errors otherwise standard.
Effect: PartReturnRequest created; RETURN_PENDING movement at recorded warehouse; `parts.no_pending_return` gate now blocks FINISH until adjudicated.

### C7 — Clarification answer (technician)
`POST /technician/parts/:id/clarification`
Body: `{ "answer": string(3..1000) }`
200 → `{ "partRequestId", "status": "RETURN_REQUESTED" }`
409 `invalid_state` unless status = RETURN_CLARIFICATION_REQUESTED.
Effect: loop returns to RETURN_REQUESTED; IM queue shows it again. Work-card prompt ("the store asked you a question") gains its action button from this contract.

### C8 — External / customer-supplied part entry **(conditional — lands only if Day-1 verification W1-A3-006 finds no existing write path)**
`POST /technician/work-orders/:id/external-parts`
Body: `{ "name": string(1..200), "provenance": "CUSTOMER_SUPPLIED" | "EXTERNAL_PURCHASE", "quantity": number(≥1, default 1) }`
201 → `{ "lineId", "name", "provenance", "quantity" }`
Effect: WorkOrderPartLine recorded with provenance; satisfies gate `parts.external_resolved` once name non-empty; NO stock movement, NO request row (by definition external).
UI: offered on the parts panel only when a part request was rejected/marked unavailable (R3 rule) or customer brings their own part.

---

### Work-card payload addendum (non-breaking)
Existing `GET /technician/work-orders/:id` payload is unchanged except each `parts[]` item may now be accompanied by the action affordances implied by its state:
`returnable: boolean` (state ∈ USED|RECEIVED_BY_TECHNICIAN) · `clarificationPending: boolean` (+ question text when present).
A2 renders buttons strictly from these flags + status — never invents client-side availability.

### Journey refresh rule (both sides)
After ANY of C1–C8 succeeds, clients refetch journey (existing poller covers it within ≤20s; explicit immediate refetch recommended post-action).

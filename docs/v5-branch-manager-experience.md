# V5 Branch Manager Experience

Version 5 adds the Branch Manager as the daily operations owner for one or more branches.

The Branch Manager is not a technician, inventory manager, tenant admin, or accountant. This role connects the outputs from customer decisions, technician execution, inventory lifecycle, and delivery/payment readiness into one operational control layer.

## Main Pages

Branch Manager has exactly six main pages:

1. Branch Home / Attention Center
2. Customer Intake
3. Work Orders
4. Work Order Workspace
5. Approvals & Customer Decisions
6. Delivery & Payments Status

## Role Boundaries

Branch Manager can:

- Create customer intake and work orders.
- Register or link assets with ownership transfer confirmation.
- Assign or reassign technicians.
- Change work order priority.
- Send customer decision reminders.
- Escalate blockers.
- Record branch follow-up notes.
- Monitor parts, customer decisions, QC/rework, payment, and delivery status.
- Mark delivery ready only when readiness checks pass.

Branch Manager cannot:

- Complete technician tasks directly.
- Issue stock or adjust inventory quantities.
- Edit inventory catalog items.
- Run supplier orders.
- Perform full finance, tax, refund, or final invoice generation.
- Change tenant-wide permissions or platform settings.

## Integration Points

- V2 Customer Decision Flow appears in the Decisions page and Workspace.
- V3 Technician Work Card outputs appear as technician activity, blockers, part requests, and finish/QC state.
- V4 Inventory Lifecycle appears as waiting parts, issued, arrived, used, return pending, returned, unavailable, waiting transfer, and waiting supplier signals.
- Delivery and payment are snapshots only in V5, with full finance deferred.

## Backend Surface

The API namespace is `/branch-manager`:

- `GET /home`
- `GET /intake-options`
- `POST /intake`
- `GET /work-orders`
- `GET /work-orders/:id`
- `POST /work-orders/:id/action`
- `GET /decisions`
- `POST /decisions/:id/action`
- `GET /delivery`
- `POST /delivery/:id/action`

Every action is scoped through branch permissions and records audit/timeline evidence where applicable.

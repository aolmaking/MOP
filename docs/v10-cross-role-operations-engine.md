# Version 10 - Cross-Role Operations Engine

## Implemented foundation

- Canonical operation event registry with backwards-compatible aliases.
- Cross-role action contracts for work orders, assignments, decisions, parts, blockers, finish, owner permissions, platform controls, and Builder publish.
- Central `WorkflowStatusResolverService`.
- Central `NotificationRoutingService`.
- Central `CustomerSafeProjectionService`.
- Permission metadata through `CrossRoleActionContractsService`.
- Audit-backed `OperationEventsService`.
- Owner/Tenant Admin `Workflow Health` API and Angular page.
- Regression fixtures for seven critical cross-role flows.

## Workflow Health checks

- Issued part not confirmed by technician.
- Customer decision responded while task remains waiting.
- Return request not reviewed.
- Work Order and task status conflict.
- Waiting Parts without an unresolved part request.
- Branch without an active warehouse link.
- Recent active workflow without an operation event.

## Integrated canonical events

- `work_order.created`
- `technician.assigned`
- `task.started`
- `inspection.saved`
- `diagnostic_code.added`
- `fault.created`
- `customer_decision.requested`
- `customer_decision.responded`
- `part.requested`
- `part.issued`
- `part.arrived_confirmed`
- `part.used`
- `part.return_requested`
- `part.return_accepted`
- `blocker.reported`
- `task.finish_blocked`
- `task.sent_to_team_review`
- `task.sent_to_qc`
- `owner.permission_changed`
- `builder.published`
- `platform_control.changed`
- `workshop.frozen`
- `workshop.reactivated`

## Validation result

- V10 structural and integration gate: PASS.
- Shared TypeScript package: PASS.
- Angular TypeScript application: PASS.
- V10 operation files in API typecheck: PASS.
- Full API typecheck still reports pre-existing enum-array and Prisma JSON typing errors outside the new operations files.
- Full Angular build was not available because the local workspace does not contain `@angular-devkit/build-angular`; `pnpm install` did not complete in the OneDrive workspace.

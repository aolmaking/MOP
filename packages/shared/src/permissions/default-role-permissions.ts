import type { StaffRole } from "../session/session-context";
import type { PermissionKey } from "./permission-manifest";

/**
 * The platform's baseline permission map, seeded as real RolePermission
 * rows for every new tenant (see Add Workshop Owner's spec: "seeded for
 * all 7 tenant-staff roles from the platform's default permission map").
 *
 * Deliberately not exhaustive over every PermissionKey, same as that
 * manifest itself: a key with no entry here simply gets no seeded row,
 * which is the correct, safe outcome (RolePermissionTemplateLayer defers,
 * the resolver's DEFAULT_DECISION denies) -- there is nothing unsafe about
 * an absent row, so only keys with a confidently-known default belong
 * here. Grows as Phase 3+ pages make more defaults concrete.
 *
 * A few keys are listed with an explicit `false` even though they "belong"
 * to a role, because the source spec says so directly -- e.g. Technician's
 * finance.running_invoice.add_line is "not automatically granted" per
 * tenant-owner.md's Pricing page ("Who Can Handle Money"); an owner must
 * delegate it. Omitting it entirely would already deny it, but writing it
 * explicitly documents that the denial is deliberate, not an oversight.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Partial<Record<StaffRole, Partial<Record<PermissionKey, boolean>>>>> = {
  TENANT_OWNER: {
    "dashboard.owner.view": true,
    "organization.access.manage": true,
    "organization.forms.manage": true,
    "organization.messages.manage": true,
    "organization.workflow_health.view": true,
    "finance.configuration.manage": true,
    "finance.invoice.view": true,
    "finance.invoice.issue": true,
    "finance.payment.record": true,
    "finance.refund.request": true,
    "finance.refund.decide": true,
    "reports.owner.view": true,
    "reports.company.view": true,
    "audit.own_tenant.view": true,
  },
  TENANT_ADMIN: {
    "dashboard.owner.view": true,
    "organization.access.manage": true,
    "organization.forms.manage": true,
    "organization.messages.manage": true,
    "organization.workflow_health.view": true,
    "finance.invoice.view": true,
    "reports.owner.view": true,
    "reports.company.view": true,
    "audit.own_tenant.view": true,
  },
  BRANCH_MANAGER: {
    "workorders.branch.view": true,
    "workorders.branch.reassign_technician": true,
    "workorders.branch.manage_blockers": true,
    "workorders.branch.release_delivery": true,
    "customer.intake.create": true,
    "decisions.branch.view": true,
    // P-18: the branch is where a customer answers verbally in person or
    // by phone when they have no portal, or simply prefer to.
    "customer_decision.record_on_behalf": true,
    "finance.invoice.view": true,
    // Issuing/recording money is Owner-only unless explicitly delegated --
    // see tenant-owner.md's Pricing page.
    "finance.invoice.issue": false,
    "finance.payment.record": false,
    // A branch manager can ask for money back on a job -- they see the
    // dispute -- but deciding it stays with the owner, the same
    // separation as issuing an invoice in the first place.
    "finance.refund.request": true,
    "finance.refund.decide": false,
    // True in the template, and still denied until the owner delegates.
    // The template says "this role would do this if allowed to"; the
    // delegation layer says whether anyone but the owner may at all.
    "team_setup.branch.manage": true,
  },
  TECHNICIAN: {
    "task.view_assigned": true,
    "task.finish_attempt": true,
    "task.complete": true,
    "inspection.quick.create": true,
    "inspection.full.create": true,
    "inspection.codes.view": true,
    "blocker.report": true,
    "notes.create": true,
    "customer_decision.create": true,
    "customer_decision.send": true,
    // Explicitly not automatic -- see technician.md's Services/POS tool.
    "finance.running_invoice.add_line": false,
  },
  INVENTORY_MANAGER: {
    "inventory.home.view": true,
    "inventory.requests.view": true,
    "inventory.request.approve": true,
    "inventory.request.issue": true,
    "inventory.request.reject": true,
    "inventory.request.mark_unavailable": true,
    "inventory.transfer.create": true,
    "inventory.supplier_order.create": true,
    "inventory.catalog.manage": true,
    // Explicitly false, not merely absent: managing the catalog does not
    // imply seeing margin. An owner grants this deliberately.
    "inventory.cost.view": false,
    "inventory.stock.view": true,
    "inventory.stock.adjust": true,
    "inventory.movements.view": true,
    "inventory.stock.return.accept": true,
    "inventory.stock.return.reject": true,
    "inventory.stock.return.clarify": true,
    "reports.inventory.view": true,
  },
  TEAM_LEADER: {
    "team.home.view": true,
    "team.technicians.view": true,
    "team.workorders.view": true,
    "team.supervision_note.create": true,
    "team.issue.flag_to_branch_manager": true,
    "reports.team.view": true,
  },
  DATA_ANALYST: {
    "reports.company.view": true,
  },
};

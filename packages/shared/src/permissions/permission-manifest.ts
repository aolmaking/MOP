/**
 * Canonical registry of valid permission keys. Grows as each later phase
 * adds real permission-gated actions -- deliberately not exhaustive yet,
 * since no feature pages exist until Phase 2+. Phase 11 adds a CI check
 * that every key here has a real assertion site in the codebase (the old
 * project's own risk list flagged an informal, ungenerated version of this
 * exact registry as a problem years before the gap analysis confirmed it
 * at scale -- see docs/ARCHITECTURE_RISK_LIST.md, no longer in this repo
 * but referenced in the rebuild plan).
 *
 * Each entry names the coarse, toggleable product MODULE it belongs to --
 * this is a deliberate, explicit mapping rather than derived from the key's
 * text, because "module" (a handful of Plan/TenantConfiguration-toggleable
 * product areas) and "resource" (a fine-grained page/action grouping, e.g.
 * task vs. inspection vs. blocker) are different granularities. Collapsing
 * them by splitting the key string was tried first and rejected: it would
 * have made e.g. "task.*" and "inspection.*" register as two independently
 * togglable modules when the spec toggles them together as one OPERATIONS
 * module.
 *
 * Convention for the key itself: `{resource}.{scope?}.{action}`, all
 * lowercase, dot-separated. The resource segment does not need to match
 * the module name.
 */

export const MODULE_KEYS = [
  "PLATFORM",
  "ORGANIZATION",
  "OPERATIONS",
  "FINANCE",
  "INVENTORY",
  "TEAM_MANAGEMENT",
  "REPORTS",
  "AUDIT",
  "CUSTOMER_PORTAL",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

interface PermissionDefinition {
  key: string;
  module: ModuleKey;
}

const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  // Platform
  { key: "platform.workshop.create", module: "PLATFORM" },
  { key: "platform.workshop.view", module: "PLATFORM" },
  { key: "platform.control_center.access", module: "PLATFORM" },
  { key: "platform.live_view.access", module: "PLATFORM" },
  { key: "platform.reports.view", module: "PLATFORM" },

  // Organization / identity (Owner's own pages)
  { key: "organization.access.manage", module: "ORGANIZATION" },
  { key: "organization.forms.manage", module: "ORGANIZATION" },
  { key: "organization.messages.manage", module: "ORGANIZATION" },
  { key: "organization.workflow_health.view", module: "ORGANIZATION" },

  // Work orders / shop floor
  { key: "workorders.branch.view", module: "OPERATIONS" },
  { key: "workorders.branch.reassign_technician", module: "OPERATIONS" },
  { key: "workorders.branch.manage_blockers", module: "OPERATIONS" },
  { key: "workorders.branch.release_delivery", module: "OPERATIONS" },
  // The operator's review of a submitted inspection: editing the quote the
  // customer will be shown, and dispatching the approved work to the floor.
  //
  // This existed only as a hardcoded role allow-list in OperatorController --
  // `new Set(["OPERATOR", "BRANCH_MANAGER", "TENANT_OWNER", "TENANT_ADMIN"])` --
  // which put it above the resolver's eleven layers instead of inside them. A
  // workshop could not delegate it to anyone else, could not revoke it from the
  // roles named, and the two owner roles held a write power that
  // default-role-permissions.ts explicitly withholds from them ("actually
  // working a Work Order is Branch Manager/Technician territory"). It also could
  // not be switched off with the OPERATIONS module, since a Set in a controller
  // knows nothing about capabilities.
  { key: "workorders.branch.dispatch_repair", module: "OPERATIONS" },
  // Advancing a finished job. Two separate keys because they are two
  // separate jobs: team review is a supervisor reading a technician's
  // work, QC is the workshop's own last look before a customer sees it.
  // A shop that runs both must be able to give them to different people.
  { key: "workorders.review.decide", module: "OPERATIONS" },
  { key: "workorders.qc.decide", module: "OPERATIONS" },

  // Customer intake / decisions (branch-facing, not the customer's own portal)
  { key: "customer.intake.create", module: "OPERATIONS" },
  { key: "decisions.branch.view", module: "OPERATIONS" },
  { key: "customer_decision.create", module: "OPERATIONS" },
  { key: "customer_decision.send", module: "OPERATIONS" },
  // P-18, docs/POLICY_DECISION_INVENTORY.md: recording a decision the
  // customer gave verbally, per PORTAL_COUNTER_APPROVAL. Deliberately a
  // separate key from .create/.send -- this is staff acting AS the
  // decision channel, not drafting or dispatching one.
  { key: "customer_decision.record_on_behalf", module: "OPERATIONS" },
  // M-3: withdrawing an ask nobody has answered yet -- a distinct act
  // from recording an answer on the customer's behalf.
  { key: "customer_decision.cancel", module: "OPERATIONS" },
  // BM parity with the technician's own "Add task" -- Branch Manager can
  // put a task on a job directly from the workspace, not only through a
  // technician's own card.
  { key: "task.branch.create", module: "OPERATIONS" },

  // Technician work card
  { key: "task.view_assigned", module: "OPERATIONS" },
  // The spine-ignition pair: a technician's own press of "Start
  // inspection" / "Start work". Existed as WORKFLOW_INTENTS with zero
  // production callers until now -- see WorkOrderLifecycleService.
  { key: "task.start_inspection", module: "OPERATIONS" },
  { key: "task.start_work", module: "OPERATIONS" },
  { key: "task.finish_attempt", module: "OPERATIONS" },
  { key: "task.complete", module: "OPERATIONS" },
  { key: "inspection.quick.create", module: "OPERATIONS" },
  { key: "inspection.full.create", module: "OPERATIONS" },
  { key: "inspection.codes.view", module: "OPERATIONS" },
  { key: "blocker.report", module: "OPERATIONS" },
  { key: "notes.create", module: "OPERATIONS" },

  // Operational history -- the workshop's memory of what happened to
  // every customer and vehicle. OPERATIONS rather than AUDIT on purpose:
  // AUDIT answers "who changed the system", this answers "what happened
  // to the car", and a workshop that switched one off expecting the
  // other would lose the wrong thing.
  { key: "history.workshop.view", module: "OPERATIONS" },

  // Finance
  { key: "finance.configuration.manage", module: "FINANCE" },
  { key: "finance.running_invoice.add_line", module: "FINANCE" },
  { key: "finance.invoice.view", module: "FINANCE" },
  { key: "finance.invoice.issue", module: "FINANCE" },
  // Selling parts over the counter, which is a different act from invoicing a
  // repair and so a different key.
  //
  // `finance.invoice.issue` guards the money on a job the workshop has worked
  // on -- tenant-owner.md's Pricing page keeps that with the owner unless it is
  // delegated, and the branch manager is denied it by default. A counter sale
  // is retail: the customer buys a part and pays, no vehicle work exists, and
  // reception doing it is the entire reason the OPERATOR role has a till. Both
  // used to be ungated, so nothing distinguished them; gating them on the same
  // key would have taken the till away from the role that mans it.
  { key: "finance.counter_sale.create", module: "FINANCE" },
  { key: "finance.payment.record", module: "FINANCE" },
  { key: "finance.refund.request", module: "FINANCE" },
  // Deliberately a separate key from .request -- requesting and deciding
  // a refund are different acts, and a role that can request should not
  // automatically be able to approve its own request. See Phase 19's
  // separation-of-duties work for where this gets enforced structurally;
  // for now the two permissions can simply be granted to different roles.
  { key: "finance.refund.decide", module: "FINANCE" },
  // Same separation, for the same reason, on the DISCOUNT_AUTHORITY path:
  // requesting a discount above the workshop's threshold and approving it
  // are different acts.
  { key: "finance.discount.request", module: "FINANCE" },
  { key: "finance.discount.decide", module: "FINANCE" },

  // Inventory
  { key: "inventory.home.view", module: "INVENTORY" },
  { key: "inventory.requests.view", module: "INVENTORY" },
  // Distinct from .approve/.issue/.reject: the technician who asks for a
  // part is never the one who decides whether the shelf gives it up.
  { key: "inventory.request.create", module: "INVENTORY" },
  { key: "inventory.request.approve", module: "INVENTORY" },
  { key: "inventory.request.issue", module: "INVENTORY" },
  { key: "inventory.request.reject", module: "INVENTORY" },
  { key: "inventory.request.mark_unavailable", module: "INVENTORY" },
  { key: "inventory.transfer.create", module: "INVENTORY" },
  { key: "inventory.supplier_order.create", module: "INVENTORY" },
  { key: "inventory.catalog.manage", module: "INVENTORY" },
  // H7, docs/POLICY_DECISION_INVENTORY.md (P-32): deactivating/reactivating
  // a warehouse -- distinct from catalog.manage, since this affects
  // whether a warehouse exists in the workshop's operating picture at
  // all, not what is priced or stocked within one.
  { key: "inventory.warehouse.manage", module: "INVENTORY" },
  // Cost is what the workshop PAID, which is margin. Hidden unless
  // explicitly granted -- the same discipline as the technician's price
  // gate, applied to the inventory side (inventory-manager.md, Catalog).
  { key: "inventory.cost.view", module: "INVENTORY" },
  { key: "inventory.stock.view", module: "INVENTORY" },
  { key: "inventory.stock.adjust", module: "INVENTORY" },
  { key: "inventory.movements.view", module: "INVENTORY" },
  { key: "inventory.stock.return.accept", module: "INVENTORY" },
  { key: "inventory.stock.return.reject", module: "INVENTORY" },
  { key: "inventory.stock.return.clarify", module: "INVENTORY" },

  // Team leader
  { key: "team.home.view", module: "TEAM_MANAGEMENT" },
  { key: "team.technicians.view", module: "TEAM_MANAGEMENT" },
  { key: "team.workorders.view", module: "TEAM_MANAGEMENT" },
  { key: "team.supervision_note.create", module: "TEAM_MANAGEMENT" },
  { key: "team.issue.flag_to_branch_manager", module: "TEAM_MANAGEMENT" },
  // Assignable only once the owner has delegated -- see
  // DELEGATED_PERMISSIONS. Granting it without delegation still denies.
  { key: "team_setup.branch.manage", module: "TEAM_MANAGEMENT" },

  // Owner dashboard
  { key: "dashboard.owner.view", module: "REPORTS" },

  // Reports
  { key: "reports.owner.view", module: "REPORTS" },
  { key: "reports.inventory.view", module: "REPORTS" },
  { key: "reports.team.view", module: "REPORTS" },
  { key: "reports.company.view", module: "REPORTS" },

  // Data Analyst
  { key: "analytics.home.view", module: "REPORTS" },
  { key: "analytics.operations.view", module: "REPORTS" },
  { key: "analytics.people.view", module: "REPORTS" },
  { key: "analytics.inventory.view", module: "REPORTS" },
  { key: "analytics.decisions.view", module: "REPORTS" },
  { key: "analytics.feature_adoption.view", module: "REPORTS" },
  { key: "analytics.saved_views.manage", module: "REPORTS" },
  { key: "analytics.export", module: "REPORTS" },

  // Audit
  { key: "audit.own_tenant.view", module: "AUDIT" },

  // Customer portal
  { key: "customer.portal.view", module: "CUSTOMER_PORTAL" },
  { key: "customer.asset.view_own", module: "CUSTOMER_PORTAL" },
  { key: "customer.service.view_own", module: "CUSTOMER_PORTAL" },
  { key: "customer.invoice.view_own", module: "CUSTOMER_PORTAL" },
  { key: "customer.history.view_safe", module: "CUSTOMER_PORTAL" },
] as const;

export const PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((d) => d.key) as unknown as readonly [
  (typeof PERMISSION_DEFINITIONS)[number]["key"],
  ...(typeof PERMISSION_DEFINITIONS)[number]["key"][],
];

export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]["key"];

const MODULE_BY_PERMISSION_KEY: ReadonlyMap<string, ModuleKey> = new Map(
  PERMISSION_DEFINITIONS.map((d) => [d.key, d.module]),
);

/**
 * Returns the module a permission key belongs to, or `null` if the key
 * isn't registered. Callers (PermissionResolverService layers) must treat
 * `null` as "unknown key" -- never fall back to guessing a module, since a
 * guess here is exactly the kind of silent-wrong-answer the module split
 * exists to prevent.
 */
export function moduleForPermissionKey(key: string): ModuleKey | null {
  return MODULE_BY_PERMISSION_KEY.get(key) ?? null;
}

/**
 * Permission keys gated by an individually-togglable feature flag, on top
 * of their module. Sparse and empty until a later phase adds a real
 * feature-gated page -- an empty table is the honest state right now, not
 * a stub; FeatureEnabledLayer correctly defers (returns null) for every
 * key until an entry exists here.
 */
export const FEATURE_GATED_PERMISSIONS: Readonly<Partial<Record<PermissionKey, string>>> = {};

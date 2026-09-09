-- Two new permission keys need rows in workshops that already exist.
--
-- `OperatorController` used to authorize all of its routes with a hardcoded
-- Set of role names, so reviewing a quote, dispatching a repair and ringing up
-- a counter sale were governed by nothing the workshop could see or change.
-- They are permissions now (workorders.branch.dispatch_repair and
-- finance.counter_sale.create), which the resolver denies by default when no
-- row exists -- correct for an unknown key, wrong for a workshop whose
-- operators were doing this yesterday. New tenants get these rows from
-- DEFAULT_ROLE_PERMISSIONS at creation; this backfills the ones already here.
--
-- Only the two roles that hold them by default, and only where the tenant has
-- no row already, so an owner who has since decided otherwise is not overruled.
INSERT INTO "role_permissions" ("id", "tenantId", "role", "permissionKey", "allowed", "source", "updatedAt")
SELECT
  'rp_' || md5(t."id" || r."role" || k."permissionKey"),
  t."id",
  r."role"::"StaffRole",
  k."permissionKey",
  true,
  'ROLE_DEFAULT',
  NOW()
FROM "tenants" t
CROSS JOIN (VALUES ('OPERATOR'), ('BRANCH_MANAGER')) AS r("role")
CROSS JOIN (VALUES ('workorders.branch.dispatch_repair'), ('finance.counter_sale.create')) AS k("permissionKey")
ON CONFLICT ("tenantId", "role", "permissionKey") DO NOTHING;

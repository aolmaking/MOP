ALTER TABLE "plans" ADD COLUMN "allowedExports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

INSERT INTO "role_permissions" ("id", "tenantId", "role", "permissionKey", "allowed", "source", "updatedAt")
SELECT
  'rp_' || t."id" || '_analytics_export',
  t."id",
  'DATA_ANALYST',
  'analytics.export',
  true,
  'ROLE_DEFAULT',
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1
  FROM "role_permissions" rp
  WHERE rp."tenantId" = t."id"
    AND rp."role" = 'DATA_ANALYST'
    AND rp."permissionKey" = 'analytics.export'
);

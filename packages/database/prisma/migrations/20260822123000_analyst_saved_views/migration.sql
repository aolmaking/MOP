CREATE TYPE "AnalystSavedViewSourcePage" AS ENUM ('OPERATIONS', 'PEOPLE', 'INVENTORY', 'DECISIONS', 'FEATURE_ADOPTION');

CREATE TABLE "analyst_saved_views" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourcePage" "AnalystSavedViewSourcePage" NOT NULL,
  "configuration" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "analyst_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analyst_saved_views_tenantId_accountId_createdAt_idx" ON "analyst_saved_views"("tenantId", "accountId", "createdAt");
CREATE INDEX "analyst_saved_views_tenantId_sourcePage_idx" ON "analyst_saved_views"("tenantId", "sourcePage");

ALTER TABLE "analyst_saved_views"
  ADD CONSTRAINT "analyst_saved_views_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analyst_saved_views"
  ADD CONSTRAINT "analyst_saved_views_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "role_permissions" ("id", "tenantId", "role", "permissionKey", "allowed", "source", "updatedAt")
SELECT
  'rp_' || t."id" || '_analytics_saved_views_manage',
  t."id",
  'DATA_ANALYST',
  'analytics.saved_views.manage',
  true,
  'ROLE_DEFAULT',
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1
  FROM "role_permissions" rp
  WHERE rp."tenantId" = t."id"
    AND rp."role" = 'DATA_ANALYST'
    AND rp."permissionKey" = 'analytics.saved_views.manage'
);

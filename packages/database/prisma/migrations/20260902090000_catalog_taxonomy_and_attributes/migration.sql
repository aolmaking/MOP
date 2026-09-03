-- Catalog configuration: one taxonomy, and a filter vocabulary the
-- inventory manager owns.
--
-- The free-text `category`/`subcategory` columns on inventory_items are
-- REPLACED rather than kept alongside the new tables. Two shapes of
-- "which kind of thing is this" is exactly the drift this feature exists
-- to remove: the manager typed one and the technician browsed the other,
-- with nothing keeping them in step. Every existing value is carried
-- across into a real category row first (steps 5-8 below), so no
-- workshop loses the taxonomy it had.

-- CreateTable
CREATE TABLE "catalog_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "technicianVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_attributes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "showOnCard" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_attribute_values" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_category_attributes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalog_category_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item_attribute_values" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "inventory_item_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_categories_tenantId_slug_key" ON "catalog_categories"("tenantId", "slug");
CREATE INDEX "catalog_categories_tenantId_isActive_idx" ON "catalog_categories"("tenantId", "isActive");
CREATE INDEX "catalog_categories_parentId_idx" ON "catalog_categories"("parentId");
CREATE UNIQUE INDEX "catalog_attributes_tenantId_key_key" ON "catalog_attributes"("tenantId", "key");
CREATE INDEX "catalog_attributes_tenantId_isActive_idx" ON "catalog_attributes"("tenantId", "isActive");
CREATE UNIQUE INDEX "catalog_attribute_values_attributeId_value_key" ON "catalog_attribute_values"("attributeId", "value");
CREATE INDEX "catalog_attribute_values_tenantId_idx" ON "catalog_attribute_values"("tenantId");
CREATE UNIQUE INDEX "catalog_category_attributes_categoryId_attributeId_key" ON "catalog_category_attributes"("categoryId", "attributeId");
CREATE INDEX "catalog_category_attributes_tenantId_idx" ON "catalog_category_attributes"("tenantId");
CREATE UNIQUE INDEX "inventory_item_attribute_values_inventoryItemId_valueId_key" ON "inventory_item_attribute_values"("inventoryItemId", "valueId");
CREATE INDEX "inventory_item_attribute_values_tenantId_attributeId_valueId_idx" ON "inventory_item_attribute_values"("tenantId", "attributeId", "valueId");
CREATE INDEX "inventory_item_attribute_values_valueId_idx" ON "inventory_item_attribute_values"("valueId");

-- AddForeignKey
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_attributes" ADD CONSTRAINT "catalog_attributes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_attribute_values" ADD CONSTRAINT "catalog_attribute_values_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "catalog_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_category_attributes" ADD CONSTRAINT "catalog_category_attributes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_category_attributes" ADD CONSTRAINT "catalog_category_attributes_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "catalog_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_item_attribute_values" ADD CONSTRAINT "inventory_item_attribute_values_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_item_attribute_values" ADD CONSTRAINT "inventory_item_attribute_values_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "catalog_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_item_attribute_values" ADD CONSTRAINT "inventory_item_attribute_values_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "catalog_attribute_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: catalog presentation and the structured category link.
ALTER TABLE "inventory_items" ADD COLUMN "catalogCategoryId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "summary" TEXT;

-- Backfill 1: every distinct free-text category becomes a root category.
-- `md5` gives a slug that is stable for the same name so re-running
-- against a partially migrated database cannot mint a duplicate.
INSERT INTO "catalog_categories" ("id", "tenantId", "name", "slug", "sortOrder", "createdAt", "updatedAt")
SELECT
    'cat_' || substr(md5(i."tenantId" || '|' || i."category"), 1, 20),
    i."tenantId",
    i."category",
    lower(regexp_replace(i."category", '[^a-zA-Z0-9]+', '-', 'g')),
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenantId", "category" FROM "inventory_items" WHERE "category" IS NOT NULL AND btrim("category") <> '') i
ON CONFLICT ("tenantId", "slug") DO NOTHING;

-- Backfill 2: every distinct subcategory becomes a child of its parent.
INSERT INTO "catalog_categories" ("id", "tenantId", "name", "slug", "parentId", "sortOrder", "createdAt", "updatedAt")
SELECT
    'cat_' || substr(md5(i."tenantId" || '|' || i."category" || '|' || i."subcategory"), 1, 20),
    i."tenantId",
    i."subcategory",
    lower(regexp_replace(i."category" || '-' || i."subcategory", '[^a-zA-Z0-9]+', '-', 'g')),
    'cat_' || substr(md5(i."tenantId" || '|' || i."category"), 1, 20),
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "tenantId", "category", "subcategory"
    FROM "inventory_items"
    WHERE "category" IS NOT NULL AND btrim("category") <> ''
      AND "subcategory" IS NOT NULL AND btrim("subcategory") <> ''
) i
ON CONFLICT ("tenantId", "slug") DO NOTHING;

-- Backfill 3: point each item at the deepest category it had.
UPDATE "inventory_items" i
SET "catalogCategoryId" = c."id"
FROM "catalog_categories" c
WHERE c."tenantId" = i."tenantId"
  AND i."category" IS NOT NULL AND btrim(i."category") <> ''
  AND c."slug" = lower(regexp_replace(
        CASE WHEN i."subcategory" IS NOT NULL AND btrim(i."subcategory") <> ''
             THEN i."category" || '-' || i."subcategory"
             ELSE i."category" END,
        '[^a-zA-Z0-9]+', '-', 'g'));

-- The strings are now unreachable: nothing may read them, or the drift
-- starts again.
ALTER TABLE "inventory_items" DROP COLUMN "category";
ALTER TABLE "inventory_items" DROP COLUMN "subcategory";

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_catalogCategoryId_idx" ON "inventory_items"("tenantId", "catalogCategoryId");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_catalogCategoryId_fkey" FOREIGN KEY ("catalogCategoryId") REFERENCES "catalog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The cart a request came out of, and the index that makes re-submitting
-- one idempotent rather than duplicating the store's work. NULLs are
-- distinct in Postgres, so every request raised outside a cart is
-- unaffected.
ALTER TABLE "part_requests" ADD COLUMN "cartKey" TEXT;
CREATE UNIQUE INDEX "part_requests_tenantId_cartKey_inventoryItemId_key" ON "part_requests"("tenantId", "cartKey", "inventoryItemId");

-- Which marques a part actually fits, recorded by the workshop itself.
--
-- No default and no NOT NULL, which is how Prisma models a scalar list: a
-- row that predates the column reads as an empty list. That is the honest
-- state for the thousands of items catalogued before anyone was asked --
-- unknown fitment, which is a different thing from "fits nothing" and from
-- "fits everything". The Point of Sale falls back to the static fitment
-- rules for those, and the form that creates an item now requires an answer.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "fitsMakes" TEXT[];
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "fitsModels" TEXT[];

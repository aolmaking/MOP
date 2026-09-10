-- The workshop's own estimate of how long a catalogued job takes.
--
-- Nullable and unconstrained on purpose: it is guidance for planning and for
-- what the technician sees on the card, never a deadline the job is measured
-- against. `IF NOT EXISTS` so it applies to a database built with `db push`
-- as well as one built from this migration history.
ALTER TABLE "price_catalog_entries" ADD COLUMN IF NOT EXISTS "standardHours" DECIMAL(5,2);

-- Three columns on `tenant_configuration` that nothing has ever read.
--
-- INVARIANT 4 of this recovery: every configuration option must either change
-- runtime behaviour or not exist. These three were written as `{}` at tenant
-- creation and read by no code path anywhere in the product -- not by the API,
-- not by the web app, not by a report. They are the same class of defect as
-- `enabledModules` (dropped in 20260909140000), minus the active harm: that
-- one was a second source of truth that disagreed with the first, these are
-- simply inert.
--
-- `workflowPolicy` is the one worth naming. Workflow Health deliberately did
-- not run one of its seven documented checks because that check needed this
-- column to hold "portal enabled in workflow policy", to compare against the
-- module flag. That framing belonged to a product with two sources of truth
-- for a workshop's shape; there is one now, so the contradiction it looked for
-- can no longer be represented at all. The check runs again against a
-- contradiction that IS representable and far worse -- PORTAL_COUNTER_APPROVAL
-- = PORTAL_ONLY with no customer portal, which leaves every approval
-- unanswerable by anyone -- and needs nothing from this column.
--
-- `theme`, `roleExperience` and `enabledFeatures` stay: all three are read on
-- every request (workshop branding, permission layer 7, the feature-enabled
-- layer).

ALTER TABLE "tenant_configuration" DROP COLUMN "pageLayouts";
ALTER TABLE "tenant_configuration" DROP COLUMN "featureFlags";
ALTER TABLE "tenant_configuration" DROP COLUMN "workflowPolicy";

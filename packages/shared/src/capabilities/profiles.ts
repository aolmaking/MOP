import type { CapabilityProfile } from "./types";

/**
 * Shipped starting points, so creating a workshop is a choice rather than
 * an assembly job. Super Admin applies one at creation and adjusts after.
 *
 * Every profile here is validated in CI (see validator.spec.ts), so a
 * change to the lifecycle graph can never silently strand one of the
 * standard shapes.
 *
 * Capabilities not listed are ENABLED -- a profile records deviations
 * from the full product.
 */

/** Everything on. The 12-branch dealership network. */
export const MULTI_BRANCH_FULL_SERVICE: CapabilityProfile = {};

/** One bay, two technicians, no stock, no supervision layer. */
export const SINGLE_BAY_QUICK_SERVICE: CapabilityProfile = {
  MULTI_BRANCH: "DISABLED",
  MULTI_WAREHOUSE: "DISABLED",
  INVENTORY: "DISABLED",
  PART_RETURNS: "DISABLED",
  TEAMS: "DISABLED",
  TEAM_REVIEW: "DISABLED",
  QC: "DISABLED",
  EXTERNAL_PARTS: "ENABLED",
};

/** Sells diagnosis, not repair. No parts at all, no fitting. */
export const DIAGNOSTICS_ONLY: CapabilityProfile = {
  MULTI_BRANCH: "DISABLED",
  MULTI_WAREHOUSE: "DISABLED",
  INVENTORY: "DISABLED",
  PART_RETURNS: "DISABLED",
  TEAMS: "DISABLED",
  TEAM_REVIEW: "DISABLED",
  QC: "DISABLED",
  EXTERNAL_PARTS: "DISABLED",
};

/** Work happens on customer sites; stock is carried, supervision is not. */
export const HEAVY_EQUIPMENT_FIELD_SERVICE: CapabilityProfile = {
  MULTI_BRANCH: "DISABLED",
  TEAM_REVIEW: "DISABLED",
  CUSTOMER_PORTAL: "DISABLED",
};

/** Two branches, quick services dominate, no formal QC step. */
export const MOTORCYCLE_WORKSHOP: CapabilityProfile = {
  MULTI_WAREHOUSE: "DISABLED",
  TEAMS: "DISABLED",
  TEAM_REVIEW: "DISABLED",
  QC: "DISABLED",
};

/**
 * Legal invoices are issued from separate accounting software; MOP still
 * owns pricing, payments and balances. This is the Billing/Finance split
 * earning its keep -- EXTERNAL, not DISABLED.
 */
export const EXTERNAL_BILLING: CapabilityProfile = {
  BILLING: "EXTERNAL",
};

/** MOP runs operations only; all money is handled outside. */
export const EXTERNAL_FINANCE: CapabilityProfile = {
  FINANCE_CORE: "EXTERNAL",
  BILLING: "EXTERNAL",
};

export const SHIPPED_PROFILES: Readonly<Record<string, CapabilityProfile>> = {
  MULTI_BRANCH_FULL_SERVICE,
  SINGLE_BAY_QUICK_SERVICE,
  DIAGNOSTICS_ONLY,
  HEAVY_EQUIPMENT_FIELD_SERVICE,
  MOTORCYCLE_WORKSHOP,
  EXTERNAL_BILLING,
  EXTERNAL_FINANCE,
};

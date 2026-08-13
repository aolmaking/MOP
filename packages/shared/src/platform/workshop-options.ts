/**
 * Option lists for Add Workshop Owner, shared between the frontend form
 * and the backend DTO's validation so they can never silently drift --
 * two copies of "which business types are valid" is exactly the kind of
 * duplication that caused real bugs in the old codebase this is rebuilt
 * to avoid.
 */
export const BUSINESS_TYPES = [
  "Independent Garage",
  "Franchise / Chain",
  "Dealership Service Center",
  "Fleet Maintenance Operation",
  "Other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const STARTER_BUILDER_TEMPLATES = ["DEFAULT", "MINIMAL", "HIGH_VOLUME_BRANCH_NETWORK"] as const;
export type StarterBuilderTemplate = (typeof STARTER_BUILDER_TEMPLATES)[number];

export const STARTER_BUILDER_TEMPLATE_LABELS: Readonly<Record<StarterBuilderTemplate, string>> = {
  DEFAULT: "Default",
  MINIMAL: "Minimal",
  HIGH_VOLUME_BRANCH_NETWORK: "High-Volume Branch Network",
};

// Phase 17.A -- the "small number of starter profiles" the phase document
// asks for, rather than one giant form: Nafath and Delta need almost none
// of the same declarations, so a profile picks sensible starter
// specialization data at creation time, editable afterward. NONE seeds
// nothing, matching a workshop needing no specialization at all.
export const STARTER_SPECIALIZATION_PROFILES = ["NONE", "QUICK_SERVICE", "FIELD_SERVICE"] as const;
export type StarterSpecializationProfile = (typeof STARTER_SPECIALIZATION_PROFILES)[number];

export const STARTER_SPECIALIZATION_PROFILE_LABELS: Readonly<Record<StarterSpecializationProfile, string>> = {
  NONE: "None",
  QUICK_SERVICE: "Quick Service (e.g. oil change)",
  FIELD_SERVICE: "Field Service / Heavy Equipment (diagnostic forms)",
};

export const INITIAL_STATUSES = ["ACTIVE", "TRIAL", "PENDING_SETUP"] as const;
export type InitialStatus = (typeof INITIAL_STATUSES)[number];

export const INITIAL_STATUS_HELP: Readonly<Record<InitialStatus, string>> = {
  ACTIVE: "Owner can log in and use the workshop immediately.",
  TRIAL: "Owner can log in; a trial-expiry banner is shown platform-wide once trial policy is configured.",
  PENDING_SETUP: "Tenant is created but Owner login is blocked until you switch status to Active or Trial.",
};

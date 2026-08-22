export const ANALYST_SAVED_VIEW_SOURCE_PAGES = ["OPERATIONS", "PEOPLE", "INVENTORY", "DECISIONS", "FEATURE_ADOPTION"] as const;

export type AnalystSavedViewSourcePageValue = (typeof ANALYST_SAVED_VIEW_SOURCE_PAGES)[number];

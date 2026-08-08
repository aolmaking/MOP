/**
 * The correlation id header, shared by the middleware that sets it and
 * anything that reads it. Kept in one place so the two cannot drift.
 */
export const REQUEST_ID_HEADER = "x-request-id";

import type { ApiErrorContract } from "@mop/shared";

export function normalizeApiError(error: any, fallback = "Request failed."): ApiErrorContract {
  const body = error?.error || {};
  if (error?.status === 0) {
    return {
      code: "NETWORK_UNREACHABLE",
      message: "Backend API is not reachable. Start the API on port 4000, then open /api/v1/health from the web server.",
      recoverable: true
    };
  }
  if ([502, 503, 504].includes(Number(error?.status))) {
    return {
      code: "BACKEND_UNAVAILABLE",
      message: "Backend API is unavailable through the local web proxy. Make sure the API is running on http://localhost:4000/api/v1.",
      recoverable: true
    };
  }
  return {
    code: body.code || "VALIDATION_ERROR",
    message: body.message || error?.message || fallback,
    fieldErrors: body.fieldErrors,
    permission: body.permission,
    blockingStatus: body.blockingStatus,
    recoverable: Boolean(body.recoverable)
  };
}

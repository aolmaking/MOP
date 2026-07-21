export type ApiErrorCode =
  | "AUTH_UNAUTHORIZED"
  | "PERMISSION_DENIED"
  | "TENANT_INACTIVE"
  | "FEATURE_DISABLED"
  | "CATEGORY_DISABLED"
  | "WAREHOUSE_SCOPE_DENIED"
  | "CUSTOMER_DECISION_PENDING"
  | "PART_REQUEST_PENDING"
  | "PART_NOT_AVAILABLE"
  | "RETURN_PENDING_REVIEW"
  | "FINISH_BLOCKED"
  | "NETWORK_UNREACHABLE"
  | "BACKEND_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "RECORD_NOT_FOUND";

export interface ApiErrorContract {
  code: ApiErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  permission?: string;
  blockingStatus?: string;
  recoverable: boolean;
}

export function apiError(code: ApiErrorCode, message: string, extra: Partial<Omit<ApiErrorContract, "code" | "message">> = {}): ApiErrorContract {
  return { code, message, recoverable: false, ...extra };
}

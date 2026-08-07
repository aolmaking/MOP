export interface ApiErrorDto {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationErrorDetails {
  fields: Record<string, string[]>;
}

import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";
import type { ApiErrorDto, ValidationErrorDetails } from "@mop/shared";

function collectFieldErrors(errors: ValidationError[], prefix = ""): Record<string, string[]> {
  const fields: Record<string, string[]> = {};

  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;

    if (error.constraints) {
      fields[path] = Object.values(error.constraints);
    }

    if (error.children?.length) {
      Object.assign(fields, collectFieldErrors(error.children, path));
    }
  }

  return fields;
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const details: ValidationErrorDetails = { fields: collectFieldErrors(errors) };
  const body: ApiErrorDto = {
    code: "validation_error",
    message: "Validation failed",
    details: details as unknown as Record<string, unknown>,
  };
  return new BadRequestException(body);
}

import type { ValidationError } from "class-validator";
import { validationExceptionFactory } from "./validation-exception-factory";

function error(property: string, constraints: Record<string, string>, children: ValidationError[] = []): ValidationError {
  return { property, constraints, children, target: {}, value: undefined } as ValidationError;
}

describe("validationExceptionFactory", () => {
  it("produces an ApiErrorDto-shaped body with code=validation_error", () => {
    const exception = validationExceptionFactory([
      error("email", { isEmail: "email must be a valid email" }),
    ]);

    const body = exception.getResponse() as { code: string; message: string; details: { fields: Record<string, string[]> } };
    expect(body.code).toBe("validation_error");
    expect(body.message).toBe("Validation failed");
    expect(body.details.fields.email).toEqual(["email must be a valid email"]);
  });

  it("collects multiple constraint messages per field", () => {
    const exception = validationExceptionFactory([
      error("password", {
        minLength: "password must be at least 8 characters",
        matches: "password must contain a number",
      }),
    ]);

    const body = exception.getResponse() as { details: { fields: Record<string, string[]> } };
    expect(body.details.fields.password).toHaveLength(2);
  });

  it("flattens nested (child) validation errors with a dotted path", () => {
    const exception = validationExceptionFactory([
      error("owner", {}, [error("email", { isEmail: "email must be a valid email" })]),
    ]);

    const body = exception.getResponse() as { details: { fields: Record<string, string[]> } };
    expect(body.details.fields["owner.email"]).toEqual(["email must be a valid email"]);
  });

  it("omits a field with no constraints (e.g. only nested errors)", () => {
    const exception = validationExceptionFactory([
      error("owner", undefined as unknown as Record<string, string>, [
        error("email", { isEmail: "email must be a valid email" }),
      ]),
    ]);

    const body = exception.getResponse() as { details: { fields: Record<string, string[]> } };
    expect(body.details.fields.owner).toBeUndefined();
    expect(body.details.fields["owner.email"]).toEqual(["email must be a valid email"]);
  });
});

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorDto } from "@mop/shared";

const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "bad_request",
  [HttpStatus.UNAUTHORIZED]: "unauthorized",
  [HttpStatus.FORBIDDEN]: "forbidden",
  [HttpStatus.NOT_FOUND]: "not_found",
  [HttpStatus.CONFLICT]: "conflict",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "validation_error",
  [HttpStatus.TOO_MANY_REQUESTS]: "too_many_requests",
};

function isApiErrorShape(body: unknown): body is ApiErrorDto {
  return typeof body === "object" && body !== null && "code" in body && "message" in body;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // DTOs already shaped like ApiErrorDto (e.g. our ValidationPipe's
      // exceptionFactory) pass through as-is; everything else is normalized.
      const error: ApiErrorDto = isApiErrorShape(body)
        ? body
        : {
            code: STATUS_CODE_MAP[status] ?? "error",
            message: typeof body === "string" ? body : exception.message,
          };

      response.status(status).json(error);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const error: ApiErrorDto = {
      code: "internal_error",
      message: "Something went wrong. Please try again.",
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(error);
  }
}

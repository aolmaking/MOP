import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import type { ApiErrorDto } from '@mop/shared';

export interface PresentedError extends ApiErrorDto {
  httpStatus: number;
}

function isApiErrorDto(body: unknown): body is ApiErrorDto {
  return typeof body === 'object' && body !== null && 'code' in body && 'message' in body;
}

/**
 * Normalizes every HTTP error into a PresentedError, whether it came from
 * the API (ApiErrorDto body) or never reached it (network failure, CORS,
 * timeout). Consuming code always deals with one shape.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      const presented: PresentedError = isApiErrorDto(error.error)
        ? { ...error.error, httpStatus: error.status }
        : {
            code: error.status === 0 ? 'network_error' : 'error',
            message:
              error.status === 0
                ? 'Could not reach the server. Check your connection.'
                : 'Something went wrong. Please try again.',
            httpStatus: error.status,
          };

      return throwError(() => presented);
    }),
  );

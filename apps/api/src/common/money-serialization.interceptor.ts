import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";

/**
 * Converts every Prisma `Decimal` in a response into a string, everywhere,
 * automatically.
 *
 * Money is stored as `Decimal(12,2)`. Two things go wrong without this:
 * `JSON.stringify` on a Decimal emits an object of internal fields
 * (`{s,e,d}`) rather than a number, and converting to a JS `number`
 * silently loses precision at scale. Both are the kind of bug that looks
 * right in a demo and is wrong on a real invoice.
 *
 * It was previously handled by hand -- three `.toString()` calls in
 * workshops.service.ts. That works until the fourth endpoint forgets, and
 * a money bug that reaches a customer's invoice is not a bug worth
 * relying on discipline for. Doing it at the boundary means an endpoint
 * *cannot* get it wrong.
 *
 * The rule: **a money value that arrives in the browser as a JavaScript
 * number is a bug, regardless of whether it looks right.**
 *
 * Detection is structural rather than `instanceof`: the generated Prisma
 * client lives at a custom path, so a `Decimal` crossing package
 * boundaries can fail an `instanceof` check against a differently-resolved
 * copy of the class. Anything exposing decimal.js's exact shape is
 * converted.
 */
@Injectable()
export class MoneySerializationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => serializeDecimals(body)));
  }
}

/** decimal.js instances carry `s` (sign), `e` (exponent), `d` (digits) plus toFixed(). */
function isDecimal(value: object): boolean {
  const candidate = value as { s?: unknown; e?: unknown; d?: unknown; toFixed?: unknown };
  return (
    typeof candidate.toFixed === "function" &&
    typeof candidate.s === "number" &&
    typeof candidate.e === "number" &&
    Array.isArray(candidate.d)
  );
}

export function serializeDecimals(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;

  // Dates and Buffers have their own JSON representations; walking into
  // them would corrupt the response.
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  if (isDecimal(value)) return (value as { toFixed(dp?: number): string }).toFixed();

  // Prisma results are trees, but a caller could hand us a cycle; a
  // stack overflow deep inside a response serializer is a miserable bug.
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => serializeDecimals(item, seen));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = serializeDecimals(item, seen);
  return out;
}

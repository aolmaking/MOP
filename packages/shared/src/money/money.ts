/**
 * Money arithmetic, decided once.
 *
 * Pure and string-in/string-out, for the same reason the capability
 * validator is pure: it can be tested exhaustively in isolation, and that
 * property disappears the moment it touches a database or a Decimal
 * implementation.
 *
 * Money crosses every boundary in this system as a **string**. Not a
 * number -- a JS number cannot hold 0.1 + 0.2 -- and not a Decimal, which
 * would drag Prisma's runtime into the browser. A string is the only
 * representation that is exact, portable and serialisable.
 *
 * Internally everything is integer **minor units** (piastres, cents,
 * fils). Integers are exact in JS below 2^53, which is roughly 90 trillion
 * currency units -- larger than any invoice a workshop will ever issue.
 */

/** Two decimal places. Every currency MOP targets uses 100 minor units. */
const SCALE = 2;
const FACTOR = 100;

/**
 * A money value: a decimal string with exactly two places, e.g. "1800.50".
 * Negative is legal -- a refund, a credit, a negative adjustment.
 */
export type Money = string;

export const ZERO: Money = "0.00";

/**
 * Parses a money string to integer minor units.
 *
 * Refuses anything it cannot represent exactly rather than rounding it
 * quietly. "1.005" is not a price; somebody computed it and lost a
 * fraction on the way, and accepting it would bury that.
 */
export function toMinor(value: Money | number): number {
  const text = typeof value === "number" ? String(value) : value.trim();

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Not a money value: "${value}"`);
  }

  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > SCALE) {
    throw new Error(`"${value}" has more than ${SCALE} decimal places. Round it deliberately before it gets here.`);
  }

  const negative = whole.startsWith("-");
  const digits = (negative ? whole.slice(1) : whole) + fraction.padEnd(SCALE, "0");
  const minor = Number(digits); // money-lint-ok: `digits` is an integer string of minor units, never a decimal.

  if (!Number.isSafeInteger(minor)) {
    throw new Error(`"${value}" is too large to represent exactly.`);
  }

  return negative ? -minor : minor;
}

/** Formats integer minor units back to a two-place money string. */
export function fromMinor(minor: number): Money {
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`${minor} is not an exact integer of minor units.`);
  }

  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(SCALE + 1, "0");
  const whole = digits.slice(0, -SCALE);
  const fraction = digits.slice(-SCALE);

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function add(a: Money, b: Money): Money {
  return fromMinor(toMinor(a) + toMinor(b)); // money-lint-ok: integer minor units, exact below 2^53.
}

export function subtract(a: Money, b: Money): Money {
  return fromMinor(toMinor(a) - toMinor(b)); // money-lint-ok: integer minor units, exact below 2^53.
}

export function sum(values: readonly Money[]): Money {
  // money-lint-ok: integer minor units, exact below 2^53.
  return fromMinor(values.reduce((running, value) => running + toMinor(value), 0));
}

export function isNegative(value: Money): boolean {
  return toMinor(value) < 0;
}

export function isZero(value: Money): boolean {
  return toMinor(value) === 0;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  const left = toMinor(a);
  const right = toMinor(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}

/**
 * Half-up, away from zero.
 *
 * Banker's rounding is better for statistical neutrality across millions
 * of rows. This is a workshop invoice read by one person, and half-up is
 * what a human doing the sum on paper produces. Matching the customer's
 * own arithmetic beats being neutral in aggregate -- see PHASE_8.md §2.
 */
function roundHalfUp(exact: number): number {
  return exact < 0 ? -Math.round(-exact) : Math.round(exact);
}

/**
 * Multiplies money by a plain count. Exact -- a quantity is an integer.
 */
export function multiply(value: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new Error(`Quantity must be a whole number, got ${quantity}.`);
  }
  return fromMinor(toMinor(value) * quantity); // money-lint-ok: integer minor units times an integer count.
}

/**
 * Applies a percentage, rounded half-up to the cent.
 *
 * Percentages are the one place a fraction legitimately enters, so the
 * rounding happens HERE, once, rather than being left to a caller who
 * might do it twice.
 */
export function percentage(value: Money, percent: number): Money {
  if (!Number.isFinite(percent)) throw new Error(`Percentage must be a finite number, got ${percent}.`);
  // money-lint-ok: minor units are integers; the fraction is the percentage
  // itself, and roundHalfUp resolves it to an exact integer immediately.
  return fromMinor(roundHalfUp((toMinor(value) * percent) / 100));
}

export interface LineInput {
  readonly unitPrice: Money;
  readonly quantity: number;
  /** Labour charged alongside the part, per line rather than per unit. */
  readonly labour?: Money;
  /** Percentage off this line, applied before tax. */
  readonly discountPercent?: number;
  /** Tax rate for this line, applied after the discount. */
  readonly taxPercent?: number;
}

export interface LineTotal {
  readonly gross: Money;
  readonly discount: Money;
  readonly net: Money;
  readonly tax: Money;
  readonly total: Money;
}

/**
 * One line, rounded to the cent at every step.
 *
 * Discount comes off before tax, because tax is charged on what the
 * customer actually pays. Both orders exist in the world; this one is
 * named and lives here so a market that needs the other changes one
 * function rather than every caller (PHASE_8.md §2).
 */
export function lineTotal(line: LineInput): LineTotal {
  if (!Number.isInteger(line.quantity) || line.quantity < 0) {
    throw new Error(`Quantity must be a whole number, got ${line.quantity}.`);
  }

  const gross = add(multiply(line.unitPrice, line.quantity), line.labour ?? ZERO);
  const discount = line.discountPercent ? percentage(gross, line.discountPercent) : ZERO;
  const net = subtract(gross, discount);
  const tax = line.taxPercent ? percentage(net, line.taxPercent) : ZERO;

  return { gross, discount, net, tax, total: add(net, tax) };
}

export interface InvoiceTotal {
  readonly subtotal: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly lines: readonly LineTotal[];
}

/**
 * Sums lines that are ALREADY rounded.
 *
 * This is the decision the phase document argues at length: the invoice
 * total is the sum of rounded lines, never the rounded sum of exact
 * lines. The alternative produces an invoice whose printed lines do not
 * add up to its printed total, off by a cent -- arithmetically defensible
 * and commercially indefensible, because the customer adds the column
 * themselves.
 */
export function invoiceTotal(lines: readonly LineInput[]): InvoiceTotal {
  const computed = lines.map(lineTotal);

  return {
    subtotal: sum(computed.map((line) => line.gross)),
    discount: sum(computed.map((line) => line.discount)),
    tax: sum(computed.map((line) => line.tax)),
    total: sum(computed.map((line) => line.total)),
    lines: computed,
  };
}

/**
 * What is still owed. Never below zero.
 *
 * An over-payment is not a negative balance -- it is money the workshop
 * is holding that belongs to the customer, which is a refund, and a
 * refund is its own record. Letting the balance go negative would hide
 * that behind a minus sign.
 */
export function outstanding(total: Money, paid: Money): Money {
  const remaining = subtract(total, paid);
  return isNegative(remaining) ? ZERO : remaining;
}

/** Paid more than the total? The amount held on the customer's behalf. */
export function overpaid(total: Money, paid: Money): Money {
  const excess = subtract(paid, total);
  return isNegative(excess) ? ZERO : excess;
}

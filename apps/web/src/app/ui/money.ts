/**
 * Printing a money value, in the workshop's own currency.
 *
 * Two rules, both of which the operator and technician surfaces broke.
 *
 * NO SYMBOL. Those pages wrote `${{ price }}` -- a literal dollar sign in
 * front of every figure -- so an Egyptian workshop quoted its customers in
 * dollars on the quote builder, the counter, and the technician's tablet. The
 * currency is per tenant (`Tenant.currency`), and the rest of the product
 * already prints "1,234 EGP": amount, then the ISO code. A symbol table would
 * be a second source of truth for something the tenant row already answers.
 *
 * NO ARITHMETIC. The value arrives as a string and is formatted as one. A
 * money value that becomes a JS number in the browser is a bug even when it
 * looks right, which is why `@mop/shared/money` exists on the other side of
 * the wire and why `lint-money` guards the services that produce these.
 * Formatting is the one thing a page may legitimately do to money, so it is
 * the only thing this does.
 */
const GROUPING = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `"450.00"` and `"EGP"` become `"450.00 EGP"`.
 *
 * A value that is not a well-formed amount is returned unchanged rather than
 * coerced: `Number("")` is 0, and silently printing a zero price is how a part
 * ends up on a customer's bill for nothing. If the server sent something this
 * cannot read, the screen should show that rather than invent a figure.
 */
export function formatMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  const code = (currency ?? '').trim() || 'EGP';
  const raw = (amount ?? '').toString().trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;

  // Grouping only. The digits themselves come from the string the server sent,
  // so the pennies printed are the pennies stored.
  return `${GROUPING.format(Number(raw))} ${code}`;
}

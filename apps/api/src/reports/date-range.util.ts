/**
 * Shared date-range/comparison plumbing for every Reports & Analytics
 * query -- defined once so "current period vs previous period" means the
 * same thing everywhere it appears (Overview's KPI deltas, Financial's
 * trend chart, Operations' branch comparison), rather than five
 * controllers each rounding date boundaries slightly differently.
 */
export type ReportGranularity = "day" | "week" | "month";

export interface ReportDateRange {
  readonly from: Date;
  readonly to: Date;
}

export interface ReportQueryParams {
  readonly from?: string;
  readonly to?: string;
  readonly branchId?: string;
  readonly groupBy?: string;
}

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Defaults to the trailing 30 days when the caller supplies nothing --
 * every KPI needs *some* window, and 30 days is the same default
 * `InventoryReportsService` already uses for stock velocity, so the two
 * report surfaces agree on what "recent" means without either
 * hardcoding a duplicate constant.
 */
export function resolveDateRange(params: Pick<ReportQueryParams, "from" | "to">): ReportDateRange {
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("invalid_date_range");
  }
  if (from > to) {
    throw new Error("date_range_reversed");
  }

  return { from, to };
}

/** The immediately preceding period of the same length -- what every "vs last period" delta compares against. */
export function previousPeriod(range: ReportDateRange): ReportDateRange {
  const lengthMs = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - lengthMs), to: new Date(range.from.getTime()) };
}

export function resolveGranularity(value: string | undefined): ReportGranularity {
  return value === "week" || value === "month" ? value : "day";
}

/**
 * Percentage change, current vs previous. Null rather than `Infinity` or
 * a misleading "+/-100%" when the previous period was genuinely zero --
 * a workshop's first month of revenue is not "infinite growth," it is a
 * number with no meaningful comparison yet, and the UI must say so
 * rather than render a nonsense figure.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** Safe division -- 0 rather than NaN/Infinity when the denominator is genuinely zero (e.g. no invoices yet). */
export function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function toDecimalNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

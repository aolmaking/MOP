/**
 * Turns one of the five analytics report shapes into a CSV file, generically
 * rather than with a bespoke template per category. Every report is a tree
 * of scalars, nested objects, and arrays-of-objects; this walks it once:
 * scalars (and scalar-only arrays) become "field,value" rows in a Summary
 * section, each array-of-objects becomes its own titled table section using
 * its own keys as columns. Reused as-is by every export category, so a new
 * analytics report shape is exportable for free the moment its `build()`
 * return type exists -- nobody has to hand-write a column list per report.
 */
export function reportToCsv(report: Record<string, unknown>): string {
  const summary: [string, unknown][] = [];
  const sections: string[] = [];

  walk("", report, summary, sections);

  const summaryLines = ["Summary", "field,value", ...summary.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`)];
  return [summaryLines.join("\n"), ...sections].join("\n\n");
}

function walk(prefix: string, obj: Record<string, unknown>, summary: [string, unknown][], sections: string[]): void {
  for (const [key, value] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      if (value.length > 0 && isPlainObject(value[0])) {
        sections.push(objectsToCsvSection(label, value as Record<string, unknown>[]));
      } else {
        summary.push([label, value.length === 0 ? "" : value.join("; ")]);
      }
      continue;
    }

    if (isPlainObject(value)) {
      walk(label, value, summary, sections);
      continue;
    }

    summary.push([label, value]);
  }
}

function objectsToCsvSection(title: string, rows: readonly Record<string, unknown>[]): string {
  const headers = Object.keys(rows[0]);
  const lines = [title, headers.join(","), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))];
  return lines.join("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !(value instanceof Date);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

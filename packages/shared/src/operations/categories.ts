/**
 * The operating categories a workshop can serve.
 *
 * Mirrors the `CategoryCode` enum in the Prisma schema, and exists here
 * because the browser cannot import `@mop/database` -- without it every
 * screen that offers a category picker hardcodes its own list, and one
 * of them invents a value the database has never heard of. That is not
 * hypothetical: the first draft of the catalog editor offered TRUCKS,
 * BOATS and GENERATORS, and the write failed at the enum.
 *
 * Adding a category means changing the enum, migrating, and adding it
 * here. The label is English; translation is the i18n layer's job.
 */
export const OPERATING_CATEGORIES = [
  { value: "CARS", label: "Cars" },
  { value: "MOTORCYCLES", label: "Motorcycles" },
  { value: "HEAVY_EQUIPMENT", label: "Heavy Equipment" },
] as const;

export type OperatingCategory = (typeof OPERATING_CATEGORIES)[number]["value"];

export function isOperatingCategory(value: string): value is OperatingCategory {
  return OPERATING_CATEGORIES.some((category) => category.value === value);
}

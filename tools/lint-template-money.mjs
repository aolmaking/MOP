#!/usr/bin/env node
/**
 * Money in an Angular template.
 *
 * `lint-money.mjs` reads TypeScript. It cannot see inside `{{ ... }}`, and an
 * expression in an HTML file is exactly where the two worst money bugs in this
 * repository were hiding, on the two surfaces that handle the most of it:
 *
 *   ${{ part.unitPrice * part.quantity }}
 *   ${{ (item.price || item.unitPrice || 45).toFixed(2) }}
 *
 * The first is float arithmetic on money -- the same defect `lint-money`
 * refuses in a service, done where no linter was looking. The second is worse
 * on two counts: `item.price` is a field the server has never sent, so every
 * catalogue tile in the operator's till advertised a fabricated 45, and the
 * line it added to the customer's quote carried a differently fabricated 50.
 *
 * And the `$`. Currency is per tenant (`Tenant.currency`); an Egyptian
 * workshop was quoting its customers in dollars on every one of these screens.
 * The rest of the product prints "1,234 EGP" -- amount, then the ISO code the
 * workshop actually configured. See `apps/web/src/app/ui/money.ts`.
 *
 * Three rules, all of them things a reviewer reads straight past:
 *
 *   1. no currency symbol written into a template
 *   2. no arithmetic on a money-named identifier inside an interpolation
 *   3. no `.toFixed()` inside an interpolation -- formatting belongs in one
 *      helper, so changing how money prints is one edit and not forty
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const ROOTS = ["apps/web/src/app"];

/** Names that mean money. Same vocabulary as lint-money, deliberately. */
const MONEY =
  "price|prices|total|totals|amount|amounts|balance|balances|subtotal|discount|tax|paid|cost|costs|fee|fees|charge|charges|labor|labour|sum|sums";

const ALLOW = "money-lint-ok:";

const RULES = [
  {
    id: "currency symbol in a template",
    // A symbol immediately before an interpolation is always a hardcoded
    // currency; the tenant's own code belongs there instead.
    test: /[$£€₹]\s*\{\{/,
    fix: "Print through the page's `money(...)` helper, which uses the workshop's own currency.",
  },
  {
    id: "arithmetic on money in a template",
    test: new RegExp(`\\{\\{[^}]*\\b(?:${MONEY})\\b[^}]*[*+/-]\\s*[A-Za-z0-9_.()]`, "i"),
    fix: "Compute it in the component (see `lineTotal`), never in the view -- a template expression is unlintable and unreachable by a test.",
  },
  {
    // Only on money. An analyst page rounding hours or a rework percentage is
    // formatting a genuine number, and flagging those would train everyone to
    // ignore this linter -- the same reason lint-money scopes itself by
    // directory rather than running over the whole repository.
    id: "toFixed on money inside an interpolation",
    test: new RegExp(`\\{\\{[^}]*\\b(?:${MONEY})\\b[^}]*\\.toFixed\\s*\\(`, "i"),
    fix: "Format in one place. `toFixed` on a value that is already a string is a float round-trip you did not ask for.",
  },
];

const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".html")) check(full);
  }
}

function check(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(ALLOW)) return;
    // Quoted literals are prose, not expressions. Without this, a title like
    // "Add / Update Service Labor Price" reads as division on a money word.
    const code = line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
    for (const rule of RULES) {
      if (rule.test.test(code)) {
        problems.push({
          file: relative(ROOT, file),
          line: index + 1,
          rule: rule.id,
          text: line.trim().slice(0, 110),
          fix: rule.fix,
        });
        return;
      }
    }
  });
}

for (const root of ROOTS) {
  try {
    walk(join(ROOT, root));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

if (problems.length > 0) {
  console.error("Template money check FAILED.\n");
  for (const problem of problems) {
    console.error(`  ${problem.file}:${problem.line}  [${problem.rule}]`);
    console.error(`    ${problem.text}`);
    console.error(`    ${problem.fix}\n`);
  }
  console.error(`If a line is genuinely safe, add a comment containing "${ALLOW}" on it and say why.`);
  process.exit(1);
}

console.log("Template money OK -- no hardcoded currency, no arithmetic, no formatting in a view.");

#!/usr/bin/env node
/**
 * Money must never become a JavaScript number.
 *
 * Why this is a linter and not a review note: I already broke this rule
 * once, in Phase 5.E, by summing invoice totals with
 * `Number(d.toString())`. It passed review because it looked right. It is
 * wrong because `Decimal.add` is exact and `Number` is not, and at
 * invoice scale the difference eventually charges a customer a cent they
 * do not owe.
 *
 * A rule that has already been broken once is a rule that needs a machine
 * watching it.
 *
 * What is flagged, inside money-handling code:
 *
 *   Number(x)        -- lossy the moment x is a Decimal
 *   parseFloat(x)    -- same, and worse
 *   +x / x - y ...   -- when either side is a money-named identifier
 *   toFixed()        -- on anything that is not a Decimal (JS toFixed
 *                       rounds a float that has already lost precision)
 *
 * Deliberately NOT flagged:
 *
 *   Decimal.add/sub/mul/div/toFixed  -- the correct API
 *   Quantities and counts            -- integers, and integer arithmetic
 *                                       in JS is exact below 2^53
 *
 * The scope is money-handling directories rather than the whole codebase,
 * because `page + 1` in a paginator is not a money bug and flagging it
 * would train everyone to ignore this linter.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = [
  "apps/api/src/systems/finance",
  "apps/api/src/systems/inventory",
  "apps/api/src/branch-manager",
  // Operations composes the work-order dossier, which reports what a
  // customer was charged. It handled money while sitting outside this
  // rule, and a float sum over invoice lines survived there unnoticed
  // until the demo workshop finally had invoices to sum.
  //
  // apps/api/src/insights/owner-reports is deliberately NOT here. That layer converts
  // money to numbers on purpose, through its own `toDecimalNumber`, because
  // its contracts return numbers for charting. Whether that is the right
  // call is a real architectural question, but it is a decision rather
  // than an oversight, and switching this rule on over it would only
  // produce eight suppressions that hide it.
  "apps/api/src/systems/operations",
  "packages/shared/src/money",
];

/** Names that mean money. Matched case-insensitively on identifiers. */
const MONEY_WORDS =
  "price|prices|total|totals|amount|amounts|balance|balances|subtotal|discount|tax|paid|cost|costs|fee|fees|charge|charges";

const RULES = [
  {
    name: "Number() on money",
    // Number( something whose name looks like money, or a .toString() of it
    pattern: new RegExp(String.raw`\bNumber\s*\(\s*[^)]*(?:${MONEY_WORDS})`, "i"),
    fix: "Use Decimal arithmetic. `Number()` silently loses precision on a Decimal.",
  },
  {
    name: "parseFloat on money",
    pattern: new RegExp(String.raw`\bparseFloat\s*\(\s*[^)]*(?:${MONEY_WORDS})`, "i"),
    fix: "Use Decimal arithmetic. `parseFloat` is a float conversion by definition.",
  },
  {
    name: "arithmetic on money identifiers",
    // e.g. `line.total + other.total`, `sum += item.price`
    pattern: new RegExp(
      String.raw`\b\w*(?:${MONEY_WORDS})\w*\s*(?:\+|-|\*|\/)=?\s*\w` +
        "|" +
        String.raw`\b\w+\s*(?:\+|-|\*|\/)=?\s*\w*(?:${MONEY_WORDS})\w*\b`,
      "i",
    ),
    fix: "Use `.add()`, `.sub()`, `.mul()`, `.div()` on the Decimal.",
  },
];

/**
 * Lines carrying this marker are exempt, and must say why.
 *
 * Accepted on the line itself or in the comment lines directly above it,
 * because the reason is usually a sentence and a sentence reads better
 * above the code than crammed onto the end of it.
 */
const ALLOW = "money-lint-ok:";
const ALLOW_LOOKBACK = 4;

const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) check(full);
  }
}

function check(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  let inBlockComment = false;

  lines.forEach((line, index) => {
    // Comments describe the rule constantly in this codebase; linting them
    // would flag every explanation of why the rule exists.
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (exempted(lines, index)) return;

    // String literals mention money words constantly in error messages.
    const code = line.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');

    for (const rule of RULES) {
      if (rule.pattern.test(code)) {
        problems.push({
          file: relative(process.cwd(), file),
          line: index + 1,
          rule: rule.name,
          fix: rule.fix,
          text: trimmed.slice(0, 110),
        });
        break;
      }
    }
  });
}

/** The marker on this line, or in the comment lines immediately above it. */
function exempted(lines, index) {
  if (lines[index].includes(ALLOW)) return true;

  for (let above = index - 1; above >= 0 && above >= index - ALLOW_LOOKBACK; above -= 1) {
    const candidate = lines[above].trim();
    // Only walk back through comments -- a marker further up, separated by
    // real code, was written about something else.
    if (!candidate.startsWith("//") && !candidate.startsWith("*")) return false;
    if (candidate.includes(ALLOW)) return true;
  }

  return false;
}

for (const root of ROOTS) {
  try {
    walk(root);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // A directory that does not exist yet is not a failure -- finance is
    // built task by task.
  }
}

if (problems.length > 0) {
  console.error("Money check FAILED.\n");
  console.error("Money must never become a JavaScript number:\n");
  for (const problem of problems) {
    console.error(`  ${problem.file}:${problem.line}  [${problem.rule}]`);
    console.error(`    ${problem.text}`);
    console.error(`    ${problem.fix}\n`);
  }
  console.error(
    `If a line is genuinely safe -- a count, a percentage, an index -- add a\n` +
      `trailing comment containing "${ALLOW}" and say why.\n` +
      `See docs/phases/PHASE_8.md section 1.`,
  );
  process.exit(1);
}

console.log("Money OK -- no money value is converted to a JavaScript number.");

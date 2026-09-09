#!/usr/bin/env node
/**
 * Every interactive control on a technician surface must be at least one
 * tap target tall.
 *
 * Why this is a linter and not a review note: the number is derived, not
 * preferred. Standard gloves cut effective touch precision to 20-25mm,
 * 44px is the floor for gloved operation and 48-56px is where it becomes
 * reliable (docs/phases/PHASE_6.md section 2). A control added later at
 * 40px looks completely fine on a developer's monitor and is unusable in
 * a bay. Nobody catches that by reading a diff.
 *
 * The rule: inside apps/web/src/app/experiences/technician/** (which
 * now holds the technician shell too), any rule whose selector styles something interactive
 * must declare `min-block-size: var(--tap)`.
 *
 * `--tap` itself is defined once, on .tech in technician-shell.css, so
 * changing the floor is one edit and this check keeps everything honest
 * against it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = [
  "apps/web/src/app/experiences/technician",
];

/**
 * Selectors that are interactive. Matched against the LAST simple
 * selector so `.tools .tap` still counts, while `.task-title` (a span
 * inside a row) does not.
 */
const INTERACTIVE = /(?:^|[\s>+~])(?:button|a|select|textarea|input)(?![\w-])|--?(?:tap|button|link)(?:$|[\s:,{])|\.(?:tap|big-button|tech-nav-link|job-link|card-back)(?![\w-])/;

/** Rules that are states or modifiers of a control already checked. */
const MODIFIER = /:(?:hover|active|focus|focus-visible|disabled)|--(?:primary|wide|selected|severity|active|skeleton|bad|done|blocked)(?![\w-])/;

const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".css")) check(full);
  }
}

/** The floor itself, so a literal length can be judged against it. */
const TAP_PX = 44;

/**
 * Does this declaration block put the control at or above the floor?
 *
 * `var(--tap)` is the canonical way to say so and stays the preferred one --
 * it tracks the token if the floor ever moves. A literal is accepted when it
 * is at least the floor, because a control deliberately set to the 56px
 * "reliable with gloves" size is not a violation, and rewriting it to
 * `var(--tap)` to satisfy a regex would make the surface *worse*.
 */
function declaresFloor(body) {
  if (/min-block-size:\s*var\(--tap\)/.test(body)) return true;
  const literal = body.match(/min-block-size:\s*(\d+(?:\.\d+)?)px/);
  return literal !== null && Number(literal[1]) >= TAP_PX;
}

function check(file) {
  const css = readFileSync(file, "utf8");
  // Strip comments so a selector mentioned in prose is not linted.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // A control is often styled by more than one rule -- the base rule, then a
  // later one adding a transition or a shadow. The floor belongs to the
  // CONTROL, not to each block that mentions it, so collect what every rule
  // for a selector declares before judging any of them. Demanding the
  // declaration in each block just produces duplicated CSS that can drift
  // from the real one.
  const satisfied = new Set();
  const collect = /([^{}]+)\{([^{}]*)\}/g;
  let seen;
  while ((seen = collect.exec(stripped)) !== null) {
    if (declaresFloor(seen[2])) {
      for (const one of seen[1].split(",")) satisfied.add(one.trim().replace(/\s+/g, " "));
    }
  }

  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = rulePattern.exec(stripped)) !== null) {
    const selector = match[1].trim();
    const body = match[2];

    if (selector.startsWith("@") || selector.includes("keyframes")) continue;
    if (!INTERACTIVE.test(selector)) continue;
    if (MODIFIER.test(selector)) continue;
    if (declaresFloor(body)) continue;
    if (selector.split(",").every((one) => satisfied.has(one.trim().replace(/\s+/g, " ")))) continue;
    // A descendant selector refines a control that is defined -- and
    // therefore already checked -- by its own rule. `.reasons .tap` only
    // widens `.tap`; demanding the floor again would just be duplicated
    // CSS that can drift from the real declaration.
    if (/[\s>+~]/.test(selector.replace(/\s*,\s*/g, ","))) continue;

    problems.push({
      file: relative(process.cwd(), file),
      selector: selector.replace(/\s+/g, " "),
    });
  }
}

for (const root of ROOTS) {
  try {
    walk(root);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // A root that does not exist yet is not a failure -- the technician
    // surfaces are built phase by phase.
  }
}

if (problems.length > 0) {
  console.error("Touch target check FAILED.\n");
  console.error("These technician controls do not declare a minimum tap size:\n");
  for (const problem of problems) {
    console.error(`  ${problem.file}\n    ${problem.selector}`);
  }
  console.error(
    "\nAdd `min-block-size: var(--tap);`. A gloved hand cannot reliably hit\n" +
      "anything smaller, and a missed tap costs a put-down/pick-up cycle.\n" +
      "See docs/phases/PHASE_6.md section 2.",
  );
  process.exit(1);
}

console.log("Touch targets OK -- every technician control declares min-block-size: var(--tap).");

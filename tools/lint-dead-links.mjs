#!/usr/bin/env node
/**
 * No visible link goes nowhere.
 *
 * Acceptance criterion 3 of `docs/14-DAY-LAUNCH-SCOPE.md`: every visible
 * button on an operational page performs its action. Angular's strict
 * template checking already covers half of it -- `(click)="typo()"`
 * fails the build. It does not check route STRINGS at all, so
 * `routerLink="/branch/deliveries"` compiles, renders, and quietly lands
 * on the wildcard redirect: a dead button that looks alive.
 *
 * The second check is the one this sprint needs. Surface narrowing hid
 * whole sections from the rails; a link left behind on a page the pilot
 * DOES use is a door into a room whose lights are off. Two existed when
 * this was written -- "See full history" on the owner's home, and the
 * Teams sentence on Organization -- and both are now gated behind the
 * same manifest that hides the rail entries.
 *
 * A linter rather than a spec because reading the repository from a
 * browser test environment needs node types the web app deliberately
 * does not carry, and because this is the shape the project's five other
 * custom checks already take.
 *
 * Only static `routerLink="..."` values are checked. A bound
 * `[routerLink]="expr"` is computed at runtime and cannot be read here;
 * the journeys cover those.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "apps", "web", "src", "app");

function walk(dir, extension) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}

/**
 * Every concrete path the router can resolve, as segment arrays.
 *
 * Parsed by walking the source with a brace counter rather than by
 * regex alone: nesting is the whole point of the route table, and a flat
 * list of `path:` strings would happily accept `/workshops` at the root.
 */
function routePatterns() {
  const source = readFileSync(join(APP, "app.routes.ts"), "utf8");
  const patterns = [];

  // Each entry: the prefix that applies while we are inside this depth.
  const stack = [{ depth: -1, prefix: [] }];
  let depth = 0;
  let pending = null;

  for (const line of source.split("\n")) {
    const before = depth;

    const pathMatch = line.match(/^[\s{]*path:\s*'([^']*)'/);
    if (pathMatch) {
      const prefix = stack[stack.length - 1].prefix;
      const segments = [...prefix, ...pathMatch[1].split("/").filter(Boolean)];
      if (pathMatch[1] !== "**") patterns.push(segments);
      // Remembered in case this route turns out to have children.
      pending = segments;
    }

    if (/children:\s*\[/.test(line) && pending) {
      stack.push({ depth, prefix: pending });
    }

    for (const character of line) {
      if (character === "[" || character === "{") depth += 1;
      if (character === "]" || character === "}") depth -= 1;
    }

    if (depth < before && stack.length > 1 && depth <= stack[stack.length - 1].depth) {
      stack.pop();
    }
  }

  return patterns;
}

function resolves(link, patterns) {
  const wanted = link.split("?")[0].split("/").filter(Boolean);
  return patterns.some(
    (pattern) =>
      pattern.length === wanted.length &&
      // A `:param` segment matches whatever sits in that position.
      pattern.every((segment, index) => segment.startsWith(":") || segment === wanted[index]),
  );
}

/** The launch manifest's held-back list, read from its single source. */
function heldBack() {
  const source = readFileSync(join(APP, "runtime", "launch-surface.ts"), "utf8");
  return [...source.matchAll(/route:\s*'([^']+)'/g)].map((match) => match[1]);
}

function isHeldBack(link, held) {
  return held.some((route) => link === route || link.startsWith(`${route}/`));
}

/**
 * Links into a held-back surface that are nonetheless correct, and why.
 *
 * A link belongs here only when the page carrying it is itself inside
 * the hidden section: navigating within a room nobody can enter is not
 * a dead end.
 */
const PERMITTED_INTO_HIDDEN = {
  "/platform/reports":
    "A back-link on the workshop-usage page, which is itself inside the held-back Platform Reports section.",
  // The two below are real links on pages a pilot owner uses, and both
  // are wrapped in an `@if` reading the SAME manifest this linter reads
  // -- `historyVisible` in owner-home-page.ts, `teamsVisible` in
  // organization-page.ts. This linter sees raw template text and cannot
  // tell a guarded link from a bare one, which is its one blind spot;
  // listing them here is what makes the blind spot visible rather than
  // silent. Verify by reading the two fields.
  "/owner/audit": "Guarded at runtime by `historyVisible` in owner-home-page.ts, which reads the same manifest.",
  "/owner/organization/teams":
    "Guarded at runtime by `teamsVisible` in organization-page.ts, which reads the same manifest.",
};

const patterns = routePatterns();
const held = heldBack();

const links = walk(APP, ".html").flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/routerLink="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((link) => link.startsWith("/"))
    .map((link) => ({ link, file: file.slice(ROOT.length + 1).replace(/\\/g, "/") })),
);

const problems = [];

// A vacuous pass is worse than a failure: it reports success having
// checked nothing. If either walk breaks, say so loudly.
if (links.length < 5) problems.push(`only found ${links.length} routerLinks -- the template walk is broken`);
if (patterns.length < 30) problems.push(`only found ${patterns.length} routes -- the route parse is broken`);

for (const { link, file } of links) {
  if (!resolves(link, patterns)) {
    problems.push(`${link} does not resolve to any route  (${file})`);
  } else if (isHeldBack(link, held) && !(link in PERMITTED_INTO_HIDDEN)) {
    problems.push(`${link} points into a surface the launch sprint holds back  (${file})`);
  }
}

if (problems.length > 0) {
  console.error("Dead links FAILED:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Dead links OK -- ${links.length} static routerLinks all resolve against ${patterns.length} routes, and none opens a held-back surface.`,
);

#!/usr/bin/env node
// Fails if anything ever calls .delete()/.deleteMany() on a model whose
// rows must be deactivated, never removed. ControlSetting is the first
// (and, as of this writing, only) member: it is a governance record --
// a platform admin's own decision about a tenant, or the platform as a
// whole -- and hard-deleting one erases evidence that the decision was
// ever made. `active: false` is the only legitimate way to retire one.
// H10, docs/scenarios3/EDGE_CASE_REGISTER.md.
//
// Nothing in the codebase writes ControlSetting at all yet (Governance
// Controls, the page that will, isn't built) -- this rule exists so the
// mistake can't be introduced later, the same reasoning as the audit
// boundary and money linters: a structural guarantee holds regardless of
// who writes the code that eventually calls this model, rather than
// relying on every future author having read this comment.
//
// *.spec.ts files are exempt for the same reason lint-audit-boundary.mjs
// exempts them: integration tests own a disposable test database
// end-to-end and legitimately hard-delete every table, including this
// one, as ordinary teardown.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..", "apps", "api", "src");
const NEVER_HARD_DELETE = ["controlSetting"];
const DELETE_PATTERN = new RegExp(`\\.(${NEVER_HARD_DELETE.join("|")})\\.(delete|deleteMany)\\b`);

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (rel.endsWith(".spec.ts")) continue;

  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (DELETE_PATTERN.test(line)) {
      violations.push(`apps/api/src/${rel}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error(
    `No-hard-delete violation: ${NEVER_HARD_DELETE.join(", ")} must only be deactivated (active: false), never deleted.\n`,
  );
  for (const v of violations) console.error(`  ${v}`);
  console.error(`\n${violations.length} violation(s) found.`);
  process.exit(1);
}

console.log(`No-hard-delete OK -- ${NEVER_HARD_DELETE.join(", ")} is never .delete()/.deleteMany()'d outside tests.`);

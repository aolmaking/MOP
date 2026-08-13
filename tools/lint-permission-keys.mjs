#!/usr/bin/env node
// Every permission-key string literal that reaches EffectiveAccessService.can()
// (directly, or through a controller's own `require(session, "...")` helper)
// must be a real, declared key in packages/shared/src/permissions/permission-manifest.ts.
//
// `can(session, permissionKey: string)` takes a bare `string`, not the
// `PermissionKey` union -- deliberately, since it is called with values built
// at runtime in a couple of places -- so TypeScript alone cannot catch a
// misspelled literal like "finance.invoice.issue" (missing the second "s").
// A key that exists but is never checked anywhere is not flagged: a
// permission declared ahead of the page that will use it is normal, named
// directly in permission-manifest.ts's own comment ("deliberately not
// exhaustive yet... grows as each later phase adds real permission-gated
// actions").
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API_ROOT = join(import.meta.dirname, "..", "apps", "api", "src");
const MANIFEST_PATH = join(
  import.meta.dirname,
  "..",
  "packages",
  "shared",
  "src",
  "permissions",
  "permission-manifest.ts",
);

const manifestSource = readFileSync(MANIFEST_PATH, "utf8");
const declaredKeys = new Set([...manifestSource.matchAll(/key:\s*"([a-z0-9_.]+)"/g)].map((m) => m[1]));

if (declaredKeys.size === 0) {
  console.error("Permission-key check found zero declared keys in permission-manifest.ts -- refusing to run a check against nothing.");
  process.exit(1);
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) files.push(full);
  }
  return files;
}

// Matches both `access.can(session, "key")` and a controller's own
// `require(session, "key")` helper, since most controllers wrap `can()`
// in one to also 403 and resolve tenantId in a single call.
const CALL_SITE = /\.(?:can|require)\(\s*session\s*,\s*"([a-z0-9_.]+)"/g;

const violations = [];

for (const file of walk(API_ROOT)) {
  const rel = relative(API_ROOT, file).split(sep).join("/");
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const match of line.matchAll(CALL_SITE)) {
      const key = match[1];
      if (!declaredKeys.has(key)) {
        violations.push(`apps/api/src/${rel}:${index + 1}: "${key}" is not declared in permission-manifest.ts`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("Permission-key check failed -- these call sites reference a key permission-manifest.ts does not declare:\n");
  for (const v of violations) console.error(`  ${v}`);
  console.error(`\n${violations.length} violation(s) found. Either the key was misspelled, or it belongs in the manifest.`);
  process.exit(1);
}

console.log(`Permission keys OK -- every checked call site references one of ${declaredKeys.size} declared keys.`);

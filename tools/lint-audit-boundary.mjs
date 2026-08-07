#!/usr/bin/env node
// Fails if anything outside apps/api/src/audit/** writes to AuditLog
// directly. Reading (findMany/findFirst/etc, for the Audit & Change
// History pages) is fine anywhere -- this only guards writes, since a
// write that bypasses AuditService is a write the platform can't
// guarantee is consistently shaped.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..", "apps", "api", "src");
const WRITE_PATTERN = /\.auditLog\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

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
  if (rel.startsWith("audit/")) continue;

  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (WRITE_PATTERN.test(line)) {
      violations.push(`apps/api/src/${rel}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("Audit boundary violation: AuditLog must only be written from apps/api/src/audit/** (via AuditService).\n");
  for (const v of violations) console.error(`  ${v}`);
  console.error(`\n${violations.length} violation(s) found.`);
  process.exit(1);
}

console.log("Audit boundary OK -- no AuditLog writes outside apps/api/src/audit/**.");

#!/usr/bin/env node
/**
 * Fails the build if any stylesheet uses a physical direction property
 * where a logical one exists.
 *
 * MOP's primary market works in Arabic. Retrofitting right-to-left support
 * after the UI has grown means touching every component's stylesheet, so
 * the rule is enforced from the start instead: write
 * `margin-inline-start`, never `margin-left`, and the layout mirrors
 * correctly when `dir="rtl"` is set, at no cost while it isn't.
 *
 * This is the same shape as tools/lint-audit-boundary.mjs -- a rule the
 * build enforces, rather than a convention a reviewer has to remember.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_ROOTS = [join(ROOT, "apps", "web", "src")];
const SKIP_DIRS = new Set(["node_modules", "dist", ".angular", "coverage"]);

/** property -> logical replacement */
const BANNED = new Map([
  ["margin-left", "margin-inline-start"],
  ["margin-right", "margin-inline-end"],
  ["padding-left", "padding-inline-start"],
  ["padding-right", "padding-inline-end"],
  ["border-left", "border-inline-start"],
  ["border-right", "border-inline-end"],
  ["border-left-color", "border-inline-start-color"],
  ["border-right-color", "border-inline-end-color"],
  ["border-left-width", "border-inline-start-width"],
  ["border-right-width", "border-inline-end-width"],
  ["border-top-left-radius", "border-start-start-radius"],
  ["border-top-right-radius", "border-start-end-radius"],
  ["border-bottom-left-radius", "border-end-start-radius"],
  ["border-bottom-right-radius", "border-end-end-radius"],
  ["left", "inset-inline-start"],
  ["right", "inset-inline-end"],
]);

const TEXT_ALIGN = /text-align\s*:\s*(left|right)\b/;

function collectStylesheets(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectStylesheets(full, out);
    else if (/\.(css|scss)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations = [];

for (const searchRoot of SEARCH_ROOTS) {
  for (const file of collectStylesheets(searchRoot)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      // Strip comments and inline `/* allow-physical */` escapes so a
      // deliberate exception can be documented rather than silently
      // reintroducing the problem.
      if (line.includes("allow-physical")) return;
      const code = line.replace(/\/\*[\s\S]*?\*\//g, "");

      const declaration = /^\s*([a-z-]+)\s*:/.exec(code);
      if (declaration) {
        const property = declaration[1];
        const replacement = BANNED.get(property);
        if (replacement) {
          violations.push({ file, line: index + 1, found: property, use: replacement, text: line.trim() });
        }
      }

      if (TEXT_ALIGN.test(code)) {
        violations.push({
          file,
          line: index + 1,
          found: "text-align: left/right",
          use: "text-align: start/end",
          text: line.trim(),
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Physical direction properties found. Use logical properties so the UI mirrors under dir=\"rtl\":\n");
  for (const v of violations) {
    console.error(`  ${relative(ROOT, v.file)}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    use \`${v.use}\` instead of \`${v.found}\`\n`);
  }
  console.error("If a physical property is genuinely required, add an `allow-physical` comment on that line explaining why.");
  process.exit(1);
}

console.log("Directional CSS OK -- no physical direction properties in apps/web/src.");

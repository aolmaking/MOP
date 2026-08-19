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

/*
 * A horizontally-offset inset shadow is a physical direction wearing a
 * different property name. `box-shadow: inset 3px 0 0 0 red` draws a bar
 * down the left edge and stays on the left under dir="rtl", so a marker
 * meant to hug the outer edge of the first column ends up pointing at
 * nothing once the table mirrors. This rule reads property names, so it
 * went unnoticed until an RTL pass over the stock table found it.
 *
 * Only inset shadows with a non-zero x-offset are flagged. An outer
 * drop-shadow is a light source rather than a direction, and elevation is
 * not supposed to mirror -- flagging those would turn the rule into noise.
 */
const INSET_SHADOW = /box-shadow\s*:[^;]*\binset\b[^;]*/;
// Anchored to the start of the value: in box-shadow the x-offset is the
// FIRST length, and a bare `0` is a perfectly legal one. Searching for
// the first token carrying a unit instead would skip an unitless zero and
// read the y-offset, flagging `inset 0 -2px` as horizontal.
const LEADING_LENGTH = /^(-?(?:\d*\.)?\d+)(?:px|rem|em)?(?=\s|$)/;

function insetShadowHasHorizontalOffset(code) {
  const match = INSET_SHADOW.exec(code);
  if (!match) return false;
  // Drop the property name and the `inset` keyword -- which is legal at
  // either end -- then read the leading length.
  const value = match[0].replace(/^[^:]*:/, "").replace(/\binset\b/g, " ").trim();
  const first = LEADING_LENGTH.exec(value);
  // A shadow written colour-first has no leading length. Left alone
  // rather than guessed at: this rule should never fail a build over a
  // form it cannot actually read.
  if (!first) return false;
  return parseFloat(first[1]) !== 0;
}

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

      if (insetShadowHasHorizontalOffset(code)) {
        violations.push({
          file,
          line: index + 1,
          found: "box-shadow: inset with a horizontal offset",
          use: "border-inline-start/end, or an inset shadow offset only vertically",
          text: line.trim(),
        });
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

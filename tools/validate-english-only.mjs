import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const excludedDirectories = new Set([".git", ".angular", ".pnpm-store", "node_modules"]);
const arabicUnicode = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;
const violations = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolutePath = resolve(directory, entry.name);
    const projectPath = relative(root, absolutePath).replaceAll("\\", "/");

    if (arabicUnicode.test(projectPath)) {
      violations.push(`${projectPath}: Arabic Unicode in path`);
    }
    if (entry.isDirectory()) {
      scan(absolutePath);
      continue;
    }
    if (!entry.isFile()) continue;

    const content = readFileSync(absolutePath);
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    const lines = text.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      if (arabicUnicode.test(lines[index])) {
        violations.push(`${projectPath}:${index + 1}: Arabic Unicode in content`);
      }
    }
  }
}

scan(root);

if (violations.length) {
  for (const violation of violations) console.error(`FAIL ${violation}`);
  console.error(`\nENGLISH-ONLY GATE: FAIL (${violations.length} violations)`);
  process.exit(1);
}

console.log("ENGLISH-ONLY GATE: PASS (no Arabic Unicode in project paths or first-party files)");

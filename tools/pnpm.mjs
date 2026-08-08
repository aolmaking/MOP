#!/usr/bin/env node
/**
 * Runs pnpm without requiring `pnpm` to be on PATH.
 *
 * Root scripts used to call a bare nested `pnpm`, which fails on any
 * machine where pnpm is reached through corepack rather than a global
 * install -- pnpm does not add itself to PATH for the scripts it runs, so
 * `pnpm test` at the root would die with "'pnpm' is not recognized" even
 * though the outer command had just worked.
 *
 * pnpm does export `npm_execpath` (the path to its own entry script) to
 * every script it runs, so re-invoking it through the current Node binary
 * is reliable on every machine and both package-manager setups.
 *
 * Usage: node tools/pnpm.mjs --filter @mop/api run test
 */

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node tools/pnpm.mjs <pnpm args...>");
  process.exit(64);
}

const execpath = process.env.npm_execpath;

// When invoked by pnpm (the normal case), go through Node + pnpm's own
// entry script. When run standalone by a human, fall back to whatever
// `pnpm` is on PATH.
const [command, commandArgs] = execpath
  ? [process.execPath, [execpath, ...args]]
  : ["pnpm", args];

const result = spawnSync(command, commandArgs, { stdio: "inherit", shell: !execpath });

if (result.error) {
  console.error(`Failed to run pnpm: ${result.error.message}`);
  if (!execpath) console.error("pnpm is not on PATH. Run via `corepack pnpm <script>`, or `corepack enable`.");
  process.exit(1);
}

process.exit(result.status ?? 1);

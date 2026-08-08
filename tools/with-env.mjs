#!/usr/bin/env node
/**
 * Loads the repo-root `.env` and then runs a command.
 *
 * Prisma resolves `.env` relative to the *schema file*
 * (packages/database/prisma/), not the repo root, so `prisma migrate` run
 * from a workspace package cannot see the root `.env` and fails with
 * "Environment variable not found: DATABASE_URL". CI works around it with
 * a job-level variable; a fresh clone just breaks. This makes the root
 * `.env` authoritative for every workspace package.
 *
 * Existing environment variables always win, so a CI job-level
 * DATABASE_URL is never clobbered by a stray local `.env`.
 *
 * Usage:  node tools/with-env.mjs prisma migrate deploy
 *         node tools/with-env.mjs --mop-env .env.test prisma migrate deploy
 *
 * The flag is `--mop-env`, not `--env-file`: Node itself consumes
 * `--env-file` even when it appears after the script path, so the inner
 * command never sees it and Node tries to execute the filename instead.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

const argv = process.argv.slice(2);
let envFile = ".env";
if (argv[0] === "--mop-env") {
  envFile = argv[1];
  argv.splice(0, 2);
}

if (argv.length === 0) {
  console.error("usage: node tools/with-env.mjs [--mop-env <file>] <command> [args...]");
  process.exit(64);
}

/**
 * Minimal KEY=VALUE parser -- enough for the handful of variables this
 * project uses, without adding a dependency to a script whose whole job
 * is to work before dependencies are trustworthy. Supports comments,
 * blank lines, `export ` prefixes, and single/double quoted values.
 */
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

const envPath = join(ROOT, envFile);
if (existsSync(envPath)) {
  const parsed = parseEnv(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    // Real environment wins -- never override CI's job-level config.
    if (process.env[key] === undefined) process.env[key] = value;
  }
} else if (process.env.DATABASE_URL === undefined) {
  console.error(`No ${envFile} at ${ROOT} and DATABASE_URL is not set.`);
  console.error("Copy .env.example to .env (see docs/DEVELOPMENT.md).");
  process.exit(1);
}

const [command, ...commandArgs] = argv;
const result = spawnSync(command, commandArgs, { stdio: "inherit", env: process.env, shell: true });

if (result.error) {
  console.error(`Failed to run ${command}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);

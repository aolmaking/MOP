#!/usr/bin/env node
/**
 * `pnpm doctor` -- one command that checks every environment failure mode
 * this project has actually hit, and says plainly how to fix each one.
 *
 * Deliberately dependency-free (node builtins only): it has to be able to
 * run when the workspace install is exactly what's broken.
 *
 * Exit code 1 if any check FAILs. WARNs never fail the run -- they are
 * "worth knowing", not "you are blocked".
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const results = [];
const record = (status, name, detail, fix) => results.push({ status, name, detail, fix });
const pass = (name, detail) => record("PASS", name, detail);
const warn = (name, detail, fix) => record("WARN", name, detail, fix);
const fail = (name, detail, fix) => record("FAIL", name, detail, fix);

// --- Node version -----------------------------------------------------------
function checkNode() {
  const running = process.versions.node;
  const major = Number(running.split(".")[0]);
  const nvmrcPath = join(ROOT, ".nvmrc");

  if (!existsSync(nvmrcPath)) {
    warn("Node version", `running ${running}; no .nvmrc to compare against`, "Add a .nvmrc pinning the CI major.");
    return;
  }

  const wanted = readFileSync(nvmrcPath, "utf8").trim().replace(/^v/, "");
  const wantedMajor = Number(wanted.split(".")[0]);

  if (major === wantedMajor) {
    pass("Node version", `${running} (matches .nvmrc)`);
  } else if (major > wantedMajor) {
    // Not a failure: engines allows it. But CI runs the pinned major, so a
    // green local run is not proof of a green CI run.
    warn(
      "Node version",
      `running ${running}, but .nvmrc and CI pin ${wantedMajor}.x`,
      `CI runs Node ${wantedMajor}. Local passes here are not proof CI will pass.`,
    );
  } else {
    fail("Node version", `running ${running}, below the pinned ${wantedMajor}.x`, `Install Node ${wantedMajor}.`);
  }
}

// --- Workspace symlinks -----------------------------------------------------
/**
 * The failure that killed this workspace once already: copying the project
 * folder between Windows accounts leaves every pnpm symlink pointing at the
 * old account's absolute path, so nothing resolves and nothing builds.
 */
function checkSymlinks() {
  const probe = join(ROOT, "apps", "api", "node_modules", "@nestjs", "common", "package.json");

  if (!existsSync(join(ROOT, "node_modules"))) {
    fail("Workspace install", "node_modules is missing", "Run: CI=true corepack pnpm install");
    return;
  }

  if (!existsSync(probe)) {
    fail(
      "Workspace symlinks",
      "@nestjs/common does not resolve from apps/api -- symlinks are dangling",
      "Usually a folder copied between machines/accounts. Run: CI=true corepack pnpm install",
    );
    return;
  }

  try {
    const target = realpathSync(probe);
    if (!target.startsWith(realpathSync(ROOT))) {
      fail(
        "Workspace symlinks",
        `resolve outside this repo -> ${target}`,
        "Stale links from another checkout. Run: CI=true corepack pnpm install",
      );
      return;
    }
    pass("Workspace symlinks", "resolve inside the repo");
  } catch (error) {
    fail("Workspace symlinks", `unreadable: ${error.message}`, "Run: CI=true corepack pnpm install");
  }
}

// --- Prisma client freshness ------------------------------------------------
/**
 * A stale client is nasty because it fails as *type* errors far from the
 * cause -- Prisma payloads degrade to `{}` and every property access breaks.
 */
function checkPrismaClient() {
  const schema = join(ROOT, "packages", "database", "prisma", "schema.prisma");
  const generated = join(ROOT, "packages", "database", "generated", "client", "schema.prisma");

  if (!existsSync(schema)) {
    fail("Prisma schema", "packages/database/prisma/schema.prisma is missing", "Check out the repo fully.");
    return;
  }
  if (!existsSync(generated)) {
    fail("Prisma client", "not generated", "Run: corepack pnpm db:generate");
    return;
  }

  // Compare timestamps, not content: the generator writes a *reformatted*
  // copy of the schema (different column alignment), so a byte comparison
  // reports a stale client on every freshly-generated project.
  const schemaTime = statSync(schema).mtimeMs;
  const generatedTime = statSync(generated).mtimeMs;

  if (generatedTime >= schemaTime) {
    pass("Prisma client", "generated after the current schema");
  } else {
    const age = Math.round((schemaTime - generatedTime) / 1000);
    fail(
      "Prisma client",
      `stale -- schema.prisma is ${age}s newer than the generated client`,
      "Run: corepack pnpm db:generate",
    );
  }
}

// --- Env files --------------------------------------------------------------
function checkEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) {
    fail(".env", "missing", "Copy .env.example to .env");
    return;
  }

  const raw = readFileSync(envPath);
  if (raw.includes(0)) {
    fail(".env", "contains NUL bytes (likely written as UTF-16)", "Rewrite it as UTF-8.");
    return;
  }
  if (!/^\s*DATABASE_URL\s*=/m.test(raw.toString("utf8"))) {
    fail(".env", "has no DATABASE_URL", "Copy the line from .env.example");
    return;
  }
  pass(".env", "present, DATABASE_URL set");
}

// --- .gitignore integrity ---------------------------------------------------
/**
 * An external tool once appended an entry in UTF-16, injecting NUL bytes.
 * Git then treats .gitignore as binary and ignore rules become unreliable --
 * which is how node_modules ends up committed.
 */
function checkGitignore() {
  const path = join(ROOT, ".gitignore");
  if (!existsSync(path)) {
    warn(".gitignore", "missing", "Restore it -- build output will be committed without it.");
    return;
  }
  const raw = readFileSync(path);
  if (raw.includes(0)) {
    fail(
      ".gitignore",
      "contains NUL bytes -- git treats it as binary and ignore rules become unreliable",
      "Rewrite it as clean UTF-8.",
    );
    return;
  }
  pass(".gitignore", "clean UTF-8");
}

// --- Git repo ownership -----------------------------------------------------
function checkGitOwnership() {
  try {
    execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, stdio: "pipe" });
    pass("Git repository", "readable");
  } catch (error) {
    const message = `${error.stderr ?? ""}${error.stdout ?? ""}`;
    if (message.includes("dubious ownership")) {
      fail(
        "Git repository",
        "refused -- dubious ownership (folder copied between accounts)",
        `Run: git config --global --add safe.directory "${ROOT.replace(/\\/g, "/")}"`,
      );
    } else {
      warn("Git repository", "git status failed", message.split("\n")[0] || "Is git installed?");
    }
  }
}

// --- Postgres ---------------------------------------------------------------
function parsePort(url) {
  const match = /:(\d+)\//.exec(url ?? "");
  return match ? Number(match[1]) : 5432;
}

function checkPostgres() {
  const envPath = join(ROOT, ".env");
  const url = existsSync(envPath)
    ? (/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m.exec(readFileSync(envPath, "utf8"))?.[1] ?? "")
    : "";
  const port = parsePort(url);

  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (ok) => {
      socket.destroy();
      if (ok) pass("Postgres", `accepting connections on ${port}`);
      else fail("Postgres", `nothing listening on ${port}`, "Run: docker compose up -d (and start Docker Desktop)");
      resolve();
    };
    socket.setTimeout(3000);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

// --- Report -----------------------------------------------------------------
async function main() {
  checkNode();
  checkSymlinks();
  checkPrismaClient();
  checkEnv();
  checkGitignore();
  checkGitOwnership();
  await checkPostgres();

  const icon = { PASS: "  ok  ", WARN: " warn ", FAIL: " FAIL " };
  console.log("\nMOP environment check\n");
  for (const r of results) {
    console.log(`[${icon[r.status]}] ${r.name} — ${r.detail}`);
    if (r.fix) console.log(`           ${r.fix}`);
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  const warned = results.filter((r) => r.status === "WARN").length;

  console.log("");
  if (failed > 0) {
    console.log(`${failed} check(s) failed, ${warned} warning(s). Fix the failures above, then re-run.`);
    process.exit(1);
  }
  console.log(warned > 0 ? `All checks passed, with ${warned} warning(s).` : "All checks passed.");
}

main();

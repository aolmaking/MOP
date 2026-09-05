#!/usr/bin/env node
/**
 * MOP Platform - Unified One-Click Launcher
 *
 * Orchestrates:
 * 1. Environment & configuration validation (.env)
 * 2. PostgreSQL health detection & auto-start (fleet pg_ctl or docker compose)
 * 3. Prerequisite compilation (@mop/shared & Prisma client)
 * 4. Stale process cleanup on :4000 & :4200
 * 5. Dev servers startup (@mop/api on :4000 + @mop/web on :4200)
 * 6. Readiness polling & automatic browser launch (http://localhost:4200)
 * 7. Quick developer credentials dashboard
 */

import { spawn, exec, execSync, spawnSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ANSI formatting helpers
const color = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const args = process.argv.slice(2);
const isCheckOnly = args.includes("--check-only");
const noOpen = args.includes("--no-open") || Boolean(process.env.CI);

function printBanner() {
  console.log(`
${color.cyan}${color.bold}╔══════════════════════════════════════════════════════════════════════╗
║                   MOP — MAINTENANCE OPERATIONS PLATFORM              ║
║                        One-Click Project Launcher                    ║
╚══════════════════════════════════════════════════════════════════════╝${color.reset}
`);
}

function logStep(step, total, message) {
  console.log(`${color.bold}${color.blue}[${step}/${total}]${color.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`  ${color.green}✔${color.reset} ${message}`);
}

function logWarn(message) {
  console.log(`  ${color.yellow}⚠${color.reset} ${message}`);
}

function logError(message) {
  console.log(`  ${color.red}✖${color.reset} ${message}`);
}

// -----------------------------------------------------------------------------
// 1. Environment & Config
// -----------------------------------------------------------------------------
function ensureEnv() {
  const envPath = join(ROOT, ".env");
  const examplePath = join(ROOT, ".env.example");

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
      logSuccess("Created .env from .env.example with development defaults");
    } else {
      logWarn("No .env or .env.example found; continuing with system environment");
    }
  } else {
    logSuccess(".env configuration file detected");
  }
}

function parseDbPort() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return 5432;
  const content = readFileSync(envPath, "utf8");
  const match = /^\s*DATABASE_URL\s*=\s*"?postgres(?:ql)?:\/\/[^:]+:[^@]+@[^:]+:(\d+)\//m.exec(content);
  return match ? Number(match[1]) : 5432;
}

// -----------------------------------------------------------------------------
// 2. PostgreSQL Detection & Auto-Start
// -----------------------------------------------------------------------------
function isPortOpen(port, host = "127.0.0.1", timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let resolved = false;

    const done = (status) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(status);
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

async function ensurePostgres() {
  const port = parseDbPort();
  const alreadyRunning = await isPortOpen(port);

  if (alreadyRunning) {
    logSuccess(`PostgreSQL is active and accepting connections on port ${port}`);
    return true;
  }

  console.log(`  ${color.yellow}PostgreSQL is not responding on port ${port}. Attempting auto-start...${color.reset}`);

  // Option A: Windows Fleet user-space PostgreSQL
  const pgBin = "E:/mop-fleet/pg/pgsql/bin";
  const pgCtl = `${pgBin}/pg_ctl.exe`;
  const pgData = "E:/mop-fleet/pg/data";
  const pgLog = "E:/mop-fleet/pg/log/postgres.log";

  if (existsSync(pgCtl) && existsSync(pgData)) {
    try {
      console.log(`  Starting user-space PostgreSQL from ${pgData}...`);
      spawnSync(pgCtl, ["-D", pgData, "-l", pgLog, "-o", `-p ${port}`, "start"], {
        stdio: "inherit",
        shell: false,
      });

      // Poll until ready (up to 20 seconds)
      const start = Date.now();
      while (Date.now() - start < 20000) {
        if (await isPortOpen(port)) {
          logSuccess(`PostgreSQL started successfully on port ${port}`);
          return true;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      logError(`PostgreSQL did not start in time. Check log: ${pgLog}`);
      return false;
    } catch (err) {
      logError(`Failed to start PostgreSQL via pg_ctl: ${err.message}`);
      return false;
    }
  }

  // Option B: Docker Compose
  try {
    const hasDocker = spawnSync("docker", ["--version"], { stdio: "ignore" }).status === 0;
    if (hasDocker && existsSync(join(ROOT, "docker-compose.yml"))) {
      console.log("  Attempting to start database via docker compose...");
      spawnSync("docker", ["compose", "up", "-d"], { cwd: ROOT, stdio: "inherit" });

      const start = Date.now();
      while (Date.now() - start < 25000) {
        if (await isPortOpen(port)) {
          logSuccess(`PostgreSQL started via Docker on port ${port}`);
          return true;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } catch {
    // Docker not present or errored
  }

  logError(`Could not automatically start PostgreSQL on port ${port}.`);
  console.log(`  ${color.yellow}Please start PostgreSQL manually and try again.${color.reset}`);
  return false;
}

// -----------------------------------------------------------------------------
// 3. Clean Lingering Dev Processes on 4000 and 4200
// -----------------------------------------------------------------------------
function freePort(port) {
  try {
    if (process.platform === "win32") {
      const output = execSync("netstat -ano", { encoding: "utf8" });
      const lines = output.split("\n");
      const currentPid = process.pid.toString();
      const pids = new Set();

      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes("LISTENING")) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0" && pid !== currentPid) {
            pids.add(pid);
          }
        }
      }

      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
          console.log(`  Cleaned up stale process on port ${port} (PID ${pid})`);
        } catch {}
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: "ignore" });
    }
  } catch {}
}

// -----------------------------------------------------------------------------
// 4. Prerequisite Compilation
// -----------------------------------------------------------------------------
function ensurePrerequisites() {
  const sharedDist = join(ROOT, "packages", "shared", "dist", "index.js");
  const prismaClient = join(ROOT, "packages", "database", "generated", "client", "index.js");

  if (!existsSync(sharedDist)) {
    console.log("  Building packages/shared...");
    const res = spawnSync("node", ["tools/pnpm.mjs", "run", "build:shared"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      logError("Failed to build @mop/shared");
      return false;
    }
    logSuccess("Built @mop/shared");
  } else {
    logSuccess("@mop/shared build is present");
  }

  if (!existsSync(prismaClient)) {
    console.log("  Generating Prisma client...");
    const res = spawnSync("node", ["tools/pnpm.mjs", "db:generate"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      logError("Failed to generate Prisma client");
      return false;
    }
    logSuccess("Generated Prisma client");
  } else {
    logSuccess("Prisma client is generated and ready");
  }

  return true;
}

// -----------------------------------------------------------------------------
// 5. Browser Launch & URL Polling
// -----------------------------------------------------------------------------
function openBrowser(url) {
  if (noOpen) return;
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  exec(cmd, () => {});
}

function probeHttp(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        resolve(res.statusCode && res.statusCode < 500);
      });
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

function printDashboard() {
  console.log(`
${color.green}${color.bold}╔══════════════════════════════════════════════════════════════════════╗
║                     MOP PLATFORM IS READY TO USE                     ║
╚══════════════════════════════════════════════════════════════════════╝${color.reset}

  ${color.bold}Web Application:${color.reset}   ${color.cyan}http://localhost:4200${color.reset}
  ${color.bold}API Health:${color.reset}        ${color.cyan}http://localhost:4000/api/v1/health${color.reset}

  ${color.bold}Seeded Development Accounts:${color.reset}
  ┌───────────────────────┬─────────────────────────────┬────────────────────────┐
  │ Role                  │ Email                       │ Password               │
  ├───────────────────────┼─────────────────────────────┼────────────────────────┤
  │ Branch Manager        │ manager@apex-motors.local   │ ChangeMe-Manager-123   │
  │ Technician            │ tech@apex-motors.local      │ ChangeMe-Tech-123      │
  │ Tenant Owner          │ owner-demo@apex-motors.local│ ChangeMe-Owner-123     │
  │ Platform Admin        │ platform-admin@mop.local    │ ChangeMe-Platform-123  │
  └───────────────────────┴─────────────────────────────┴────────────────────────┘

  ${color.dim}Press Ctrl+C at any time in this window to stop the servers.${color.reset}
`);
}

// -----------------------------------------------------------------------------
// Main Orchestration
// -----------------------------------------------------------------------------
async function main() {
  printBanner();

  // Step 1: Config
  logStep(1, 4, "Checking environment & configuration...");
  ensureEnv();

  // Step 2: Database
  logStep(2, 4, "Ensuring PostgreSQL database is online...");
  const pgOk = await ensurePostgres();
  if (!pgOk) {
    process.exit(1);
  }

  // Step 3: Prerequisites
  logStep(3, 4, "Verifying build prerequisites & Prisma client...");
  const prereqOk = ensurePrerequisites();
  if (!prereqOk) {
    process.exit(1);
  }

  if (isCheckOnly) {
    console.log(`\n${color.green}${color.bold}✔ Pre-flight checks passed successfully.${color.reset}\n`);
    process.exit(0);
  }

  // Clear any existing listeners on 4000 and 4200 before starting
  freePort(4000);
  freePort(4200);

  // Step 4: Dev server launch
  logStep(4, 4, "Launching API (:4000) and Web (:4200) servers...\n");

  const child = spawn("node", ["tools/pnpm.mjs", "dev"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, PATH: process.env.PATH },
  });

  let webReady = false;
  let apiReady = false;
  let launchedBrowser = false;

  const pollInterval = setInterval(async () => {
    if (!apiReady) {
      apiReady = await probeHttp("http://localhost:4000/api/v1/health");
      if (apiReady) {
        logSuccess("NestJS API is healthy and listening on port 4000");
      }
    }

    if (!webReady) {
      webReady = await probeHttp("http://localhost:4200");
      if (webReady) {
        logSuccess("Angular Web Dev Server is ready on port 4200");
      }
    }

    if (webReady && !launchedBrowser) {
      launchedBrowser = true;
      clearInterval(pollInterval);
      printDashboard();
      console.log(`  ${color.green}🚀 Launching default browser to http://localhost:4200 ...${color.reset}\n`);
      openBrowser("http://localhost:4200");
    }
  }, 1500);

  // Stop polling if waiting too long (3 minutes)
  setTimeout(() => clearInterval(pollInterval), 180000);

  function cleanup() {
    clearInterval(pollInterval);
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  child.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  logError(`Fatal startup error: ${err.message}`);
  process.exit(1);
});

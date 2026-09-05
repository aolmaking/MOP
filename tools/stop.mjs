#!/usr/bin/env node
/**
 * MOP Platform - Unified Stop Utility
 *
 * Stops development servers on ports 4000 and 4200.
 * Optional `--with-db` flag to cleanly shut down PostgreSQL.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const stopDb = args.includes("--with-db");

console.log("\nStopping MOP Platform dev services...\n");

function findAndKillPort(port) {
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
          console.log(`  ✔ Stopped process on port ${port} (PID ${pid})`);
        } catch {}
      }

      if (pids.size === 0) {
        console.log(`  - No active process found on port ${port}`);
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: "ignore" });
      console.log(`  ✔ Cleaned up port ${port}`);
    }
  } catch (err) {
    console.log(`  - Note for port ${port}: ${err.message}`);
  }
}

// Stop Web & API
findAndKillPort(4000);
findAndKillPort(4200);

// Stop Database if requested
if (stopDb) {
  console.log("\nStopping PostgreSQL...");
  const pgCtl = "E:/mop-fleet/pg/pgsql/bin/pg_ctl.exe";
  const pgData = "E:/mop-fleet/pg/data";

  if (existsSync(pgCtl) && existsSync(pgData)) {
    try {
      spawnSync(pgCtl, ["-D", pgData, "-m", "fast", "stop"], { stdio: "inherit" });
      console.log("  ✔ PostgreSQL shut down cleanly");
    } catch (err) {
      console.error(`  ✖ Failed to stop PostgreSQL: ${err.message}`);
    }
  } else {
    try {
      spawnSync("docker", ["compose", "stop"], { stdio: "inherit" });
      console.log("  ✔ Stopped Docker PostgreSQL container");
    } catch {}
  }
}

console.log("\nDone.\n");

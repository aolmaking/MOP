#!/usr/bin/env node
/**
 * Runs a command with PORT pinned to a fixed value, overriding whatever
 * the parent process already set.
 *
 * apps/api's dev server must always bind the port apps/web's
 * proxy.conf.json is hardcoded to target (4000), regardless of what port
 * a dev-server launcher (e.g. a preview tool that sets PORT=4200 so the
 * browser opens the right tab for the *web* process) exports to the
 * whole `--parallel` process tree. `loadEnvironment()` reading
 * `process.env.PORT` is correct and load-bearing for production, where a
 * real host sets it dynamically -- this wrapper only pins the *local dev*
 * invocation, so that behavior is never touched.
 *
 * Usage: node tools/with-port.mjs 4000 nest start --watch
 */

import { spawnSync } from "node:child_process";

const [port, ...command] = process.argv.slice(2);
if (!port || command.length === 0) {
  console.error("usage: node tools/with-port.mjs <port> <command> [args...]");
  process.exit(64);
}

const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PORT: port },
});

process.exit(result.status ?? 1);

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const checks = [];

function read(file) {
  return readFileSync(resolve(root, file), "utf8");
}

function expect(name, pass) {
  checks.push({ name, pass });
}

const environment = read("apps/web/src/environments/environment.ts");
const angular = read("angular.json");
const proxy = read("apps/web/proxy.conf.json");
const apiMain = read("apps/api/src/main.ts");
const appModule = read("apps/api/src/app.module.ts");
const apiErrors = read("apps/web/src/app/core/api/api-errors.ts");
const sharedErrors = read("packages/shared/src/domain-contracts/api-error.contract.ts");

expect("web uses same-origin API prefix", environment.includes('apiBaseUrl: "/api/v1"'));
expect("Angular dev server has proxyConfig", angular.includes('"proxyConfig": "apps/web/proxy.conf.json"'));
expect("proxy forwards /api/v1 to Nest API port", proxy.includes('"/api/v1"') && proxy.includes('"target": "http://localhost:4000"'));
expect("API keeps global api/v1 prefix", apiMain.includes('app.setGlobalPrefix("api/v1")'));
expect("API defaults to port 4000", apiMain.includes('config.get("API_PORT") || 4000'));
expect("API accepts localhost and 127.0.0.1 web origins", apiMain.includes("http://localhost:4200,http://127.0.0.1:4200"));
expect("health module is registered", appModule.includes("HealthModule"));
expect("health endpoint files exist", ["health.controller.ts", "health.module.ts", "health.service.ts"].every((file) => existsSync(resolve(root, "apps/api/src/health", file))));
expect("frontend reports network failures clearly", apiErrors.includes("NETWORK_UNREACHABLE") && apiErrors.includes("BACKEND_UNAVAILABLE"));
expect("shared API error contract includes network codes", sharedErrors.includes('"NETWORK_UNREACHABLE"') && sharedErrors.includes('"BACKEND_UNAVAILABLE"'));

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`);
}

const failed = checks.filter((check) => !check.pass);
if (failed.length) {
  console.error(`NETWORK WIRING GATE: FAIL (${failed.length}/${checks.length} failed)`);
  process.exit(1);
}

console.log(`NETWORK WIRING GATE: PASS (${checks.length}/${checks.length})`);

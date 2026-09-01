/**
 * The staging smoke suite.
 *
 * Runs against a DEPLOYED origin over the network -- not against a
 * process this script started, and not against localhost. Every check
 * here is one that a passing unit suite cannot make: that TLS actually
 * terminates, that the built bundle is actually served, that the
 * scheduler is running on the deployed process, and that a session
 * cookie survives the proxy hop with the flags a production posture
 * demands.
 *
 * The cookie assertions are the reason this file exists. `cookie.util.ts`
 * sets `secure` from NODE_ENV, and a staging box misconfigured as
 * `development` would still pass every test in the repository while
 * quietly issuing session cookies that travel in clear text. Nothing
 * short of asking a real deployment for a real cookie catches that.
 *
 *   node tools/staging/smoke.mjs --origin https://192.168.1.19:8443 \
 *     --email platform-admin@mop.local --password ChangeMe-Platform-123
 *
 * `--insecure` accepts a self-signed certificate. It is required for the
 * interim LAN edge and must NOT be passed against a real deployment --
 * that is the difference between "TLS works" and "something answered".
 */
// A plain https request rather than global fetch: fetch has no way to
// accept a self-signed certificate, and the interim LAN edge has one.
// Kept small deliberately -- a smoke suite that needs its own
// dependency tree is a smoke suite that will rot.
import { request as httpsRequest } from "node:https";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const origin = arg("origin", "https://127.0.0.1:8443").replace(/\/$/, "");
const email = arg("email", "platform-admin@mop.local");
const password = arg("password", "ChangeMe-Platform-123");
const insecure = process.argv.includes("--insecure");

const results = [];

function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

function call(path, { method = "GET", body, cookie } = {}) {
  const url = new URL(origin + path);
  return new Promise((resolvePromise, reject) => {
    const req = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        rejectUnauthorized: !insecure,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            /* html and css are legitimate here */
          }
          resolvePromise({ status: res.statusCode, headers: res.headers, text, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log(`smoke: ${origin}${insecure ? "  (self-signed certificate accepted)" : ""}\n`);

  // 1. TLS terminates and the API answers from a real database.
  const health = await call("/api/v1/health");
  check("health answers over TLS", health.status === 200 && health.body?.status === "ok", `HTTP ${health.status}`);
  check("health reports a live database", health.body?.database === "connected", String(health.body?.database));

  // 2. The scheduler is running on the deployed process, not merely
  //    importable. A staging box whose cron never fires looks identical
  //    to a healthy one from every other angle.
  check(
    "the scheduler has reported a heartbeat",
    typeof health.body?.schedulerLastHeartbeatAt === "string",
    String(health.body?.schedulerLastHeartbeatAt),
  );

  // 3. Every response carries a correlation id, so "it failed around
  //    3pm" is a resolvable incident report.
  check("responses carry a request id", Boolean(health.headers["x-request-id"]), health.headers["x-request-id"]);

  // 4. The built web bundle is served, not a dev server.
  const index = await call("/");
  check("the built app is served", index.status === 200 && index.text.includes("<app-root"), `HTTP ${index.status}`);
  check("the edge sets HSTS", Boolean(index.headers["strict-transport-security"]), index.headers["strict-transport-security"]);

  // 5. A real login through the edge, and the cookie it hands back.
  const login = await call("/api/v1/auth/login", { method: "POST", body: { email, password } });
  check("a real account can sign in through the edge", login.status === 200, `HTTP ${login.status}`);

  const setCookie = [].concat(login.headers["set-cookie"] ?? []);
  const access = setCookie.find((c) => c.startsWith("mop_access="));
  check("a session cookie is issued", Boolean(access));
  // The whole reason for terminating TLS in this rehearsal: without
  // `Secure` the browser would keep sending this over plain HTTP.
  check("the session cookie is Secure", /;\s*Secure/i.test(access ?? ""), access?.split(";").slice(1).join(";").trim());
  check("the session cookie is HttpOnly", /;\s*HttpOnly/i.test(access ?? ""));

  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");

  // 6. An authenticated read, through the edge, with that cookie.
  const me = await call("/api/v1/auth/me", { cookie });
  check("the session survives the proxy hop", me.status === 200, `HTTP ${me.status}`);

  // 7. And the negative: no cookie means no data. A smoke suite that
  //    only ever checks the happy path cannot tell a working guard from
  //    an absent one.
  const anonymous = await call("/api/v1/auth/me");
  check("an anonymous request is refused", anonymous.status === 401, `HTTP ${anonymous.status}`);

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`smoke suite could not run: ${error.message}`);
  process.exit(2);
});

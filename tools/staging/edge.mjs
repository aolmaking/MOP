/**
 * The interim staging edge: one TLS listener in front of the built API
 * and the built web bundle.
 *
 * Why this exists rather than nginx or Caddy in a container. This
 * machine has no Docker and no administrator rights (board decision
 * D-002, blocker B-002), so the staging boot the launch plan asks for
 * (M-9) cannot be proven the intended way. What it CAN prove is the
 * half that actually decides whether the product is safe to put in
 * front of a person: TLS termination, a real https origin, and secure
 * session cookies surviving a proxy hop.
 *
 * That half is not optional theatre. `runtime/config/environment.ts`
 * refuses to start in production unless CORS_ORIGIN is https, precisely
 * because `cookie.util.ts` sets the `secure` flag from NODE_ENV -- run
 * the API in production behind plain HTTP and every session cookie is
 * dropped by the browser. So "interim LAN staging without TLS" is not a
 * weaker version of staging; it is a configuration the product is right
 * to refuse. Hence a real certificate, even a self-signed one.
 *
 * Not production. There is no process supervisor, no certificate
 * authority, no rate limiting at the edge, and the certificate will
 * make every browser warn. It is a LAN dress rehearsal, and the run
 * record says so in the same words.
 *
 * Usage:
 *   node tools/staging/edge.mjs --port 8443 --api http://127.0.0.1:4100 \
 *     --web apps/web/dist/web/browser --cert <dir>
 */
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const port = Number(arg("port", "8443"));
const apiOrigin = new URL(arg("api", "http://127.0.0.1:4100"));
const webRoot = resolve(arg("web", "apps/web/dist/web/browser"));
const certDir = resolve(arg("cert", "tools/staging/certs"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
};

/**
 * Everything under /api/v1 goes to the API untouched -- including the
 * Set-Cookie headers, which is the entire point of putting a real TLS
 * edge in front rather than testing the API directly.
 */
function proxyToApi(req, res) {
  const upstream = httpRequest(
    {
      hostname: apiOrigin.hostname,
      port: apiOrigin.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: apiOrigin.host,
        // So the API knows the browser spoke https, the way any real
        // reverse proxy would tell it.
        "x-forwarded-proto": "https",
        "x-forwarded-host": req.headers.host ?? "",
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "upstream_unavailable", message: error.message }));
  });

  req.pipe(upstream);
}

/**
 * The Angular bundle. Unknown paths fall back to index.html because the
 * router owns them -- but only after the traversal check, so a request
 * for `/../../.env` is refused rather than served.
 */
function serveWeb(req, res) {
  const requested = decodeURIComponent(new URL(req.url, "https://placeholder").pathname);
  const candidate = resolve(join(webRoot, normalize(requested)));

  const inside = candidate === webRoot || candidate.startsWith(webRoot + sep);
  const file = inside && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(webRoot, "index.html");

  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    // The edge is where a real deployment sets these; asserting them in
    // the smoke suite is how we find out they were dropped.
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
  });
  createReadStream(file).pipe(res);
}

const server = createServer(
  {
    key: readFileSync(join(certDir, "staging-key.pem")),
    cert: readFileSync(join(certDir, "staging-cert.pem")),
  },
  (req, res) => (req.url?.startsWith("/api/") ? proxyToApi(req, res) : serveWeb(req, res)),
);

server.listen(port, "0.0.0.0", () => {
  console.log(`staging edge listening on https://0.0.0.0:${port} -> api ${apiOrigin.origin}, web ${webRoot}`);
});

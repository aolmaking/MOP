# Interim LAN staging

What this is, and — more importantly — what it is not.

`docs/14-DAY-LAUNCH-SCOPE.md` M-9 asks for Dockerfiles, a TLS reverse
proxy, a staging VPS and a green smoke suite against it. This machine has
no Docker and no administrator rights (board decision D-002, blocker
B-002), so the VPS half cannot be built here at all. This is the half
that can: a real TLS edge, in front of a real production-mode API, on the
LAN, with a smoke suite that runs across the network rather than against
a process it started itself.

## Why TLS is not optional, even for a rehearsal

`apps/api/src/runtime/config/environment.ts` refuses to start in
production unless `CORS_ORIGIN` is `https://`. That refusal is deliberate
and load-bearing: `cookie.util.ts` sets the session cookie's `Secure`
flag from `NODE_ENV`, so an API running in production behind plain HTTP
issues cookies the browser will then decline to send. "Interim staging
without TLS" is therefore not a weaker rehearsal — it is a configuration
the product is right to reject. Hence a certificate, self-signed or not.

## Running it

```bash
# 1. A certificate. Not committed -- a private key in a repository is a
#    private key that has leaked, self-signed or otherwise.
openssl req -x509 -newkey rsa:2048 -nodes -days 90 \
  -keyout tools/staging/certs/staging-key.pem \
  -out   tools/staging/certs/staging-cert.pem \
  -subj "/CN=mop-staging.local" \
  -addext "subjectAltName=DNS:mop-staging.local,DNS:localhost,IP:<your-lan-ip>,IP:127.0.0.1"

# 2. Its own database, migrated and seeded. Never the dev one: a staging
#    box sharing a database with development is not a staging box.
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_staging?schema=public"
corepack pnpm db:deploy && corepack pnpm db:seed

# 3. The built API, in production mode, on a high port.
corepack pnpm build
NODE_ENV=production PORT=4100 CORS_ORIGIN="https://<your-lan-ip>:8443" \
  node apps/api/dist/main.js

# 4. The edge: TLS in, API and the built bundle out.
node tools/staging/edge.mjs --port 8443 --api http://127.0.0.1:4100 \
  --web apps/web/dist/web/browser --cert tools/staging/certs

# 5. The smoke suite, across the network.
node tools/staging/smoke.mjs --origin https://<your-lan-ip>:8443 --insecure
```

`--insecure` accepts the self-signed certificate. Against a real
deployment it must be omitted: with it, "TLS works" and "something
answered" are the same result.

## What a green run proves

TLS terminates · the API answers from a live database · the scheduler is
actually running on the deployed process · every response carries a
correlation id · the built bundle is served (not a dev server) · a real
account can sign in through the edge · the session cookie comes back
`Secure; HttpOnly; SameSite=Lax` · the session survives the proxy hop ·
an anonymous request is refused.

## Backups and the restore drill (M-10)

```bash
tools/staging/backup.sh mop_platform_dev /e/mop-fleet/backups
tools/staging/restore-drill.sh <the-dump-it-printed> mop_restore_drill
```

`backup.sh` writes one dated custom-format dump with a `.sha256` beside
it, and refuses to call anything under 1 KB a backup. `restore-drill.sh`
verifies the checksum, rebuilds the dump into a throwaway database with
`--exit-on-error`, and then checks the restored copy holds a real
workshop — tables, tenants, accounts and migration history. Schema alone
is not a restore: a dump that rebuilt 78 empty tables would satisfy every
other check.

Executed 2026-09-02: **78 tables, 2 tenants, 16 accounts, 20 work orders,
31 migrations, restored in 2 seconds.**

All three refusals were watched rather than assumed: a truncated dump
fails the checksum and exits 1; a backup of an empty database is refused
at 837 bytes; a schema-only dump restores cleanly and is still failed for
having no tenants, no accounts and no migration history.

What is still missing is scheduling and somewhere to put them: no cron,
no rotation, no encryption, no offsite copy. Those need a host.

## What it does not prove

No VPS, no public DNS, no certificate authority, no process supervisor,
no automated redeploy, no offsite or scheduled backups, no edge rate
limiting. A browser will refuse the self-signed certificate outright, so
the journey cannot be walked by hand here — the smoke suite is the
evidence. M-9 stays open on B-002 until there is a host to deploy to;
M-10's drill is done, its scheduling is not.

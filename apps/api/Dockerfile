# MOP API (NestJS), built from the pnpm workspace root.
#
# Build from the REPO ROOT, not this directory -- the workspace's other
# packages (packages/shared, packages/database) are dependencies of this
# build and Docker's build context has to include them:
#
#   docker build -f apps/api/Dockerfile -t mop-api .
#
# M-9 (docs/STRATEGY_B_EXECUTION_LEDGER.md): this is the buildable half of
# "deployment" -- a real image that starts and serves traffic. Provisioning
# where it actually RUNS (a staging host, TLS, a real DATABASE_URL) is not
# something this repository can do for itself; that is the still-open half
# of M-9, recorded honestly in the ledger rather than faked here.
#
# CAVEAT recorded honestly, per CLAUDE.md's "report honestly" rule: this
# Dockerfile was written and reasoned through carefully but NOT build-
# verified -- the environment this was authored in has no Docker daemon
# reachable (`docker` is not on PATH and the usual Docker Desktop install
# path does not exist on this machine). The first real `docker build`
# against it should be treated as the actual test, not a formality.
#
# Uses `pnpm deploy` deliberately rather than hand-copying node_modules
# between stages: pnpm's default node_modules layout is symlinked into a
# shared content-addressed store, and naively COPYing only some of the
# workspace's node_modules directories across a multi-stage build is a
# well-known way to end up with dangling symlinks that resolve on the
# builder's filesystem and not the runtime image's. `pnpm deploy`
# materializes a real, self-contained node_modules for exactly one
# package's dependency graph -- no symlinks crossing the copy boundary.

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json

RUN CI=true pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/api apps/api

# Order matters: shared before database before api, matching each
# package's own dependency on the one before it. Prisma's generated
# client (packages/database/generated) is gitignored -- every
# environment, including this build, produces its own from the schema.
RUN pnpm --filter @mop/shared run build
RUN pnpm --filter @mop/database run generate
RUN pnpm --filter @mop/api run build

# Materializes a self-contained /out with @mop/api's full runtime
# dependency graph (including the built @mop/shared and @mop/database,
# and the generated Prisma client) as real files, production-only.
RUN pnpm --filter @mop/api deploy --prod /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./

# Real credentials and PORT are supplied by the deploy environment, per
# environment.ts's own note: a misconfiguration here must be a startup
# crash, not a silent security downgrade, so nothing is defaulted in the
# image itself.
EXPOSE 4000
CMD ["node", "dist/main.js"]

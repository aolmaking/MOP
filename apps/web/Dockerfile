# MOP web (Angular), built from the pnpm workspace root.
#
# Build from the REPO ROOT:
#
#   docker build -f apps/web/Dockerfile -t mop-web .
#
# M-9 (docs/STRATEGY_B_EXECUTION_LEDGER.md) -- see apps/api/Dockerfile's
# own header for the full note on scope and the honest caveat that
# neither Dockerfile has been build-verified in this environment (no
# reachable Docker daemon here). Treat the first real `docker build` as
# the actual test.
#
# `@mop/shared` is this app's only workspace dependency, and Angular's
# build bundles it into the static output -- there is nothing left to run
# at request time, so this needs no `pnpm deploy` step, just nginx
# serving whatever `ng build` produced.

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
COPY apps/web apps/web

RUN pnpm --filter @mop/shared run build
RUN pnpm --filter @mop/web run build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80

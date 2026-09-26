# syntax=docker/dockerfile:1
# The BCP analyzer: one image with the API and the built web app.
# Build: docker build --platform linux/amd64 -t bcp-analyzer .

FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
# Manifests first, so dependency layers are cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @bcp/web build

FROM node:24-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# Only what the API needs at run time (tsx runs its TypeScript directly).
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @bcp/api... \
  && chown -R node:node /app
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/tsconfig.json apps/api/
COPY --from=build /repo/apps/web/dist /app/web

ENV HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIST_DIR=/app/web
USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/main.ts"]

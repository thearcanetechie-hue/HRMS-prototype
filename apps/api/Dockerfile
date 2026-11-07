# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @hrms/shared build && pnpm --filter @hrms/api build
RUN pnpm --filter @hrms/api deploy --legacy --prod /out \
  && cd /out && node_modules/.bin/prisma generate

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Uploaded documents (encrypted) live here; mount a volume so they survive restarts.
RUN mkdir -p /data/documents && chown node:node /data/documents
ENV STORAGE_DIR=/data/documents
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. Safe to run on every boot.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]

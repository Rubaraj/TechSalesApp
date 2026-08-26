# Multi-stage Node 20 build for techsales-api.
#
#   docker build -t techsales-api .
#   docker run --rm -p 4000:4000 --env-file .env techsales-api
#
# The image contains NO configuration — pass it in with --env-file or -e.
# See .env.example for the full variable list.

# ---- stage 1: install + compile -------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- stage 2: runtime ------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist

# Bootstrap seed. src/utils/bootstrap.ts copies data/sample/* into
# data/{runtime,lookup}/ on first boot, so those dirs must exist and be
# writable. Mount a volume over /app/data to persist the JSON store.
COPY data/sample ./data/sample
COPY data/formulary-synthetic.json ./data/formulary-synthetic.json
RUN mkdir -p data/runtime data/lookup

EXPOSE 4000
CMD ["node", "dist/index.js"]

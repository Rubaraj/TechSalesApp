# Multi-stage Node 20 build for the Medicare Hub backend.
# stage 1 — install + compile
FROM node:20-alpine AS build
WORKDIR /app

# Copy the shared package first so npm can resolve the file: dep.
COPY shared/package.json ./shared/package.json
COPY shared/tsconfig.json ./shared/tsconfig.json
COPY shared/src ./shared/src

COPY server/package.json server/package-lock.json* ./server/
WORKDIR /app/server
RUN npm install --include=dev

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# stage 2 — runtime
FROM node:20-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production

COPY --from=build /app/shared /app/shared
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/server/dist ./dist
COPY server/data/sample ./data/sample

EXPOSE 4000
CMD ["node", "dist/index.js"]

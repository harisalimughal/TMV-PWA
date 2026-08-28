# ---- backend build ----
FROM node:22-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
# npm ci, not npm install: the lockfile is present and builds must be reproducible.
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build
RUN npm prune --omit=dev

# ---- web build ----
FROM node:22-slim AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build

# ---- runtime ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=web-build /app/web/dist ./web/dist
COPY backend/package.json ./
# Drop root.
USER node
EXPOSE 8080
# --enable-source-maps makes stack traces point at .ts lines.
CMD ["node", "--enable-source-maps", "dist/server.js"]

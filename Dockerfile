# node:24-slim for the BUILD stages only, not 22: the committed lockfiles were generated
# under npm 11 (Node 24's bundled npm). npm 10 (Node 22's bundled npm) resolves some
# transitive deps (e.g. picomatch, pulled at two different versions by different
# dependents) differently and rejects the lockfile as out of sync under `npm ci`.
# The runtime stage below deliberately stays on node:22-slim -- Node 24's OpenSSL 3.5
# fails the TLS handshake against MongoDB Atlas from inside this container ("tlsv1
# alert internal error" on every connection attempt); 22's OpenSSL doesn't have the
# problem. None of the runtime deps (mongodb driver's default pure-JS bson, bcryptjs,
# express, googleapis) have native bindings, so copying node_modules built under 24
# into a 22 runtime is safe.
# ---- backend build ----
FROM node:24-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
# npm ci, not npm install: the lockfile is present and builds must be reproducible.
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build
RUN npm prune --omit=dev

# ---- web build ----
FROM node:24-slim AS web-build
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

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/migrations ./migrations
RUN npm run build

FROM node:22-alpine AS runtime
RUN addgroup -S glucocare && adduser -S glucocare -G glucocare
WORKDIR /app
COPY --from=dependencies --chown=glucocare:glucocare /app/node_modules ./node_modules
COPY --from=build --chown=glucocare:glucocare /app/dist ./dist
COPY --from=build --chown=glucocare:glucocare /app/migrations ./migrations
COPY --from=build --chown=glucocare:glucocare /app/package.json ./package.json
USER glucocare
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "dist/server.js"]

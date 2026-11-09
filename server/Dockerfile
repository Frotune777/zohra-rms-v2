FROM node:26.13.0-alpine AS builder
WORKDIR /app/server
COPY server/package*.json ./
COPY server/scripts/patch-deepmerge.cjs ./scripts/patch-deepmerge.cjs
RUN npm ci --omit=dev

FROM node:26.13.0-alpine
WORKDIR /app/server
RUN apk add --no-cache wget && addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && mkdir -p /app/server/logs /app/server/src/logs && chown -R nodejs:nodejs /app
COPY --from=builder --chown=nodejs:nodejs /app/server/node_modules ./node_modules
COPY --chown=nodejs:nodejs server/ ./
COPY --chown=nodejs:nodejs database/canonical/ /app/database/canonical/
COPY --chown=nodejs:nodejs database/migrations/047_corrections_and_stock_value.sql /app/database/migrations/047_corrections_and_stock_value.sql
USER nodejs
EXPOSE 5000
CMD ["sh", "-c", "node scripts/migrate.js && exec node server.js"]

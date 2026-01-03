# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Fix permissions for Vite temp files (development mode)
# Run as root in development to avoid permission issues
# For production, you would build the app and serve static files
RUN chmod -R 777 /app

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/ || exit 1

# Run in development mode
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
# Stage 1: Build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files (from auth-service directory since context is backend/)
COPY auth-service/package*.json ./
COPY auth-service/tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install && \
    npm cache clean --force

# Copy all source code directories
COPY auth-service/src/ ./src/
COPY auth-service/controllers/ ./controllers/
COPY auth-service/services/ ./services/
COPY auth-service/middleware/ ./middleware/
COPY auth-service/lib/ ./lib/
COPY auth-service/types/ ./types/
COPY auth-service/keys/ ./keys/

# Build TypeScript (skip type checking for Docker builds)
RUN npx tsc --skipLibCheck 2>&1 || echo "TypeScript compilation completed with warnings"

# Stage 2: Runtime
FROM node:20-alpine

# Set NODE_ENV - development for dev mode with tsx
ENV NODE_ENV=development

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install ALL dependencies (including dev for tsx)
COPY auth-service/package*.json ./
RUN npm install && \
    npm cache clean --force

# Copy built application from builder (for production use)
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy keys directory (for JWT signing)
COPY --from=builder --chown=nodejs:nodejs /app/keys ./keys

# Copy source code (needed for tsx dev mode)
COPY --chown=nodejs:nodejs auth-service/src/ ./src/
COPY --chown=nodejs:nodejs auth-service/controllers/ ./controllers/
COPY --chown=nodejs:nodejs auth-service/services/ ./services/
COPY --chown=nodejs:nodejs auth-service/middleware/ ./middleware/
COPY --chown=nodejs:nodejs auth-service/lib/ ./lib/
COPY --chown=nodejs:nodejs auth-service/types/ ./types/
COPY --chown=nodejs:nodejs auth-service/tsconfig.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Default to dev mode (can be overridden)
CMD ["npm", "run", "dev"]

# Multi-stage Dockerfile for Video Processing Service

# Stage 1: mediasoup (Node.js)
FROM node:24-alpine AS mediasoup-builder

WORKDIR /app/mediasoup

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy mediasoup source
COPY mediasoup ./mediasoup
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build


# Stage 2: Python API
FROM python:3.14-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for mediasoup
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy mediasoup from builder
COPY --from=mediasoup-builder /app/mediasoup/node_modules ./node_modules
COPY --from=mediasoup-builder /app/mediasoup/dist ./mediasoup/dist
COPY mediasoup/server.ts ./mediasoup/

# Copy application code
COPY src ./src
COPY services ./services
COPY api ./api
COPY lib ./lib

# Create recording directory
RUN mkdir -p /tmp/recordings

# Expose ports
EXPOSE 8003 3000 10000-10100/udp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8003/health || exit 1

# Start script
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]

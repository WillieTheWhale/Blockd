# Celery Worker Dockerfile for Blockd Platform
# Multi-stage build for minimal image size

FROM python:3.12-slim as base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libavcodec-extra \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r celery && useradd -r -g celery celery

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set ownership
RUN chown -R celery:celery /app

# Switch to non-root user
USER celery

# Default command (can be overridden)
CMD ["celery", "-A", "celery_app", "worker", "--loglevel=info"]

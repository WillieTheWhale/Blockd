# Stage 1: Build
FROM python:3.14.0-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Production
FROM python:3.14.0-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/home/appuser/.local/bin:$PATH

# Install FFmpeg and runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libavfilter-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1001 -s /bin/bash appuser

# Set working directory
WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local

# Copy application code
COPY --chown=appuser:appuser src/ ./src/

# Create directories for video storage
RUN mkdir -p /app/recordings /app/temp && \
    chown -R appuser:appuser /app/recordings /app/temp

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/health').read()" || exit 1

# Start application
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8003"]

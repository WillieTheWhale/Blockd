# Video Processing Service Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root user
RUN useradd -m -u 1001 -s /bin/bash appuser

# Copy application code - all directories needed for imports
COPY --chown=appuser:appuser src ./src
COPY --chown=appuser:appuser api ./api
COPY --chown=appuser:appuser lib ./lib
COPY --chown=appuser:appuser services ./services

# Create recordings directory
RUN mkdir -p /tmp/recordings && chown appuser:appuser /tmp/recordings

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/health').read()" || exit 1

# Start application
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8003"]

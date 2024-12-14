# Stage 1: Builder
FROM python:3.11-slim AS builder

# Set build environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.5.1 \
    POETRY_HOME=/opt/poetry \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1

# Install system dependencies and security updates
RUN apt-get update && apt-get upgrade -y \
    && apt-get install --no-install-recommends -y \
        build-essential \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/* \
    # Install poetry
    && curl -sSL https://install.python-poetry.org | python - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry

# Set working directory
WORKDIR /build

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Install production dependencies only
RUN poetry install --no-dev --no-root

# Copy source code
COPY . .

# Build the application
RUN poetry build

# Stage 2: Runtime
FROM python:3.11-slim

# Set runtime environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.local/bin:$PATH" \
    PYTHONPATH="/app:$PYTHONPATH"

# Install runtime dependencies and create non-root user
RUN apt-get update && apt-get upgrade -y \
    && apt-get install --no-install-recommends -y \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1000 app \
    && useradd -u 1000 -g app -s /bin/bash -m app \
    && mkdir -p /app/data /app/logs \
    && chown -R app:app /app

# Set working directory
WORKDIR /app

# Copy built package from builder stage
COPY --from=builder /build/dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm /tmp/*.whl

# Copy necessary runtime files
COPY --chown=app:app docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Set up volumes
VOLUME ["/app/data", "/app/logs"]

# Expose application port
EXPOSE 8000

# Set resource limits
LABEL com.docker.container.cpu="2" \
      com.docker.container.memory="2g"

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Switch to non-root user
USER app:app

# Set entry point
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "web_scraping_platform.api.server:app", "--host", "0.0.0.0", "--port", "8000"]

# Add metadata labels
LABEL maintainer="Web Scraping Platform Team" \
      version="1.0.0" \
      description="Enterprise-grade web scraping platform backend service" \
      org.opencontainers.image.source="https://github.com/org/web-scraping-platform" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.created="2024-01-20"
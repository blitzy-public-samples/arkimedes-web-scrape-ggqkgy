# Stage 1: Builder stage for configuration validation and preparation
FROM prom/prometheus:v2.44.0 as builder

# Set build arguments and environment variables
ARG PROMETHEUS_USER=nobody
ARG RETENTION_TIME=30d
ARG RETENTION_SIZE=50GB
ARG STORAGE_PATH=/prometheus

# Create necessary directories with proper permissions
RUN mkdir -p /etc/prometheus && \
    mkdir -p /prometheus && \
    mkdir -p /usr/share/prometheus/console_libraries && \
    mkdir -p /usr/share/prometheus/consoles

# Copy and validate Prometheus configuration
COPY prometheus/values.yaml /tmp/values.yaml
RUN promtool check config /tmp/values.yaml

# Set up proper file ownership and permissions
RUN chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} /etc/prometheus && \
    chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} /prometheus && \
    chmod -R 750 /etc/prometheus && \
    chmod -R 750 /prometheus

# Stage 2: Final production image with security hardening
FROM prom/prometheus:v2.44.0

# Set maintainer label
LABEL maintainer="DevOps Team <devops@scraping-platform.com>"
LABEL version="2.44.0"
LABEL description="Enterprise Prometheus for Web Scraping Platform"

# Set environment variables
ENV PROMETHEUS_USER=nobody
ENV RETENTION_TIME=30d
ENV RETENTION_SIZE=50GB
ENV STORAGE_PATH=/prometheus

# Create necessary directories
RUN mkdir -p /etc/prometheus && \
    mkdir -p /prometheus && \
    mkdir -p /usr/share/prometheus/console_libraries && \
    mkdir -p /usr/share/prometheus/consoles

# Copy configuration from builder stage
COPY --from=builder /etc/prometheus /etc/prometheus
COPY --from=builder /usr/share/prometheus/console_libraries /usr/share/prometheus/console_libraries
COPY --from=builder /usr/share/prometheus/consoles /usr/share/prometheus/consoles

# Set up security context and permissions
RUN chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} /etc/prometheus && \
    chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} /prometheus && \
    chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} /usr/share/prometheus && \
    chmod -R 750 /etc/prometheus && \
    chmod -R 750 /prometheus && \
    chmod -R 750 /usr/share/prometheus

# Configure storage volume
VOLUME [ "/prometheus" ]

# Expose Prometheus web interface port
EXPOSE 9090

# Set up healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --spider -S http://localhost:9090/-/healthy || exit 1

# Switch to non-root user
USER ${PROMETHEUS_USER}

# Set entrypoint with optimized configuration
ENTRYPOINT [ "/bin/prometheus" ]
CMD [ \
    "--config.file=/etc/prometheus/prometheus.yml", \
    "--storage.tsdb.path=/prometheus", \
    "--storage.tsdb.retention.time=30d", \
    "--storage.tsdb.retention.size=50GB", \
    "--web.console.libraries=/usr/share/prometheus/console_libraries", \
    "--web.console.templates=/usr/share/prometheus/consoles", \
    "--web.enable-lifecycle", \
    "--storage.tsdb.wal-compression", \
    "--web.enable-admin-api=false", \
    "--storage.tsdb.allow-overlapping-blocks", \
    "--web.external-url=https://prometheus.scraping-platform.com" \
]
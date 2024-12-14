# Base image selection for security and stability
FROM docker.elastic.co/kibana/kibana:8.0.0

# Container metadata for maintenance and tracking
LABEL maintainer="Web Scraping Platform Team" \
      version="8.0.0" \
      description="Enterprise Kibana for Web Scraping Platform logging" \
      security.features="xpack,encryption,authentication" \
      monitoring.features="health-check,performance-metrics"

# Environment configuration for security, performance, and monitoring
ENV NODE_OPTIONS="--max-old-space-size=1800" \
    ELASTICSEARCH_HOSTS="http://elasticsearch:9200" \
    ELASTICSEARCH_REQUESTTIMEOUT="30000" \
    XPACK_SECURITY_ENABLED="true" \
    XPACK_MONITORING_ENABLED="true" \
    XPACK_REPORTING_ENABLED="true" \
    XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY="${ENCRYPTION_KEY}" \
    LOGGING_VERBOSE="true" \
    TELEMETRY_ENABLED="false"

# Temporary root access for system configurations
USER root

# Secure directory setup with proper permissions
RUN mkdir -p /usr/share/kibana/data && \
    mkdir -p /usr/share/kibana/logs && \
    chown -R kibana:kibana /usr/share/kibana && \
    chmod 755 /usr/share/kibana/data && \
    chmod 755 /usr/share/kibana/logs

# Return to non-privileged user for security
USER kibana

# Persistent storage configuration
VOLUME ["/usr/share/kibana/data", "/usr/share/kibana/logs"]

# Kibana web interface port exposure
EXPOSE 5601

# Container health monitoring configuration
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --retries=3 \
            --start-period=60s \
            CMD curl -f http://localhost:5601/api/status || exit 1
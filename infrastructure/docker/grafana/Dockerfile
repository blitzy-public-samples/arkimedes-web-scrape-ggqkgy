# Start from official Grafana base image
FROM grafana/grafana:9.5.0

# Build arguments
ARG GRAFANA_VERSION=9.5.0
ARG GRAFANA_USER=grafana
ARG GRAFANA_GROUP=grafana

# Labels for container metadata and compliance
LABEL maintainer="Web Scraping Platform Team" \
      version="1.0.0" \
      description="Production-grade Grafana image for Web Scraping Platform monitoring" \
      security.protocol="TLS1.3" \
      backup.required="true" \
      compliance.gdpr="compliant"

# Environment variables for Grafana configuration
ENV GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD} \
    GF_INSTALL_PLUGINS="grafana-piechart-panel,grafana-worldmap-panel,grafana-clock-panel,grafana-polystat-panel" \
    GF_SECURITY_ALLOW_EMBEDDING=false \
    GF_AUTH_ANONYMOUS_ENABLED=false \
    GF_SECURITY_DISABLE_GRAVATAR=true \
    GF_SECURITY_COOKIE_SECURE=true \
    GF_USERS_ALLOW_SIGN_UP=false \
    GF_ANALYTICS_REPORTING_ENABLED=false

# Switch to root for installation tasks
USER root

# Install required dependencies and plugins
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/* \
    # Install Grafana plugins with version pinning and verification
    && grafana-cli --pluginsDir "/var/lib/grafana/plugins" plugins install ${GF_INSTALL_PLUGINS} \
    # Set up directories and permissions
    && mkdir -p /etc/grafana/provisioning/dashboards \
    && mkdir -p /etc/grafana/provisioning/datasources \
    && mkdir -p /etc/grafana/provisioning/alerting \
    && mkdir -p /etc/grafana/certs \
    && chown -R ${GRAFANA_USER}:${GRAFANA_GROUP} /etc/grafana /var/lib/grafana \
    && chmod -R 755 /etc/grafana \
    # Enable audit logging
    && touch /var/log/grafana/audit.log \
    && chown ${GRAFANA_USER}:${GRAFANA_GROUP} /var/log/grafana/audit.log

# Copy configuration files
WORKDIR /etc/grafana

# Copy dashboard configurations
COPY --chown=${GRAFANA_USER}:${GRAFANA_GROUP} dashboards/ /etc/grafana/provisioning/dashboards/
COPY --chown=${GRAFANA_USER}:${GRAFANA_GROUP} datasources/ /etc/grafana/provisioning/datasources/
COPY --chown=${GRAFANA_USER}:${GRAFANA_GROUP} alerting/ /etc/grafana/provisioning/alerting/

# Copy custom Grafana configuration
COPY --chown=${GRAFANA_USER}:${GRAFANA_GROUP} grafana.ini /etc/grafana/grafana.ini

# Validate configurations
RUN grafana-cli data-migration validate-config /etc/grafana/grafana.ini

# Expose Grafana port
EXPOSE 3000

# Define volumes for persistence
VOLUME ["/var/lib/grafana", "/etc/grafana/provisioning", "/etc/grafana/certs"]

# Switch back to grafana user for security
USER ${GRAFANA_USER}

# Health check configuration
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Default command
CMD ["grafana-server", \
     "--config=/etc/grafana/grafana.ini", \
     "--homepath=/usr/share/grafana", \
     "--packaging=docker"]
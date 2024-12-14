# syntax=docker/dockerfile:1.4

# Builder stage
FROM debian:bullseye-slim AS builder

# Build-time environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    FLUENTD_VERSION=1.16 \
    BUILD_PACKAGES="gcc make g++ libc-dev ruby-dev" \
    RUNTIME_PACKAGES="ruby curl ca-certificates"

# Install build dependencies and Fluentd
RUN apt-get update && \
    apt-get install -y --no-install-recommends ${BUILD_PACKAGES} ${RUNTIME_PACKAGES} && \
    # Install Fluentd and plugins with version pinning
    gem install --no-document \
        fluentd:${FLUENTD_VERSION} \
        fluent-plugin-elasticsearch:5.2.4 \
        fluent-plugin-prometheus:2.0.3 \
        fluent-plugin-record-modifier:2.1.1 \
        fluent-plugin-rewrite-tag-filter:2.4.0 \
        fluent-plugin-kubernetes_metadata_filter:3.2.0 \
        fluent-plugin-systemd:1.0.5 \
        fluent-plugin-concat:2.5.0 \
        fluent-plugin-grok-parser:2.6.2 \
        fluent-plugin-multi-format-parser:1.0.0 && \
    # Verify plugin installations
    gem list | grep fluent && \
    # Cleanup
    apt-get purge -y ${BUILD_PACKAGES} && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* \
           /tmp/* \
           /var/tmp/* \
           /usr/lib/ruby/gems/*/cache/*.gem

# Final stage
FROM fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch7-1

# Set maintainer label
LABEL maintainer="DevOps Team <devops@company.com>"

# Environment variables
ENV TZ=UTC \
    FLUENTD_CONF=fluent.conf \
    FLUENT_ELASTICSEARCH_HOST=elasticsearch-master \
    FLUENT_ELASTICSEARCH_PORT=9200 \
    FLUENT_ELASTICSEARCH_SCHEME=https \
    FLUENT_ELASTICSEARCH_SSL_VERSION=TLSv1_2 \
    FLUENT_ELASTICSEARCH_SSL_VERIFY=true \
    FLUENT_ELASTICSEARCH_BUFFER_CHUNK_LIMIT_SIZE=8M \
    FLUENT_ELASTICSEARCH_BUFFER_QUEUE_LIMIT_LENGTH=32

# Copy gems from builder stage
COPY --from=builder /usr/local/bundle/ /usr/local/bundle/

# System configuration
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        tzdata \
        ca-certificates && \
    # Configure timezone
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone && \
    # Create non-root user
    groupadd -r -g 2000 fluent && \
    useradd -r -u 2000 -g fluent fluent && \
    # Create directories with proper permissions
    mkdir -p /fluentd/log \
             /fluentd/etc \
             /fluentd/buffer \
             /var/log && \
    chown -R fluent:fluent /fluentd && \
    chmod -R 755 /fluentd && \
    # Security hardening
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* \
           /tmp/* \
           /var/tmp/* && \
    # Set system limits
    echo "fluent soft nofile 65536" >> /etc/security/limits.conf && \
    echo "fluent hard nofile 65536" >> /etc/security/limits.conf

# Expose ports
EXPOSE 24224/tcp
EXPOSE 24231/tcp

# Volume configuration
VOLUME ["/fluentd/log", "/fluentd/etc", "/var/log", "/fluentd/buffer"]

# Switch to non-root user
USER fluent

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=60s \
    CMD curl --fail http://localhost:24231/metrics || exit 1

# Resource limits (documented for Kubernetes)
# requests:
#   memory: "512Mi"
#   cpu: "250m"
# limits:
#   memory: "1Gi"
#   cpu: "1000m"

# Entrypoint and command are inherited from the base image
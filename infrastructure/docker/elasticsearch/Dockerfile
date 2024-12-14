# Base image with enterprise features
FROM docker.elastic.co/elasticsearch/elasticsearch:8.0.0

# Image metadata
LABEL maintainer="Web Scraping Platform Team" \
      version="8.0.0" \
      description="Production-ready Elasticsearch for enterprise logging" \
      security.features="enabled" \
      monitoring.features="enabled"

# Configure Elasticsearch environment variables
ENV ES_JAVA_OPTS="-Xms2g -Xmx2g" \
    discovery.type="single-node" \
    bootstrap.memory_lock="true" \
    xpack.security.enabled="true" \
    xpack.monitoring.enabled="true" \
    xpack.watcher.enabled="true" \
    xpack.ml.enabled="false" \
    cluster.name="webscraping-logs" \
    network.host="0.0.0.0"

# Switch to root for system configurations
USER root

# System optimization and security hardening
RUN sysctl -w vm.max_map_count=262144 && \
    mkdir -p /usr/share/elasticsearch/data /usr/share/elasticsearch/logs && \
    chown -R elasticsearch:elasticsearch /usr/share/elasticsearch && \
    chmod 0750 /usr/share/elasticsearch/data /usr/share/elasticsearch/logs

# Switch back to elasticsearch user for security
USER elasticsearch

# Define persistent storage volumes
VOLUME ["/usr/share/elasticsearch/data", "/usr/share/elasticsearch/logs"]

# Expose HTTP and transport ports
EXPOSE 9200 9300

# Container health monitoring
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --retries=3 \
            --start-period=60s \
            CMD curl -f http://localhost:9200/_cluster/health || exit 1
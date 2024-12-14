#!/usr/bin/env bash

# Deploy Logging Stack Script
# Version: 1.0.0
# Purpose: Production-grade ELK stack deployment with comprehensive validation
# Dependencies:
# - kubectl v1.27+
# - helm v3.0+

set -euo pipefail

# Global Variables
readonly NAMESPACE="logging"
readonly ELASTICSEARCH_VERSION="8.0"
readonly KIBANA_VERSION="8.0"
readonly FLUENTD_VERSION="1.16"
readonly LOG_RETENTION_DAYS="30"
readonly BACKUP_RETENTION_DAYS="90"
readonly MIN_MASTER_NODES="3"
readonly HEALTH_CHECK_TIMEOUT="300"
readonly RESOURCE_QUOTA_CPU="8"
readonly RESOURCE_QUOTA_MEMORY="32Gi"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl v1.27+"
        return 1
    fi
    
    # Check helm
    if ! command -v helm &> /dev/null; then
        log_error "helm not found. Please install helm v3.0+"
        return 1
    }
    
    # Verify cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Unable to connect to Kubernetes cluster"
        return 1
    }
    
    # Check storage class
    if ! kubectl get storageclass gp2 &> /dev/null; then
        log_error "Required storage class 'gp2' not found"
        return 1
    }
    
    # Verify network policy support
    if ! kubectl api-resources | grep networkpolicies &> /dev/null; then
        log_warn "Network policy support not detected"
    }
    
    # Check resource quota availability
    local cpu_allocatable
    cpu_allocatable=$(kubectl get nodes -o=jsonpath='{sum(.items[*].status.allocatable.cpu)}')
    if [[ ${cpu_allocatable%m} -lt ${RESOURCE_QUOTA_CPU%m} ]]; then
        log_error "Insufficient CPU resources available"
        return 1
    }
    
    log_info "Prerequisites check completed successfully"
    return 0
}

# Function to create and configure namespace
create_namespace() {
    log_info "Creating and configuring namespace: ${NAMESPACE}"
    
    # Create namespace if it doesn't exist
    if ! kubectl get namespace "${NAMESPACE}" &> /dev/null; then
        kubectl create namespace "${NAMESPACE}"
    fi
    
    # Apply resource quota
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ResourceQuota
metadata:
  name: logging-quota
  namespace: ${NAMESPACE}
spec:
  hard:
    requests.cpu: "${RESOURCE_QUOTA_CPU}"
    requests.memory: "${RESOURCE_QUOTA_MEMORY}"
    limits.cpu: "${RESOURCE_QUOTA_CPU}"
    limits.memory: "${RESOURCE_QUOTA_MEMORY}"
EOF
    
    # Apply network policy
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: logging-network-policy
  namespace: ${NAMESPACE}
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: monitoring
EOF
    
    log_info "Namespace configuration completed"
    return 0
}

# Function to deploy Elasticsearch
deploy_elasticsearch() {
    log_info "Deploying Elasticsearch..."
    
    # Add Elastic Helm repo
    helm repo add elastic https://helm.elastic.co
    helm repo update
    
    # Deploy Elasticsearch
    helm upgrade --install elasticsearch elastic/elasticsearch \
        --namespace "${NAMESPACE}" \
        --version "${ELASTICSEARCH_VERSION}" \
        --values ../kubernetes/logging/elasticsearch/values.yaml \
        --set clusterName=scraping-platform-logs \
        --set minimumMasterNodes="${MIN_MASTER_NODES}" \
        --wait --timeout "${HEALTH_CHECK_TIMEOUT}s"
    
    # Wait for cluster health
    local retries=0
    while [[ $retries -lt 10 ]]; do
        if kubectl exec -n "${NAMESPACE}" elasticsearch-master-0 -- curl -s localhost:9200/_cluster/health | grep -q '"status":"green"'; then
            log_info "Elasticsearch cluster is healthy"
            return 0
        fi
        ((retries++))
        sleep 30
    done
    
    log_error "Elasticsearch cluster failed to reach healthy state"
    return 1
}

# Function to deploy Fluentd
deploy_fluentd() {
    log_info "Deploying Fluentd..."
    
    # Add Fluentd Helm repo
    helm repo add fluent https://fluent.github.io/helm-charts
    helm repo update
    
    # Deploy Fluentd
    helm upgrade --install fluentd fluent/fluentd \
        --namespace "${NAMESPACE}" \
        --version "${FLUENTD_VERSION}" \
        --values ../kubernetes/logging/fluentd/values.yaml \
        --set env.FLUENT_ELASTICSEARCH_HOST=elasticsearch-master \
        --wait --timeout "${HEALTH_CHECK_TIMEOUT}s"
    
    # Verify Fluentd pods are running
    if ! kubectl wait --for=condition=ready pod -l app=fluentd -n "${NAMESPACE}" --timeout="${HEALTH_CHECK_TIMEOUT}s"; then
        log_error "Fluentd pods failed to reach ready state"
        return 1
    fi
    
    log_info "Fluentd deployment completed successfully"
    return 0
}

# Function to deploy Kibana
deploy_kibana() {
    log_info "Deploying Kibana..."
    
    # Deploy Kibana
    helm upgrade --install kibana elastic/kibana \
        --namespace "${NAMESPACE}" \
        --version "${KIBANA_VERSION}" \
        --values ../kubernetes/logging/kibana/values.yaml \
        --set elasticsearchHosts=http://elasticsearch-master:9200 \
        --wait --timeout "${HEALTH_CHECK_TIMEOUT}s"
    
    # Verify Kibana deployment
    if ! kubectl wait --for=condition=ready pod -l app=kibana -n "${NAMESPACE}" --timeout="${HEALTH_CHECK_TIMEOUT}s"; then
        log_error "Kibana pod failed to reach ready state"
        return 1
    fi
    
    log_info "Kibana deployment completed successfully"
    return 0
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check Elasticsearch cluster health
    local es_health
    es_health=$(kubectl exec -n "${NAMESPACE}" elasticsearch-master-0 -- curl -s localhost:9200/_cluster/health)
    if ! echo "${es_health}" | grep -q '"status":"green"'; then
        log_error "Elasticsearch cluster is not healthy"
        return 1
    fi
    
    # Verify Fluentd log shipping
    if ! kubectl logs -n "${NAMESPACE}" -l app=fluentd --tail=10 | grep -q "Connection established to Elasticsearch"; then
        log_error "Fluentd log shipping verification failed"
        return 1
    fi
    
    # Check Kibana connectivity
    local kibana_status
    kibana_status=$(kubectl exec -n "${NAMESPACE}" deploy/kibana -- curl -s localhost:5601/api/status)
    if ! echo "${kibana_status}" | grep -q '"status":{"overall":{"level":"available"'; then
        log_error "Kibana connectivity check failed"
        return 1
    fi
    
    log_info "Deployment verification completed successfully"
    return 0
}

# Main function
main() {
    log_info "Starting logging stack deployment..."
    
    # Execute deployment steps
    check_prerequisites || exit 1
    create_namespace || exit 1
    deploy_elasticsearch || exit 1
    deploy_fluentd || exit 1
    deploy_kibana || exit 1
    verify_deployment || exit 1
    
    log_info "Logging stack deployment completed successfully"
    return 0
}

# Execute main function
main "$@"
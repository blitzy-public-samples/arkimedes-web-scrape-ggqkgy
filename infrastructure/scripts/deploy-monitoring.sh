#!/usr/bin/env bash

# deploy-monitoring.sh
# Version: 1.0.0
# Description: Production-grade deployment script for monitoring stack (Prometheus, Grafana, Jaeger)
# Dependencies:
#   - helm v3.12+
#   - kubectl v1.27+
#   - yq v4.30+

set -euo pipefail

# Global variables
readonly MONITORING_NAMESPACE="monitoring"
readonly HELM_TIMEOUT="600s"
readonly PROMETHEUS_VERSION="15.0.0"
readonly GRAFANA_VERSION="9.5.0"
readonly JAEGER_VERSION="1.45.0"
readonly DEPLOYMENT_TIMEOUT="900s"
readonly RETRY_INTERVAL="10s"
readonly MAX_RETRIES="30"
readonly RESOURCE_WAIT_TIMEOUT="300s"

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

# Error handling
handle_error() {
    local exit_code=$?
    log_error "An error occurred on line $1"
    cleanup_on_failure
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Cleanup function for failed deployments
cleanup_on_failure() {
    log_warn "Initiating cleanup of failed deployment..."
    
    # Remove incomplete deployments
    helm uninstall prometheus -n "${MONITORING_NAMESPACE}" 2>/dev/null || true
    helm uninstall grafana -n "${MONITORING_NAMESPACE}" 2>/dev/null || true
    helm uninstall jaeger -n "${MONITORING_NAMESPACE}" 2>/dev/null || true
    
    # Remove any lingering PVCs
    kubectl delete pvc -l app=prometheus -n "${MONITORING_NAMESPACE}" 2>/dev/null || true
    kubectl delete pvc -l app=grafana -n "${MONITORING_NAMESPACE}" 2>/dev/null || true
    kubectl delete pvc -l app=jaeger -n "${MONITORING_NAMESPACE}" 2>/dev/null || true
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check required tools
    local required_tools=("kubectl" "helm" "yq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            return 1
        fi
    done

    # Verify Kubernetes connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    }

    # Check Helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo add jaegertracing https://jaegertracing.github.io/helm-charts
    helm repo update

    # Verify namespace exists
    if ! kubectl get namespace "${MONITORING_NAMESPACE}" &> /dev/null; then
        log_info "Creating monitoring namespace..."
        kubectl create namespace "${MONITORING_NAMESPACE}"
    fi

    # Verify storage classes
    if ! kubectl get storageclass gp2 &> /dev/null; then
        log_error "Required storage class 'gp2' not found"
        return 1
    }

    return 0
}

# Deploy Prometheus
deploy_prometheus() {
    log_info "Deploying Prometheus..."

    # Validate Prometheus values file
    if ! yq eval -e . "../kubernetes/monitoring/prometheus/values.yaml" > /dev/null; then
        log_error "Invalid Prometheus values file"
        return 1
    }

    # Deploy Prometheus
    helm upgrade --install prometheus prometheus-community/prometheus \
        --namespace "${MONITORING_NAMESPACE}" \
        --version "${PROMETHEUS_VERSION}" \
        --values "../kubernetes/monitoring/prometheus/values.yaml" \
        --timeout "${HELM_TIMEOUT}" \
        --wait

    # Verify deployment
    if ! kubectl rollout status statefulset/prometheus-server -n "${MONITORING_NAMESPACE}" --timeout="${DEPLOYMENT_TIMEOUT}"; then
        log_error "Prometheus deployment failed"
        return 1
    }

    return 0
}

# Deploy Grafana
deploy_grafana() {
    log_info "Deploying Grafana..."

    # Validate Grafana values file
    if ! yq eval -e . "../kubernetes/monitoring/grafana/values.yaml" > /dev/null; then
        log_error "Invalid Grafana values file"
        return 1
    }

    # Deploy Grafana
    helm upgrade --install grafana grafana/grafana \
        --namespace "${MONITORING_NAMESPACE}" \
        --version "${GRAFANA_VERSION}" \
        --values "../kubernetes/monitoring/grafana/values.yaml" \
        --timeout "${HELM_TIMEOUT}" \
        --wait

    # Verify deployment
    if ! kubectl rollout status deployment/grafana -n "${MONITORING_NAMESPACE}" --timeout="${DEPLOYMENT_TIMEOUT}"; then
        log_error "Grafana deployment failed"
        return 1
    }

    return 0
}

# Deploy Jaeger
deploy_jaeger() {
    log_info "Deploying Jaeger..."

    # Validate Jaeger values file
    if ! yq eval -e . "../kubernetes/monitoring/jaeger/values.yaml" > /dev/null; then
        log_error "Invalid Jaeger values file"
        return 1
    }

    # Deploy Jaeger
    helm upgrade --install jaeger jaegertracing/jaeger \
        --namespace "${MONITORING_NAMESPACE}" \
        --version "${JAEGER_VERSION}" \
        --values "../kubernetes/monitoring/jaeger/values.yaml" \
        --timeout "${HELM_TIMEOUT}" \
        --wait

    # Verify deployment
    if ! kubectl rollout status deployment/jaeger-query -n "${MONITORING_NAMESPACE}" --timeout="${DEPLOYMENT_TIMEOUT}"; then
        log_error "Jaeger deployment failed"
        return 1
    }

    return 0
}

# Verify monitoring stack deployment
verify_deployment() {
    log_info "Verifying monitoring stack deployment..."

    # Check all pods are running
    local retry_count=0
    while [[ $retry_count -lt $MAX_RETRIES ]]; do
        if kubectl get pods -n "${MONITORING_NAMESPACE}" | grep -v Running | grep -v Completed | wc -l | grep -q "^0$"; then
            break
        fi
        ((retry_count++))
        sleep "${RETRY_INTERVAL}"
    done

    if [[ $retry_count -eq $MAX_RETRIES ]]; then
        log_error "Not all pods are running in monitoring namespace"
        return 1
    }

    # Verify Prometheus endpoints
    if ! curl -s "http://prometheus-server.${MONITORING_NAMESPACE}:9090/-/healthy" | grep -q "Prometheus is Healthy"; then
        log_error "Prometheus health check failed"
        return 1
    }

    # Verify Grafana login
    if ! curl -s "http://grafana.${MONITORING_NAMESPACE}:3000/api/health" | grep -q "ok"; then
        log_error "Grafana health check failed"
        return 1
    }

    # Verify Jaeger Query service
    if ! curl -s "http://jaeger-query.${MONITORING_NAMESPACE}:16686/health" | grep -q "ok"; then
        log_error "Jaeger health check failed"
        return 1
    }

    return 0
}

# Main deployment function
main() {
    log_info "Starting monitoring stack deployment..."

    # Check prerequisites
    if ! check_prerequisites; then
        log_error "Prerequisites check failed"
        exit 1
    }

    # Deploy components
    if ! deploy_prometheus; then
        log_error "Prometheus deployment failed"
        exit 1
    }

    if ! deploy_grafana; then
        log_error "Grafana deployment failed"
        exit 1
    }

    if ! deploy_jaeger; then
        log_error "Jaeger deployment failed"
        exit 1
    }

    # Verify deployment
    if ! verify_deployment; then
        log_error "Deployment verification failed"
        exit 1
    }

    log_info "Monitoring stack deployment completed successfully!"
    return 0
}

# Execute main function
main "$@"
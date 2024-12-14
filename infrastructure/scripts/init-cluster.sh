#!/usr/bin/env bash

# init-cluster.sh
# Version: 1.0.0
# Description: Production-grade Kubernetes cluster initialization script for web scraping platform
# Dependencies:
# - kubectl v1.27+
# - helm v3.12+
# - aws-cli v2.0+

set -euo pipefail
IFS=$'\n\t'

# Global variables
readonly CLUSTER_NAME="web-scraper-cluster"
readonly AWS_REGION="us-west-2"
readonly K8S_VERSION="1.27"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/init-cluster.log"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message=$*
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Error handling function
error_handler() {
    local line_no=$1
    local error_code=$2
    log "ERROR" "Error occurred in script $0 at line $line_no (exit code: $error_code)"
    exit "${error_code}"
}

trap 'error_handler ${LINENO} $?' ERR

# Function to check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log "ERROR" "kubectl is not installed"
        return 1
    fi
    
    local kubectl_version=$(kubectl version --client -o json | jq -r '.clientVersion.gitVersion')
    if [[ ! "${kubectl_version}" =~ v${K8S_VERSION} ]]; then
        log "ERROR" "kubectl version mismatch. Required: ${K8S_VERSION}, Found: ${kubectl_version}"
        return 1
    }
    
    # Check helm
    if ! command -v helm &> /dev/null; then
        log "ERROR" "helm is not installed"
        return 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log "ERROR" "AWS CLI is not installed"
        return 1
    }
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    }
    
    # Check disk space
    local available_space=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ "${available_space}" -lt 20 ]]; then
        log "ERROR" "Insufficient disk space. Required: 20GB, Available: ${available_space}GB"
        return 1
    }
    
    log "INFO" "All prerequisites checked successfully"
    return 0
}

# Function to create EKS cluster
create_eks_cluster() {
    local cluster_name=$1
    local region=$2
    
    log "INFO" "Creating EKS cluster: ${cluster_name} in region: ${region}"
    
    # Create EKS cluster
    eksctl create cluster \
        --name "${cluster_name}" \
        --region "${region}" \
        --version "${K8S_VERSION}" \
        --nodegroup-name "standard-workers" \
        --node-type "m5.xlarge" \
        --nodes-min 2 \
        --nodes-max 10 \
        --with-oidc \
        --ssh-access \
        --ssh-public-key "web-scraper-eks" \
        --managed \
        --asg-access \
        --external-dns-access \
        --full-ecr-access \
        --appmesh-access \
        --alb-ingress-access
        
    # Wait for cluster to be ready
    until kubectl get nodes &> /dev/null; do
        log "INFO" "Waiting for cluster to be ready..."
        sleep 10
    done
    
    log "INFO" "EKS cluster created successfully"
    return 0
}

# Function to setup namespaces
setup_namespaces() {
    log "INFO" "Setting up namespaces..."
    
    # Apply namespace configurations
    kubectl apply -f "${SCRIPT_DIR}/../kubernetes/base/namespaces.yaml"
    
    # Setup resource quotas
    for ns in app monitoring logging ingress; do
        kubectl apply -f - <<EOF
apiVersion: v1
kind: ResourceQuota
metadata:
  name: ${ns}-quota
  namespace: ${ns}
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    pods: "20"
EOF
    done
    
    log "INFO" "Namespaces setup completed"
    return 0
}

# Function to setup storage
setup_storage() {
    log "INFO" "Setting up storage..."
    
    # Install EBS CSI driver
    helm repo add aws-ebs-csi-driver https://kubernetes-sigs.github.io/aws-ebs-csi-driver
    helm repo update
    
    helm upgrade --install aws-ebs-csi-driver \
        aws-ebs-csi-driver/aws-ebs-csi-driver \
        --namespace kube-system \
        --set enableVolumeScheduling=true \
        --set enableVolumeResizing=true \
        --set enableVolumeSnapshot=true
        
    # Apply storage classes
    kubectl apply -f "${SCRIPT_DIR}/../kubernetes/base/storage-classes.yaml"
    
    log "INFO" "Storage setup completed"
    return 0
}

# Function to setup networking
setup_networking() {
    log "INFO" "Setting up networking..."
    
    # Install AWS CNI plugin
    kubectl apply -f https://raw.githubusercontent.com/aws/amazon-vpc-cni-k8s/master/config/master/aws-k8s-cni.yaml
    
    # Apply network policies
    kubectl apply -f "${SCRIPT_DIR}/../kubernetes/base/network-policies.yaml"
    
    # Install AWS Load Balancer Controller
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update
    
    helm upgrade --install aws-load-balancer-controller \
        eks/aws-load-balancer-controller \
        --namespace kube-system \
        --set clusterName="${CLUSTER_NAME}" \
        --set serviceAccount.create=true
        
    log "INFO" "Networking setup completed"
    return 0
}

# Function to setup monitoring
setup_monitoring() {
    log "INFO" "Setting up monitoring..."
    
    # Execute monitoring deployment script
    if [[ -x "${SCRIPT_DIR}/deploy-monitoring.sh" ]]; then
        "${SCRIPT_DIR}/deploy-monitoring.sh"
    else
        log "ERROR" "Monitoring deployment script not found or not executable"
        return 1
    fi
    
    log "INFO" "Monitoring setup completed"
    return 0
}

# Function to setup logging
setup_logging() {
    log "INFO" "Setting up logging..."
    
    # Execute logging deployment script
    if [[ -x "${SCRIPT_DIR}/deploy-logging.sh" ]]; then
        "${SCRIPT_DIR}/deploy-logging.sh"
    else
        log "ERROR" "Logging deployment script not found or not executable"
        return 1
    fi
    
    log "INFO" "Logging setup completed"
    return 0
}

# Main function
main() {
    log "INFO" "Starting cluster initialization..."
    
    # Create log file if it doesn't exist
    touch "${LOG_FILE}"
    
    # Check prerequisites
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    fi
    
    # Create EKS cluster
    if ! create_eks_cluster "${CLUSTER_NAME}" "${AWS_REGION}"; then
        log "ERROR" "Cluster creation failed"
        exit 1
    fi
    
    # Setup cluster components
    setup_namespaces
    setup_storage
    setup_networking
    setup_monitoring
    setup_logging
    
    # Verify cluster health
    if ! kubectl get nodes -o wide; then
        log "ERROR" "Cluster health check failed"
        exit 1
    fi
    
    log "INFO" "Cluster initialization completed successfully"
    return 0
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
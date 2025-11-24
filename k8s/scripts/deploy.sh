#!/bin/bash

################################################################################
# Blockd Platform - Kubernetes Deployment Script
#
# This script automates the deployment of Blockd platform to Kubernetes
# using Helm charts.
#
# Usage:
#   ./deploy.sh [environment] [action]
#
# Arguments:
#   environment: local, staging, or production
#   action: install, upgrade, or uninstall
#
# Examples:
#   ./deploy.sh local install
#   ./deploy.sh staging upgrade
#   ./deploy.sh production uninstall
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HELM_CHART_DIR="${PROJECT_ROOT}/k8s/helm/blockd"

# Default values
ENVIRONMENT="${1:-local}"
ACTION="${2:-install}"
RELEASE_NAME="blockd"
TIMEOUT="10m"

################################################################################
# Functions
################################################################################

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "=============================================="
    echo "$1"
    echo "=============================================="
    echo ""
}

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    print_success "kubectl is installed: $(kubectl version --client --short 2>/dev/null || kubectl version --client)"

    # Check helm
    if ! command -v helm &> /dev/null; then
        print_error "helm is not installed. Please install helm first."
        exit 1
    fi
    print_success "helm is installed: $(helm version --short)"

    # Check kubectl cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi
    print_success "Connected to Kubernetes cluster: $(kubectl config current-context)"
}

set_kubernetes_context() {
    print_header "Setting Kubernetes Context"

    case "${ENVIRONMENT}" in
        local)
            CONTEXT="minikube"
            NAMESPACE="blockd"
            VALUES_FILE="${HELM_CHART_DIR}/values.yaml"
            ;;
        staging)
            CONTEXT="blockd-staging"
            NAMESPACE="blockd-staging"
            VALUES_FILE="${HELM_CHART_DIR}/values-staging.yaml"
            ;;
        production)
            CONTEXT="blockd-production"
            NAMESPACE="blockd"
            VALUES_FILE="${HELM_CHART_DIR}/values-production.yaml"
            ;;
        *)
            print_error "Invalid environment: ${ENVIRONMENT}"
            print_info "Valid environments: local, staging, production"
            exit 1
            ;;
    esac

    # Check if context exists
    if kubectl config get-contexts "${CONTEXT}" &> /dev/null; then
        kubectl config use-context "${CONTEXT}"
        print_success "Switched to context: ${CONTEXT}"
    else
        print_warning "Context ${CONTEXT} not found. Using current context: $(kubectl config current-context)"
    fi

    print_info "Namespace: ${NAMESPACE}"
    print_info "Values file: ${VALUES_FILE}"
}

create_namespace() {
    if ! kubectl get namespace "${NAMESPACE}" &> /dev/null; then
        print_info "Creating namespace: ${NAMESPACE}"
        kubectl create namespace "${NAMESPACE}"
        print_success "Namespace created: ${NAMESPACE}"
    else
        print_info "Namespace already exists: ${NAMESPACE}"
    fi
}

validate_helm_chart() {
    print_header "Validating Helm Chart"

    if [ ! -f "${HELM_CHART_DIR}/Chart.yaml" ]; then
        print_error "Helm chart not found at: ${HELM_CHART_DIR}"
        exit 1
    fi

    if [ ! -f "${VALUES_FILE}" ]; then
        print_error "Values file not found: ${VALUES_FILE}"
        exit 1
    fi

    # Lint the helm chart
    print_info "Linting Helm chart..."
    if helm lint "${HELM_CHART_DIR}" -f "${VALUES_FILE}"; then
        print_success "Helm chart validation passed"
    else
        print_error "Helm chart validation failed"
        exit 1
    fi
}

install_deployment() {
    print_header "Installing Blockd Platform"

    print_info "Installing release: ${RELEASE_NAME}"
    print_info "Environment: ${ENVIRONMENT}"
    print_info "Namespace: ${NAMESPACE}"

    helm install "${RELEASE_NAME}" "${HELM_CHART_DIR}" \
        --namespace "${NAMESPACE}" \
        --create-namespace \
        --values "${VALUES_FILE}" \
        --timeout "${TIMEOUT}" \
        --wait

    print_success "Deployment installed successfully!"
}

upgrade_deployment() {
    print_header "Upgrading Blockd Platform"

    print_info "Upgrading release: ${RELEASE_NAME}"
    print_info "Environment: ${ENVIRONMENT}"
    print_info "Namespace: ${NAMESPACE}"

    helm upgrade "${RELEASE_NAME}" "${HELM_CHART_DIR}" \
        --namespace "${NAMESPACE}" \
        --values "${VALUES_FILE}" \
        --timeout "${TIMEOUT}" \
        --wait \
        --install

    print_success "Deployment upgraded successfully!"
}

uninstall_deployment() {
    print_header "Uninstalling Blockd Platform"

    print_warning "This will remove the Blockd deployment from namespace: ${NAMESPACE}"
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Uninstall cancelled."
        exit 0
    fi

    print_info "Uninstalling release: ${RELEASE_NAME}"

    helm uninstall "${RELEASE_NAME}" \
        --namespace "${NAMESPACE}" \
        --timeout "${TIMEOUT}"

    print_success "Deployment uninstalled successfully!"

    read -p "Do you want to delete the namespace ${NAMESPACE}? (yes/no): " -r
    echo

    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        kubectl delete namespace "${NAMESPACE}"
        print_success "Namespace deleted: ${NAMESPACE}"
    fi
}

verify_deployment() {
    print_header "Verifying Deployment"

    print_info "Checking pod status..."
    kubectl get pods -n "${NAMESPACE}"

    print_info "Checking service status..."
    kubectl get svc -n "${NAMESPACE}"

    print_info "Checking ingress status..."
    kubectl get ingress -n "${NAMESPACE}"

    # Wait for all pods to be ready
    print_info "Waiting for all pods to be ready..."
    kubectl wait --for=condition=ready pod \
        --all \
        --namespace="${NAMESPACE}" \
        --timeout=5m || print_warning "Some pods are not ready yet"

    print_success "Deployment verification complete!"
}

show_deployment_info() {
    print_header "Deployment Information"

    helm status "${RELEASE_NAME}" -n "${NAMESPACE}"

    if [ "${ENVIRONMENT}" == "local" ]; then
        print_info ""
        print_info "To access the application locally:"
        print_info "  Frontend: kubectl port-forward -n ${NAMESPACE} svc/frontend 8080:80"
        print_info "  API Gateway: kubectl port-forward -n ${NAMESPACE} svc/api-gateway 3000:3000"
        print_info ""
        print_info "Then visit: http://localhost:8080"
    fi
}

################################################################################
# Main Script
################################################################################

main() {
    print_header "Blockd Platform Deployment Script"
    print_info "Environment: ${ENVIRONMENT}"
    print_info "Action: ${ACTION}"

    # Check prerequisites
    check_prerequisites

    # Set Kubernetes context
    set_kubernetes_context

    # Validate Helm chart
    validate_helm_chart

    # Perform action
    case "${ACTION}" in
        install)
            create_namespace
            install_deployment
            verify_deployment
            show_deployment_info
            ;;
        upgrade)
            upgrade_deployment
            verify_deployment
            show_deployment_info
            ;;
        uninstall)
            uninstall_deployment
            ;;
        *)
            print_error "Invalid action: ${ACTION}"
            print_info "Valid actions: install, upgrade, uninstall"
            exit 1
            ;;
    esac

    print_success "Deployment script completed successfully!"
}

# Run main function
main

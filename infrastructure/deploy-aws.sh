#!/bin/bash
# =============================================================================
# Blockd AWS Deployment Script
# Deploys the Blockd backend infrastructure to AWS
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=${1:-staging}
AWS_REGION=${AWS_REGION:-us-east-1}
TERRAFORM_DIR="$(dirname "$0")/terraform"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi

    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install it first."
        exit 1
    fi

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed. Please install it first."
        exit 1
    fi

    # Check Helm
    if ! command -v helm &> /dev/null; then
        log_error "Helm is not installed. Please install it first."
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi

    log_success "All prerequisites met."
}

setup_terraform_backend() {
    log_info "Setting up Terraform backend (S3 + DynamoDB)..."

    # Check if state bucket exists
    if ! aws s3api head-bucket --bucket "blockd-terraform-state" 2>/dev/null; then
        log_info "Creating S3 bucket for Terraform state..."
        aws s3api create-bucket \
            --bucket "blockd-terraform-state" \
            --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION" 2>/dev/null || true

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "blockd-terraform-state" \
            --versioning-configuration Status=Enabled

        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "blockd-terraform-state" \
            --server-side-encryption-configuration '{
                "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
            }'

        log_success "S3 bucket created."
    else
        log_info "S3 bucket already exists."
    fi

    # Check if DynamoDB table exists
    if ! aws dynamodb describe-table --table-name "blockd-terraform-locks" &>/dev/null; then
        log_info "Creating DynamoDB table for state locks..."
        aws dynamodb create-table \
            --table-name "blockd-terraform-locks" \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --region "$AWS_REGION"

        log_success "DynamoDB table created."
    else
        log_info "DynamoDB table already exists."
    fi
}

deploy_infrastructure() {
    log_info "Deploying infrastructure for environment: $ENVIRONMENT"

    cd "$TERRAFORM_DIR"

    # Initialize Terraform
    log_info "Initializing Terraform..."
    terraform init -backend-config="environments/$ENVIRONMENT/backend.hcl" || terraform init

    # Select or create workspace
    terraform workspace select "$ENVIRONMENT" 2>/dev/null || terraform workspace new "$ENVIRONMENT"

    # Plan deployment
    log_info "Planning deployment..."
    terraform plan \
        -var-file="environments/$ENVIRONMENT/terraform.tfvars" \
        -out="tfplan-$ENVIRONMENT"

    # Prompt for confirmation
    echo ""
    read -p "Do you want to apply this plan? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        log_warning "Deployment cancelled."
        exit 0
    fi

    # Apply deployment
    log_info "Applying deployment..."
    terraform apply "tfplan-$ENVIRONMENT"

    log_success "Infrastructure deployed successfully!"

    # Get outputs
    log_info "Terraform outputs:"
    terraform output
}

configure_kubectl() {
    log_info "Configuring kubectl for EKS cluster..."

    CLUSTER_NAME=$(terraform output -raw cluster_name 2>/dev/null || echo "blockd-$ENVIRONMENT-cluster")

    aws eks update-kubeconfig \
        --name "$CLUSTER_NAME" \
        --region "$AWS_REGION"

    log_success "kubectl configured for cluster: $CLUSTER_NAME"

    # Verify connection
    log_info "Verifying cluster connection..."
    kubectl cluster-info
}

deploy_kubernetes_resources() {
    log_info "Deploying Kubernetes resources..."

    K8S_DIR="$(dirname "$0")/../k8s"

    # Apply namespaces
    if [[ -f "$K8S_DIR/manifests/namespaces.yaml" ]]; then
        kubectl apply -f "$K8S_DIR/manifests/namespaces.yaml"
    fi

    # Apply secrets (from Terraform outputs)
    log_info "Creating Kubernetes secrets from AWS Secrets Manager..."

    # Get secrets from Terraform outputs or AWS Secrets Manager
    DB_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id "blockd-$ENVIRONMENT-db-credentials" \
        --query SecretString --output text 2>/dev/null || echo "{}")

    if [[ "$DB_SECRET" != "{}" ]]; then
        kubectl create secret generic database-credentials \
            --namespace=blockd \
            --from-literal=username=$(echo "$DB_SECRET" | jq -r '.username') \
            --from-literal=password=$(echo "$DB_SECRET" | jq -r '.password') \
            --dry-run=client -o yaml | kubectl apply -f -
    fi

    # Deploy Helm charts
    log_info "Deploying Blockd services via Helm..."

    if [[ -d "$K8S_DIR/helm/blockd" ]]; then
        helm upgrade --install blockd "$K8S_DIR/helm/blockd" \
            --namespace blockd \
            --create-namespace \
            --values "$K8S_DIR/helm/blockd/values-$ENVIRONMENT.yaml" \
            --wait
    fi

    log_success "Kubernetes resources deployed!"
}

print_summary() {
    echo ""
    echo "=============================================="
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo "=============================================="
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "AWS Region: $AWS_REGION"
    echo ""
    echo "Next steps:"
    echo "1. Update DNS records to point to the load balancer"
    echo "2. Configure SSL certificates if not using ACM"
    echo "3. Run database migrations"
    echo "4. Deploy application containers"
    echo ""
    echo "Useful commands:"
    echo "  kubectl get pods -n blockd"
    echo "  kubectl get svc -n blockd"
    echo "  terraform output"
    echo ""
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "  Blockd AWS Deployment"
    echo "  Environment: $ENVIRONMENT"
    echo "=============================================="
    echo ""

    check_prerequisites
    setup_terraform_backend
    deploy_infrastructure
    configure_kubectl
    deploy_kubernetes_resources
    print_summary
}

# Handle arguments
case "${1:-}" in
    staging|production)
        ENVIRONMENT="$1"
        main
        ;;
    --help|-h)
        echo "Usage: $0 [environment]"
        echo ""
        echo "Environments:"
        echo "  staging     Deploy to staging environment (default)"
        echo "  production  Deploy to production environment"
        echo ""
        echo "Environment variables:"
        echo "  AWS_REGION  AWS region (default: us-east-1)"
        ;;
    *)
        if [[ -z "${1:-}" ]]; then
            main
        else
            log_error "Unknown environment: $1"
            echo "Use 'staging' or 'production'"
            exit 1
        fi
        ;;
esac

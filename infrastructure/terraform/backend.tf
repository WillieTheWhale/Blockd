# Terraform Backend Configuration
# This file configures remote state storage in S3 with DynamoDB locking
#
# IMPORTANT: Use Terraform workspaces for environment isolation:
#   terraform workspace new staging
#   terraform workspace new production
#   terraform workspace select staging
#
# Each workspace creates a separate state file under the same key prefix:
#   blockd/env:/staging/terraform.tfstate
#   blockd/env:/production/terraform.tfstate
#
# To initialize:
# 1. Create S3 bucket: aws s3 mb s3://blockd-terraform-state
# 2. Enable versioning: aws s3api put-bucket-versioning --bucket blockd-terraform-state --versioning-configuration Status=Enabled
# 3. Create DynamoDB table: aws dynamodb create-table --table-name blockd-terraform-locks --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
# 4. Run: terraform init
# 5. Create workspaces: terraform workspace new staging && terraform workspace new production

terraform {
  backend "s3" {
    bucket         = "blockd-terraform-state"
    key            = "blockd/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "blockd-terraform-locks"

    # KMS encryption for state file (required for production)
    # Replace ACCOUNT_ID and KEY_ID with your actual values
    kms_key_id = "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"

    # Workspaces are automatically supported - each workspace gets its own state file
    # The key becomes: blockd/env:/<workspace>/terraform.tfstate
    # Default workspace uses: blockd/terraform.tfstate
  }
}

# Workspace-based configuration
# Use terraform.workspace to access current workspace name in your configuration
# Example: var.environment can default to terraform.workspace
#
# locals {
#   environment = terraform.workspace
# }

# Alternative: Terraform Cloud Backend (recommended for teams)
# Uncomment to use Terraform Cloud instead of S3
# terraform {
#   cloud {
#     organization = "your-organization"
#
#     workspaces {
#       tags = ["blockd"]
#     }
#   }
# }

# Terraform Backend Configuration
# This file configures remote state storage in S3 with DynamoDB locking
#
# To initialize:
# 1. Create S3 bucket: aws s3 mb s3://blockd-terraform-state
# 2. Enable versioning: aws s3api put-bucket-versioning --bucket blockd-terraform-state --versioning-configuration Status=Enabled
# 3. Create DynamoDB table: aws dynamodb create-table --table-name blockd-terraform-locks --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
# 4. Run: terraform init

terraform {
  backend "s3" {
    bucket         = "blockd-terraform-state"
    key            = "blockd/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "blockd-terraform-locks"

    # Optional: Use KMS for encryption
    # kms_key_id = "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"
  }
}

# Alternative: Terraform Cloud Backend
# Uncomment to use Terraform Cloud instead of S3
# terraform {
#   cloud {
#     organization = "your-organization"
#
#     workspaces {
#       name = "blockd-${var.environment}"
#     }
#   }
# }

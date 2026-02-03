terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Blockd"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Replica provider for cross-region S3 replication (us-west-2)
provider "aws" {
  alias  = "replica"
  region = "us-west-2"

  default_tags {
    tags = {
      Project     = "Blockd"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Data sources for EKS cluster - only evaluated when not in bootstrap mode
data "aws_eks_cluster" "cluster" {
  count = var.bootstrap_mode ? 0 : 1
  name  = module.kubernetes_cluster.cluster_name
}

data "aws_eks_cluster_auth" "cluster" {
  count = var.bootstrap_mode ? 0 : 1
  name  = module.kubernetes_cluster.cluster_name
}

# Kubernetes provider - uses placeholder values in bootstrap mode
provider "kubernetes" {
  host                   = var.bootstrap_mode ? "https://placeholder" : data.aws_eks_cluster.cluster[0].endpoint
  cluster_ca_certificate = var.bootstrap_mode ? "" : base64decode(data.aws_eks_cluster.cluster[0].certificate_authority[0].data)
  token                  = var.bootstrap_mode ? "" : data.aws_eks_cluster_auth.cluster[0].token
}

# Helm provider - uses placeholder values in bootstrap mode
provider "helm" {
  kubernetes {
    host                   = var.bootstrap_mode ? "https://placeholder" : data.aws_eks_cluster.cluster[0].endpoint
    cluster_ca_certificate = var.bootstrap_mode ? "" : base64decode(data.aws_eks_cluster.cluster[0].certificate_authority[0].data)
    token                  = var.bootstrap_mode ? "" : data.aws_eks_cluster_auth.cluster[0].token
  }
}

# Kubernetes Cluster Module
module "kubernetes_cluster" {
  source = "./modules/kubernetes-cluster"

  environment          = var.environment
  cluster_name         = var.cluster_name
  cluster_version      = var.cluster_version
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  node_instance_types  = var.node_instance_types
  node_desired_size    = var.node_desired_size
  node_min_size        = var.node_min_size
  node_max_size        = var.node_max_size
}

# Database Module
module "database" {
  source = "./modules/database"

  environment             = var.environment
  vpc_id                  = module.kubernetes_cluster.vpc_id
  private_subnet_ids      = module.kubernetes_cluster.private_subnet_ids
  db_instance_class       = var.db_instance_class
  db_allocated_storage    = var.db_allocated_storage
  db_name                 = var.db_name
  db_username             = var.db_username
  redis_node_type         = var.redis_node_type
  redis_num_cache_nodes   = var.redis_num_cache_nodes
  rabbitmq_instance_type  = var.rabbitmq_instance_type
}

# Storage Module
module "storage" {
  source = "./modules/storage"

  environment            = var.environment
  enable_cdn             = var.enable_cdn
  cloudfront_price_class = var.cloudfront_price_class

  providers = {
    aws         = aws
    aws.replica = aws.replica
  }
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"

  environment    = var.environment
  cluster_name   = module.kubernetes_cluster.cluster_name
  enable_grafana = var.enable_grafana
}

# DNS Module (Route53 + ACM)
# Note: ALB is created by AWS Load Balancer Controller after EKS deployment
# A records will be created after ALB exists by providing alb_dns_name and alb_zone_id
module "dns" {
  source = "./modules/dns"

  environment                  = var.environment
  domain_name                  = var.domain_name
  skip_certificate_validation  = var.bootstrap_mode  # Skip validation in bootstrap mode
  # ALB values left empty initially - A records created after ALB deployment
  # alb_dns_name      = "" (uses default)
  # alb_zone_id       = "" (uses default)
  alarm_sns_topic_arn = module.monitoring.sns_topic_arn
}

# WAF Module
module "waf" {
  count  = var.enable_waf ? 1 : 0
  source = "./modules/waf"

  environment            = var.environment
  scope                  = "REGIONAL"
  rate_limit             = var.waf_rate_limit
  enable_bot_control     = var.enable_bot_control
  enable_logging         = true
  log_retention_days     = var.environment == "production" ? 90 : 30
  alarm_sns_topic_arn    = module.monitoring.sns_topic_arn
}

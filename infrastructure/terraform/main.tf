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

data "aws_eks_cluster" "cluster" {
  name = module.kubernetes_cluster.cluster_name
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.kubernetes_cluster.cluster_name
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.cluster.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.cluster.token
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

  environment     = var.environment
  enable_cdn      = var.enable_cdn
  cloudfront_price_class = var.cloudfront_price_class
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"

  environment    = var.environment
  cluster_name   = module.kubernetes_cluster.cluster_name
  enable_grafana = var.enable_grafana
}

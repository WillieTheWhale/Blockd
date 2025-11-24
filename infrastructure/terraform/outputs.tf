output "cluster_name" {
  description = "EKS cluster name"
  value       = module.kubernetes_cluster.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.kubernetes_cluster.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group ID for the cluster"
  value       = module.kubernetes_cluster.cluster_security_group_id
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.kubernetes_cluster.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.kubernetes_cluster.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.kubernetes_cluster.public_subnet_ids
}

# Database Outputs
output "db_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.database.db_endpoint
  sensitive   = true
}

output "db_connection_string" {
  description = "Database connection string"
  value       = module.database.db_connection_string
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.database.redis_endpoint
  sensitive   = true
}

output "rabbitmq_endpoint" {
  description = "Amazon MQ RabbitMQ endpoint"
  value       = module.database.rabbitmq_endpoint
  sensitive   = true
}

output "rabbitmq_console_url" {
  description = "RabbitMQ management console URL"
  value       = module.database.rabbitmq_console_url
}

# Storage Outputs
output "videos_bucket_name" {
  description = "S3 bucket name for video storage"
  value       = module.storage.videos_bucket_name
}

output "videos_bucket_arn" {
  description = "S3 bucket ARN for videos"
  value       = module.storage.videos_bucket_arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.storage.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name"
  value       = module.storage.cloudfront_domain_name
}

# Monitoring Outputs
output "prometheus_endpoint" {
  description = "Prometheus endpoint"
  value       = module.monitoring.prometheus_endpoint
}

output "grafana_endpoint" {
  description = "Grafana endpoint"
  value       = module.monitoring.grafana_endpoint
}

output "grafana_admin_password_secret_arn" {
  description = "ARN of the secret containing Grafana admin password"
  value       = module.monitoring.grafana_admin_password_secret_arn
  sensitive   = true
}

# Configuration for kubectl
output "kubectl_config_command" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --name ${module.kubernetes_cluster.cluster_name} --region ${var.aws_region}"
}

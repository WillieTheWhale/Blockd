# Blockd Production Environment Configuration
# Domain: blockd.site

# General
aws_region  = "us-east-1"
environment = "production"

# Kubernetes Cluster
cluster_name         = "blockd-prod"
cluster_version      = "1.28"
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
node_instance_types  = ["t3.xlarge", "t3.2xlarge"]
node_desired_size    = 5
node_min_size        = 3
node_max_size        = 20

# Database
db_instance_class    = "db.r6g.xlarge"
db_allocated_storage = 200
db_name              = "blockd"
db_username          = "blockd_admin"

# Redis
redis_node_type        = "cache.r6g.large"
redis_num_cache_nodes  = 3

# RabbitMQ
rabbitmq_instance_type = "mq.m5.large"

# Storage & CDN
enable_cdn              = true
cloudfront_price_class  = "PriceClass_All"

# Monitoring
enable_grafana = true

# Domain & DNS
domain_name = "blockd.site"

# WAF Security
enable_waf         = true
waf_rate_limit     = 2000
enable_bot_control = true

# Tags
additional_tags = {
  CostCenter = "production"
  Team       = "platform"
}

# Bootstrap mode - set to true for initial deployment, then set to false after EKS exists
bootstrap_mode = true

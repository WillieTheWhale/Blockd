# Blockd Staging Environment Configuration
# Domain: staging.blockd.site

# General
aws_region  = "us-east-1"
environment = "staging"

# Kubernetes Cluster
cluster_name         = "blockd-staging-cluster"
cluster_version      = "1.28"
vpc_cidr             = "10.1.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b"]
node_instance_types  = ["t3.large", "t3.xlarge"]
node_desired_size    = 3
node_min_size        = 2
node_max_size        = 10

# Database
db_instance_class    = "db.t3.large"
db_allocated_storage = 50
db_name              = "blockd"
db_username          = "blockd_admin"

# Redis
redis_node_type        = "cache.t3.medium"
redis_num_cache_nodes  = 1

# RabbitMQ
rabbitmq_instance_type = "mq.t3.micro"

# Storage & CDN
enable_cdn              = true
cloudfront_price_class  = "PriceClass_100"

# Monitoring
enable_grafana = true

# Domain & DNS
domain_name = "blockd.site"

# WAF Security
enable_waf         = true
waf_rate_limit     = 1000
enable_bot_control = false

# Tags
additional_tags = {
  CostCenter = "staging"
  Team       = "platform"
}

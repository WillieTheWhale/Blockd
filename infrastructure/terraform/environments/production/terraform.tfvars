# Production Environment Configuration
environment  = "production"
aws_region   = "us-east-1"
cluster_name = "blockd-production-cluster"

# Kubernetes Cluster
cluster_version    = "1.28"
node_instance_types = ["t3.xlarge", "t3.2xlarge"]
node_desired_size  = 5
node_min_size      = 3
node_max_size      = 15

# Database
db_instance_class    = "db.r6g.xlarge"
db_allocated_storage = 200
db_name             = "blockd_production"
db_username         = "blockd_admin"

# Redis
redis_node_type       = "cache.r6g.large"
redis_num_cache_nodes = 3

# RabbitMQ
rabbitmq_instance_type = "mq.m5.large"

# Storage
enable_cdn             = true
cloudfront_price_class = "PriceClass_All"

# Monitoring
enable_grafana = true

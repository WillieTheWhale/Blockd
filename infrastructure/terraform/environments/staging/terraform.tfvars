# Staging Environment Configuration
environment  = "staging"
aws_region   = "us-east-1"
cluster_name = "blockd-staging-cluster"

# Kubernetes Cluster
cluster_version    = "1.28"
node_instance_types = ["t3.large"]
node_desired_size  = 2
node_min_size      = 1
node_max_size      = 5

# Database
db_instance_class    = "db.t3.medium"
db_allocated_storage = 50
db_name             = "blockd_staging"
db_username         = "blockd_admin"

# Redis
redis_node_type       = "cache.t3.small"
redis_num_cache_nodes = 1

# RabbitMQ
rabbitmq_instance_type = "mq.t3.micro"

# Storage
enable_cdn             = true
cloudfront_price_class = "PriceClass_100"

# Monitoring
enable_grafana = true

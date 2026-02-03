# Security group for database access
resource "aws_security_group" "database" {
  name_prefix = "blockd-${var.environment}-database-"
  description = "Security group for database access"
  vpc_id      = var.vpc_id

  ingress {
    description = "PostgreSQL from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "blockd-${var.environment}-database"
    Environment = var.environment
  }
}

# Security group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "blockd-${var.environment}-redis-"
  description = "Security group for Redis access"
  vpc_id      = var.vpc_id

  ingress {
    description = "Redis from VPC"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "blockd-${var.environment}-redis"
    Environment = var.environment
  }
}

# Security group for RabbitMQ
resource "aws_security_group" "rabbitmq" {
  name_prefix = "blockd-${var.environment}-rabbitmq-"
  description = "Security group for RabbitMQ access"
  vpc_id      = var.vpc_id

  ingress {
    description = "AMQP from VPC"
    from_port   = 5671
    to_port     = 5671
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  ingress {
    description = "Management Console from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "blockd-${var.environment}-rabbitmq"
    Environment = var.environment
  }
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "blockd-${var.environment}-db-subnet"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "blockd-${var.environment}-db-subnet"
    Environment = var.environment
  }
}

# Generate random password for database
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"  # RDS doesn't allow '/', '@', '"', ' '
}

# Store database password in Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name = "blockd-${var.environment}-db-password"

  tags = {
    Name        = "blockd-${var.environment}-db-password"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "postgresql" {
  identifier     = "blockd-${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "16.11"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 2
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]

  multi_az               = var.environment == "production" ? true : false
  publicly_accessible    = false
  backup_retention_period = var.environment == "production" ? 30 : 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  # Performance Insights
  performance_insights_enabled    = true
  performance_insights_retention_period = 7

  # Automated backups
  copy_tags_to_snapshot = true
  skip_final_snapshot   = var.environment == "staging" ? true : false
  final_snapshot_identifier = var.environment == "production" ? "blockd-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  tags = {
    Name        = "blockd-${var.environment}-postgres"
    Environment = var.environment
  }
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "redis" {
  name       = "blockd-${var.environment}-redis-subnet"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "blockd-${var.environment}-redis-subnet"
    Environment = var.environment
  }
}

# Generate random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

# Store Redis auth token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_token" {
  name = "blockd-${var.environment}-redis-auth-token"

  tags = {
    Name        = "blockd-${var.environment}-redis-auth-token"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id     = aws_secretsmanager_secret.redis_auth_token.id
  secret_string = random_password.redis_auth_token.result
}

# ElastiCache Redis Replication Group
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "blockd-${var.environment}-redis"
  description          = "Redis cluster for Blockd ${var.environment}"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type

  num_cache_clusters = var.redis_num_cache_nodes
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result

  automatic_failover_enabled = var.environment == "production" ? true : false
  multi_az_enabled          = var.environment == "production" ? true : false

  snapshot_retention_limit = var.environment == "production" ? 7 : 1
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "sun:05:00-sun:07:00"

  auto_minor_version_upgrade = true

  tags = {
    Name        = "blockd-${var.environment}-redis"
    Environment = var.environment
  }
}

# Redis Parameter Group
resource "aws_elasticache_parameter_group" "redis" {
  name   = "blockd-${var.environment}-redis-params"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = {
    Name        = "blockd-${var.environment}-redis-params"
    Environment = var.environment
  }
}

# Generate random password for RabbitMQ
resource "random_password" "rabbitmq_password" {
  length  = 32
  special = false
}

# Store RabbitMQ password in Secrets Manager
resource "aws_secretsmanager_secret" "rabbitmq_password" {
  name = "blockd-${var.environment}-rabbitmq-password"

  tags = {
    Name        = "blockd-${var.environment}-rabbitmq-password"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "rabbitmq_password" {
  secret_id     = aws_secretsmanager_secret.rabbitmq_password.id
  secret_string = random_password.rabbitmq_password.result
}

# Amazon MQ RabbitMQ Broker
resource "aws_mq_broker" "rabbitmq" {
  broker_name = "blockd-${var.environment}-rabbitmq"
  engine_type        = "RabbitMQ"
  engine_version     = "3.13"
  host_instance_type = var.rabbitmq_instance_type

  deployment_mode = var.environment == "production" ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"

  user {
    username = "blockd"
    password = random_password.rabbitmq_password.result
  }

  subnet_ids         = var.environment == "production" ? var.private_subnet_ids : [var.private_subnet_ids[0]]
  security_groups    = [aws_security_group.rabbitmq.id]
  publicly_accessible = false

  encryption_options {
    use_aws_owned_key = false
    kms_key_id       = aws_kms_key.rabbitmq.arn
  }

  logs {
    general = true
  }

  auto_minor_version_upgrade = true

  tags = {
    Name        = "blockd-${var.environment}-rabbitmq"
    Environment = var.environment
  }
}

# KMS Key for RabbitMQ encryption
resource "aws_kms_key" "rabbitmq" {
  description             = "KMS key for RabbitMQ encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name        = "blockd-${var.environment}-rabbitmq-key"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "rabbitmq" {
  name          = "alias/blockd-${var.environment}-rabbitmq"
  target_key_id = aws_kms_key.rabbitmq.key_id
}

# Data source for VPC
data "aws_vpc" "selected" {
  id = var.vpc_id
}

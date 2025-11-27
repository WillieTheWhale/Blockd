output "db_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgresql.endpoint
  sensitive   = true
}

output "db_connection_string" {
  description = "Database connection string"
  value       = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.postgresql.endpoint}/${var.db_name}"
  sensitive   = true
}

output "db_password_secret_arn" {
  description = "ARN of the secret containing database password"
  value       = aws_secretsmanager_secret.db_password.arn
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "redis_connection_string" {
  description = "Redis connection string"
  value       = "rediss://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
  sensitive   = true
}

output "redis_auth_token_secret_arn" {
  description = "ARN of the secret containing Redis auth token"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
}

output "rabbitmq_endpoint" {
  description = "Amazon MQ RabbitMQ endpoint"
  value       = aws_mq_broker.rabbitmq.instances[0].endpoints[0]
  sensitive   = true
}

output "rabbitmq_console_url" {
  description = "RabbitMQ management console URL"
  value       = aws_mq_broker.rabbitmq.instances[0].console_url
}

output "rabbitmq_connection_string" {
  description = "RabbitMQ connection string"
  value       = "amqps://blockd:${random_password.rabbitmq_password.result}@${replace(aws_mq_broker.rabbitmq.instances[0].endpoints[0], "amqps://", "")}:5671"
  sensitive   = true
}

output "rabbitmq_password_secret_arn" {
  description = "ARN of the secret containing RabbitMQ password"
  value       = aws_secretsmanager_secret.rabbitmq_password.arn
}

output "database_security_group_id" {
  description = "Security group ID for database"
  value       = aws_security_group.database.id
}

output "redis_security_group_id" {
  description = "Security group ID for Redis"
  value       = aws_security_group.redis.id
}

output "rabbitmq_security_group_id" {
  description = "Security group ID for RabbitMQ"
  value       = aws_security_group.rabbitmq.id
}

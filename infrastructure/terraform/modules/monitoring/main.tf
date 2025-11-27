# Generate Grafana admin password
resource "random_password" "grafana_admin_password" {
  length  = 32
  special = false
}

# Store Grafana password in Secrets Manager
resource "aws_secretsmanager_secret" "grafana_admin_password" {
  name = "blockd-${var.environment}-grafana-admin-password"

  tags = {
    Name        = "blockd-${var.environment}-grafana-admin-password"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "grafana_admin_password" {
  secret_id     = aws_secretsmanager_secret.grafana_admin_password.id
  secret_string = random_password.grafana_admin_password.result
}

# Prometheus Helm Release
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "55.0.0"
  namespace  = "monitoring"

  create_namespace = true

  values = [
    templatefile("${path.module}/templates/prometheus-values.yaml", {
      environment = var.environment
    })
  ]

  set {
    name  = "prometheus.prometheusSpec.retention"
    value = "30d"
  }

  set {
    name  = "prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage"
    value = var.environment == "production" ? "100Gi" : "50Gi"
  }

  set_sensitive {
    name  = "grafana.adminPassword"
    value = random_password.grafana_admin_password.result
  }
}

# CloudWatch Log Group for application logs
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/eks/${var.cluster_name}/application"
  retention_in_days = 30

  tags = {
    Name        = "blockd-${var.environment}-application-logs"
    Environment = var.environment
  }
}

# CloudWatch Log Group for cluster logs
resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = 30

  tags = {
    Name        = "blockd-${var.environment}-cluster-logs"
    Environment = var.environment
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "blockd-${var.environment}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/EKS", "cluster_failed_node_count", { stat = "Average" }],
            [".", "cluster_node_count", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "EKS Cluster Health"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", { stat = "Average" }],
            [".", "DatabaseConnections", { stat = "Average" }],
            [".", "FreeableMemory", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "RDS Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", { stat = "Average" }],
            [".", "CurrConnections", { stat = "Average" }],
            [".", "DatabaseMemoryUsagePercentage", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "Redis Metrics"
        }
      }
    ]
  })
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "blockd-${var.environment}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EKS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "This metric monitors EKS cluster CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Name        = "blockd-${var.environment}-high-cpu"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "db_connections_high" {
  alarm_name          = "blockd-${var.environment}-db-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 100
  alarm_description   = "Database connections are high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Name        = "blockd-${var.environment}-db-connections-high"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_high" {
  alarm_name          = "blockd-${var.environment}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Redis memory usage is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Name        = "blockd-${var.environment}-redis-memory-high"
    Environment = var.environment
  }
}

# SNS Topic for alerts
resource "aws_sns_topic" "alerts" {
  name = "blockd-${var.environment}-alerts"

  tags = {
    Name        = "blockd-${var.environment}-alerts"
    Environment = var.environment
  }
}

# SNS Topic subscription (email)
resource "aws_sns_topic_subscription" "alerts_email" {
  count     = length(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_emails[count.index]
}

# Data sources
data "aws_region" "current" {}

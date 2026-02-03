output "prometheus_endpoint" {
  description = "Prometheus endpoint"
  value       = "http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090"
}

output "grafana_endpoint" {
  description = "Grafana endpoint"
  value       = var.enable_grafana ? "https://grafana-${var.environment}.blockd.site" : null
}

output "grafana_admin_password_secret_arn" {
  description = "ARN of the secret containing Grafana admin password"
  value       = aws_secretsmanager_secret.grafana_admin_password.arn
  sensitive   = true
}

output "sns_topic_arn" {
  description = "ARN of SNS topic for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.application.name
}

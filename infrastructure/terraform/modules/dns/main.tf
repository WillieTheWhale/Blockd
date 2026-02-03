# DNS and Certificate Management Module for Blockd
# Handles Route53, ACM, and WAF configuration

# Route53 Hosted Zone for blockd.site
resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = {
    Name        = "blockd-${var.environment}-zone"
    Environment = var.environment
  }
}

# ACM Certificate for blockd.site (must be in us-east-1 for CloudFront)
resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = [
    "*.${var.domain_name}",
    "www.${var.domain_name}",
    "api.${var.domain_name}",
    "app.${var.domain_name}",
    "ws.${var.domain_name}",
    "staging.${var.domain_name}",
    "api.staging.${var.domain_name}"
  ]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "blockd-${var.environment}-cert"
    Environment = var.environment
  }
}

# DNS validation records for ACM certificate
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}

# Certificate validation (skipped if DNS not yet configured)
resource "aws_acm_certificate_validation" "main" {
  count                   = var.skip_certificate_validation ? 0 : 1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# Local to determine if ALB is configured
locals {
  alb_configured = var.alb_dns_name != "" && var.alb_zone_id != ""
}

# A Record for root domain pointing to ALB/CloudFront
resource "aws_route53_record" "root" {
  count   = local.alb_configured ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# A Record for www subdomain
resource "aws_route53_record" "www" {
  count   = local.alb_configured ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# A Record for api subdomain
resource "aws_route53_record" "api" {
  count   = local.alb_configured ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# A Record for app subdomain
resource "aws_route53_record" "app" {
  count   = local.alb_configured ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# A Record for ws (WebSocket) subdomain
resource "aws_route53_record" "ws" {
  count   = local.alb_configured ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "ws.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# Staging subdomain (only in staging environment with ALB configured)
resource "aws_route53_record" "staging" {
  count   = var.environment == "staging" && local.alb_configured ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "staging.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# Staging API subdomain (only in staging environment with ALB configured)
resource "aws_route53_record" "staging_api" {
  count   = var.environment == "staging" && local.alb_configured ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.staging.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# Health check for production (only when ALB is configured)
resource "aws_route53_health_check" "api" {
  count             = var.environment == "production" && local.alb_configured ? 1 : 0
  fqdn              = "api.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/v1/health"
  failure_threshold = 3
  request_interval  = 30

  tags = {
    Name        = "blockd-${var.environment}-api-health"
    Environment = var.environment
  }
}

# CloudWatch alarm for health check (only when ALB is configured)
resource "aws_cloudwatch_metric_alarm" "health_check" {
  count               = var.environment == "production" && local.alb_configured ? 1 : 0
  alarm_name          = "blockd-${var.environment}-api-health-alarm"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthCheckStatus"
  namespace           = "AWS/Route53"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  alarm_description   = "API health check failed"

  dimensions = {
    HealthCheckId = aws_route53_health_check.api[0].id
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  ok_actions    = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = {
    Name        = "blockd-${var.environment}-health-alarm"
    Environment = var.environment
  }
}

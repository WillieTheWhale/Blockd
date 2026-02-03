variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "blockd.site"
}

variable "alb_dns_name" {
  description = "DNS name of the Application Load Balancer (optional - A records created only when provided)"
  type        = string
  default     = ""
}

variable "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer (optional - A records created only when provided)"
  type        = string
  default     = ""
}

variable "skip_certificate_validation" {
  description = "Skip ACM certificate validation (use when DNS not yet configured)"
  type        = bool
  default     = false
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for health check alarms"
  type        = string
  default     = ""
}

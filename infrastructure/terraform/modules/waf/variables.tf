variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "scope" {
  description = "WAF scope (REGIONAL for ALB, CLOUDFRONT for CloudFront)"
  type        = string
  default     = "REGIONAL"
  validation {
    condition     = contains(["REGIONAL", "CLOUDFRONT"], var.scope)
    error_message = "Scope must be either REGIONAL or CLOUDFRONT."
  }
}

variable "rate_limit" {
  description = "Rate limit for requests per 5-minute period per IP"
  type        = number
  default     = 2000
}

variable "enable_bot_control" {
  description = "Enable AWS Bot Control managed rule group (additional cost)"
  type        = bool
  default     = false
}

variable "blocked_country_codes" {
  description = "List of country codes to block"
  type        = list(string)
  default     = []
}

variable "enable_logging" {
  description = "Enable WAF logging to CloudWatch"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain WAF logs"
  type        = number
  default     = 30
}

variable "blocked_requests_threshold" {
  description = "Threshold for blocked requests alarm"
  type        = number
  default     = 1000
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for WAF alarms"
  type        = string
  default     = ""
}

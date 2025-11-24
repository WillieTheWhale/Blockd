output "videos_bucket_name" {
  description = "S3 bucket name for videos"
  value       = aws_s3_bucket.videos.id
}

output "videos_bucket_arn" {
  description = "S3 bucket ARN for videos"
  value       = aws_s3_bucket.videos.arn
}

output "videos_bucket_domain_name" {
  description = "S3 bucket domain name for videos"
  value       = aws_s3_bucket.videos.bucket_regional_domain_name
}

output "backups_bucket_name" {
  description = "S3 bucket name for backups"
  value       = aws_s3_bucket.backups.id
}

output "backups_bucket_arn" {
  description = "S3 bucket ARN for backups"
  value       = aws_s3_bucket.backups.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = var.enable_cdn ? aws_cloudfront_distribution.videos[0].id : null
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name"
  value       = var.enable_cdn ? aws_cloudfront_distribution.videos[0].domain_name : null
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = var.enable_cdn ? aws_cloudfront_distribution.videos[0].arn : null
}

output "kms_key_id" {
  description = "KMS key ID for S3 encryption"
  value       = aws_kms_key.s3.id
}

output "kms_key_arn" {
  description = "KMS key ARN for S3 encryption"
  value       = aws_kms_key.s3.arn
}

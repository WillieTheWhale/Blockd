variable "environment" {
  description = "Environment name"
  type        = string
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "node_instance_types" {
  description = "Instance types for nodes"
  type        = list(string)
}

variable "node_desired_size" {
  description = "Desired number of nodes"
  type        = number
}

variable "node_min_size" {
  description = "Minimum number of nodes"
  type        = number
}

variable "node_max_size" {
  description = "Maximum number of nodes"
  type        = number
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "List of CIDR blocks allowed to access the EKS API. Use VPN/office IPs for production."
  type        = list(string)
  default     = []
}

variable "enable_irsa" {
  description = "Enable IAM Roles for Service Accounts"
  type        = bool
  default     = true
}

variable "service_account_roles" {
  description = "Map of service account names to their IAM role configurations"
  type = map(object({
    namespace       = string
    policy_arns     = list(string)
    inline_policies = optional(map(string), {})
  }))
  default = {}
}

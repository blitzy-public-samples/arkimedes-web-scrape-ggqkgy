# Terraform AWS Variables Configuration
# Version: ~> 1.5

# Region Configuration
variable "aws_region" {
  description = "AWS region for infrastructure deployment with multi-AZ support"
  type        = string
  default     = "us-west-2"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-\\d{1}$", var.aws_region))
    error_message = "AWS region must be in format: us-west-2, eu-central-1, etc."
  }
}

# Environment Configuration
variable "environment" {
  description = "Deployment environment name for resource isolation and configuration"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# Project Configuration
variable "project_name" {
  description = "Project name for consistent resource naming and tagging"
  type        = string
  default     = "web-scraping-platform"
}

# Network Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC network segmentation"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# EKS Configuration
variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster, must be 1.27 or higher"
  type        = string
  default     = "1.27"

  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])$", var.eks_cluster_version))
    error_message = "EKS cluster version must be 1.27 or higher"
  }
}

variable "eks_node_instance_types" {
  description = "Instance types for EKS worker nodes with performance optimization"
  type        = list(string)
  default     = ["t3.large", "t3.xlarge"]

  validation {
    condition     = length(var.eks_node_instance_types) > 0
    error_message = "At least one instance type must be specified"
  }
}

variable "eks_desired_nodes" {
  description = "Desired number of EKS worker nodes for normal operation"
  type        = number
  default     = 3

  validation {
    condition     = var.eks_desired_nodes >= var.eks_min_nodes && var.eks_desired_nodes <= var.eks_max_nodes
    error_message = "Desired nodes must be between min and max nodes"
  }
}

variable "eks_min_nodes" {
  description = "Minimum number of EKS worker nodes for high availability"
  type        = number
  default     = 2

  validation {
    condition     = var.eks_min_nodes >= 2
    error_message = "Minimum nodes must be at least 2 for high availability"
  }
}

variable "eks_max_nodes" {
  description = "Maximum number of EKS worker nodes for scaling limits"
  type        = number
  default     = 5

  validation {
    condition     = var.eks_max_nodes >= var.eks_min_nodes
    error_message = "Maximum nodes must be greater than or equal to minimum nodes"
  }
}

# RDS Configuration
variable "rds_instance_class" {
  description = "Instance class for RDS PostgreSQL with performance optimization"
  type        = string
  default     = "db.r6g.xlarge"

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.rds_instance_class))
    error_message = "RDS instance class must be valid AWS RDS instance type"
  }
}

variable "rds_backup_retention_days" {
  description = "Number of days to retain RDS automated backups"
  type        = number
  default     = 30

  validation {
    condition     = var.rds_backup_retention_days >= 7 && var.rds_backup_retention_days <= 35
    error_message = "Backup retention must be between 7 and 35 days"
  }
}

# DocumentDB Configuration
variable "documentdb_instance_class" {
  description = "Instance class for DocumentDB cluster nodes"
  type        = string
  default     = "db.r6g.large"

  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z0-9]+$", var.documentdb_instance_class))
    error_message = "DocumentDB instance class must be valid AWS DocumentDB instance type"
  }
}

# ElastiCache Configuration
variable "elasticache_node_type" {
  description = "Node type for ElastiCache Redis cluster with performance optimization"
  type        = string
  default     = "cache.r6g.large"

  validation {
    condition     = can(regex("^cache\\.[a-z0-9]+\\.[a-z0-9]+$", var.elasticache_node_type))
    error_message = "ElastiCache node type must be valid AWS ElastiCache node type"
  }
}

# State Management Configuration
variable "state_bucket" {
  description = "S3 bucket name for secure Terraform state storage"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.state_bucket))
    error_message = "S3 bucket name must be valid and DNS-compatible"
  }
}

variable "state_lock_table" {
  description = "DynamoDB table name for Terraform state locking"
  type        = string

  validation {
    condition     = can(regex("^[a-zA-Z0-9_.-]+$", var.state_lock_table))
    error_message = "DynamoDB table name must contain only alphanumeric characters and symbols: _.-"
  }
}
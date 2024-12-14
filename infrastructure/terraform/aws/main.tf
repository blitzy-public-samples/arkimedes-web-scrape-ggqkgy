# Main Terraform configuration for Web Scraping Platform
# Version: 1.5.0+
# Provider versions:
# - hashicorp/aws ~> 5.0
# - hashicorp/random ~> 3.5

terraform {
  # Enforce minimum Terraform version for stability and feature support
  required_version = ">= 1.5.0"

  # Configure required providers with strict version constraints
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Configure secure remote state backend with encryption and locking
  backend "s3" {
    bucket         = var.state_bucket
    key            = "${var.environment}/terraform.tfstate"
    region         = var.aws_region
    encrypt        = true
    dynamodb_table = var.state_lock_table
    
    # Enhanced security features
    versioning     = true
    access_logging = true
    
    # Server-side encryption configuration
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm = "aws:kms"
        }
      }
    }
  }
}

# Configure AWS Provider with default tags and region
provider "aws" {
  region = var.aws_region

  # Default tags applied to all resources
  default_tags {
    tags = {
      Environment       = var.environment
      Project          = "web-scraping-platform"
      ManagedBy        = "terraform"
      SecurityLevel    = "high"
      BackupEnabled    = "true"
      MonitoringEnabled = "true"
      LastUpdated      = timestamp()
    }
  }
}

# Random provider for generating unique identifiers
provider "random" {}

# Generate unique identifier for resource naming
resource "random_id" "unique" {
  byte_length = 8
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# Data source for available AWS availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Local variables for resource naming and tagging
locals {
  account_id = data.aws_caller_identity.current.account_id
  resource_prefix = "${var.environment}-${var.project_name}"
  common_tags = {
    AccountID     = local.account_id
    ResourceGroup = local.resource_prefix
  }
}

# Output configuration values for cross-module reference
output "aws_region" {
  description = "The AWS region used for infrastructure deployment"
  value       = var.aws_region
}

output "environment" {
  description = "The environment name used for resource tagging"
  value       = var.environment
}

output "backend_config" {
  description = "Backend configuration details for state management"
  value = {
    state_bucket     = var.state_bucket
    state_lock_table = var.state_lock_table
    region          = var.aws_region
  }
  sensitive = true
}

# Import and reference core infrastructure modules
module "vpc" {
  source = "./modules/vpc"
  
  aws_region     = var.aws_region
  environment    = var.environment
  vpc_cidr       = var.vpc_cidr
  resource_prefix = local.resource_prefix
  
  tags = local.common_tags
}

module "eks" {
  source = "./modules/eks"
  
  depends_on = [module.vpc]
  
  cluster_name    = "${local.resource_prefix}-eks"
  cluster_version = var.eks_cluster_version
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  
  node_groups = {
    default = {
      desired_size = var.eks_desired_nodes
      min_size     = var.eks_min_nodes
      max_size     = var.eks_max_nodes
      instance_types = var.eks_node_instance_types
    }
  }
  
  tags = local.common_tags
}

# Configure AWS CloudWatch for centralized logging
resource "aws_cloudwatch_log_group" "platform_logs" {
  name              = "/${local.resource_prefix}/platform-logs"
  retention_in_days = 30
  
  tags = local.common_tags
}

# Configure AWS KMS for encryption
resource "aws_kms_key" "platform_key" {
  description             = "KMS key for ${local.resource_prefix} encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = local.common_tags
}

# Configure AWS Backup for automated backups
resource "aws_backup_vault" "platform_backup" {
  name = "${local.resource_prefix}-backup-vault"
  kms_key_arn = aws_kms_key.platform_key.arn
  
  tags = local.common_tags
}

# Configure AWS Config for compliance monitoring
resource "aws_config_configuration_recorder" "platform_config" {
  name     = "${local.resource_prefix}-config"
  role_arn = aws_iam_role.config_role.arn
  
  recording_group {
    all_supported = true
    include_global_resources = true
  }
}
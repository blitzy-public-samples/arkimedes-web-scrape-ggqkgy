# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Network Infrastructure Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

# EKS Cluster Outputs
output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "Endpoint for the EKS cluster API server"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_security_group_id" {
  description = "Security group ID for the EKS cluster"
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}

# RDS Database Outputs
output "rds_cluster_endpoint" {
  description = "Writer endpoint for the RDS cluster"
  value       = aws_db_instance.main.endpoint
}

output "rds_cluster_reader_endpoint" {
  description = "Reader endpoint for the RDS cluster"
  value       = aws_db_instance.main.endpoint
}

output "rds_security_group_id" {
  description = "Security group ID for the RDS cluster"
  value       = aws_security_group.rds.id
}

# KMS Key ARNs
output "kms_key_arns" {
  description = "Map of KMS key ARNs for different services"
  value = {
    rds = aws_kms_key.rds.arn
    eks = aws_kms_key.eks.arn
    ebs = aws_kms_key.ebs.arn
  }
  sensitive = true
}

# CloudWatch Log Group ARNs
output "cloudwatch_log_group_arns" {
  description = "Map of CloudWatch log group ARNs"
  value = {
    eks = aws_cloudwatch_log_group.eks.arn
    rds = aws_cloudwatch_log_group.flow_logs.arn
    vpc = aws_cloudwatch_log_group.vpc.arn
  }
}

# IAM Role ARNs for Monitoring
output "monitoring_role_arns" {
  description = "Map of IAM role ARNs for monitoring"
  value = {
    eks = aws_iam_role.eks_cluster.arn
    rds = aws_iam_role.rds_monitoring.arn
  }
  sensitive = true
}

# Environment Information
output "aws_region" {
  description = "Current AWS region"
  value       = data.aws_region.current.name
}

output "environment" {
  description = "Deployment environment name"
  value       = var.environment
}

# Additional Security Outputs
output "eks_cluster_certificate_authority" {
  description = "Certificate authority data for EKS cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "eks_oidc_provider_url" {
  description = "OpenID Connect provider URL for EKS"
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

# Database Configuration
output "rds_instance_class" {
  description = "RDS instance class being used"
  value       = aws_db_instance.main.instance_class
}

output "rds_backup_retention_period" {
  description = "Backup retention period for RDS in days"
  value       = aws_db_instance.main.backup_retention_period
}

# Network Configuration
output "vpc_cidr" {
  description = "CIDR block for the VPC"
  value       = aws_vpc.main.cidr_block
}

output "nat_gateway_ips" {
  description = "List of NAT Gateway public IPs"
  value       = aws_eip.nat[*].public_ip
}
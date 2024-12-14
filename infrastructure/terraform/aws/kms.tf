# AWS KMS Configuration for Web Scraping Platform
# Provider Version: hashicorp/aws ~> 5.0

# EKS Secrets Encryption Key
resource "aws_kms_key" "eks_secrets_key" {
  description              = "KMS key for EKS cluster secrets encryption with automated rotation"
  deletion_window_in_days  = 30
  enable_key_rotation     = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage               = "ENCRYPT_DECRYPT"
  
  # Enable automatic key rotation every 365 days
  rotation_enabled        = true
  
  # Enable detailed CloudWatch logging
  enable_key_rotation     = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${var.environment}-eks-secrets-key"
    Purpose     = "EKS Secrets Encryption"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# RDS Database Encryption Key
resource "aws_kms_key" "rds_encryption_key" {
  description              = "KMS key for RDS database encryption with automated rotation"
  deletion_window_in_days  = 30
  enable_key_rotation     = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage               = "ENCRYPT_DECRYPT"
  
  # Enable automatic key rotation every 365 days
  rotation_enabled        = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow RDS Service"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${var.environment}-rds-encryption-key"
    Purpose     = "RDS Database Encryption"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# S3 Data Encryption Key
resource "aws_kms_key" "s3_encryption_key" {
  description              = "KMS key for S3 bucket encryption with automated rotation"
  deletion_window_in_days  = 30
  enable_key_rotation     = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage               = "ENCRYPT_DECRYPT"
  
  # Enable automatic key rotation every 365 days
  rotation_enabled        = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${var.environment}-s3-encryption-key"
    Purpose     = "S3 Data Encryption"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Key Aliases for better usability and management
resource "aws_kms_alias" "eks_secrets_key_alias" {
  name          = "alias/${var.environment}-eks-secrets"
  target_key_id = aws_kms_key.eks_secrets_key.key_id
}

resource "aws_kms_alias" "rds_encryption_key_alias" {
  name          = "alias/${var.environment}-rds-encryption"
  target_key_id = aws_kms_key.rds_encryption_key.key_id
}

resource "aws_kms_alias" "s3_encryption_key_alias" {
  name          = "alias/${var.environment}-s3-encryption"
  target_key_id = aws_kms_key.s3_encryption_key.key_id
}

# Output the KMS key ARNs for use in other resources
output "eks_secrets_key_arn" {
  description = "ARN of the KMS key used for EKS secrets encryption"
  value       = aws_kms_key.eks_secrets_key.arn
}

output "rds_encryption_key_arn" {
  description = "ARN of the KMS key used for RDS database encryption"
  value       = aws_kms_key.rds_encryption_key.arn
}

output "s3_encryption_key_arn" {
  description = "ARN of the KMS key used for S3 data encryption"
  value       = aws_kms_key.s3_encryption_key.arn
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}
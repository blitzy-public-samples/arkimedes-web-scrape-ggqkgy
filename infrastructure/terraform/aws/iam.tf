# AWS IAM Configuration for Web Scraping Platform
# Version: ~> 5.0

# Import required provider and variables
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for consistent naming and tagging
locals {
  eks_cluster_role_name           = "${var.project_name}-${var.environment}-eks-cluster-role"
  eks_node_role_name             = "${var.project_name}-${var.environment}-eks-node-role"
  eks_service_account_role_name   = "${var.project_name}-${var.environment}-eks-sa-role"
  common_tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = var.project_name
  }
}

# EKS Cluster IAM Role
data "aws_iam_policy_document" "eks_cluster_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:eks:${var.aws_region}:${data.aws_caller_identity.current.account_id}:cluster/*"]
    }
  }
}

resource "aws_iam_role" "eks_cluster" {
  name                 = local.eks_cluster_role_name
  assume_role_policy   = data.aws_iam_policy_document.eks_cluster_assume_role.json
  managed_policy_arns  = [
    "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
    "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController",
    "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
    "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
  ]
  force_detach_policies = true
  max_session_duration  = 3600
  tags                  = local.common_tags
}

# EKS Node IAM Role
data "aws_iam_policy_document" "eks_node_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "eks_node" {
  name                 = local.eks_node_role_name
  assume_role_policy   = data.aws_iam_policy_document.eks_node_assume_role.json
  managed_policy_arns  = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
  ]
  force_detach_policies = true
  max_session_duration  = 3600
  tags                  = local.common_tags
}

# EKS Service Account IAM Role
data "aws_iam_policy_document" "eks_service_account_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }
    actions = ["sts:AssumeRoleWithWebIdentity"]
    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub"
      values   = ["system:serviceaccount:*:*"]
    }
    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

# S3 access policy for service accounts
data "aws_iam_policy_document" "s3_access" {
  statement {
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket"
    ]
    resources = [
      "arn:aws:s3:::${var.project_name}-${var.environment}-*",
      "arn:aws:s3:::${var.project_name}-${var.environment}-*/*"
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.environment]
    }
  }
}

# Secrets access policy for service accounts
data "aws_iam_policy_document" "secrets_access" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}-${var.environment}-*"
    ]
  }
}

resource "aws_iam_role" "eks_service_account" {
  name                 = local.eks_service_account_role_name
  assume_role_policy   = data.aws_iam_policy_document.eks_service_account_assume_role.json
  force_detach_policies = true
  max_session_duration  = 3600
  tags                  = local.common_tags

  inline_policy {
    name   = "s3-access"
    policy = data.aws_iam_policy_document.s3_access.json
  }

  inline_policy {
    name   = "secrets-access"
    policy = data.aws_iam_policy_document.secrets_access.json
  }

  inline_policy {
    name = "monitoring-access"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "cloudwatch:PutMetricData",
            "cloudwatch:GetMetricData",
            "cloudwatch:ListMetrics"
          ]
          Resource = "*"
          Condition = {
            StringEquals = {
              "aws:RequestTag/Environment" = var.environment
            }
          }
        }
      ]
    })
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Outputs for cross-stack reference
output "eks_cluster_role_arn" {
  description = "ARN of EKS cluster IAM role"
  value       = aws_iam_role.eks_cluster.arn
}

output "eks_node_role_arn" {
  description = "ARN of EKS node IAM role"
  value       = aws_iam_role.eks_node.arn
}

output "eks_service_account_role_arn" {
  description = "ARN of EKS service account IAM role"
  value       = aws_iam_role.eks_service_account.arn
}
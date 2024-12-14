# AWS S3 Configuration for Web Scraping Platform
# Provider version: ~> 5.0

# Primary data storage bucket for scraped content
resource "aws_s3_bucket" "data" {
  bucket        = "${var.environment}-${var.project_name}-data"
  force_destroy = false

  tags = {
    Name               = "${var.environment}-${var.project_name}-data"
    Environment        = var.environment
    Purpose           = "Scraped data storage"
    Encryption        = "KMS"
    DataClassification = "Confidential"
    ManagedBy         = "Terraform"
  }
}

# Enable versioning for data protection and recovery
resource "aws_s3_bucket_versioning" "data_versioning" {
  bucket = aws_s3_bucket.data.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Configure server-side encryption using KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "data_encryption" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = data.aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Implement lifecycle rules for tiered storage
resource "aws_s3_bucket_lifecycle_configuration" "data_lifecycle" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "transition_to_ia"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "transition_to_glacier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "cleanup_old_versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Block all public access for security
resource "aws_s3_bucket_public_access_block" "data_public_access" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Configure CORS for API access
resource "aws_s3_bucket_cors_configuration" "data_cors" {
  bucket = aws_s3_bucket.data.id

  cors_rule {
    allowed_headers = ["Authorization", "Content-Length"]
    allowed_methods = ["GET", "POST", "PUT"]
    allowed_origins = ["https://*.${var.project_name}.com"]
    max_age_seconds = 3600
  }
}

# Implement bucket policy for secure access
resource "aws_s3_bucket_policy" "data_bucket_policy" {
  bucket = aws_s3_bucket.data.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceSSLOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.data.arn,
          "${aws_s3_bucket.data.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# Export bucket information for other modules
output "data_bucket_name" {
  description = "Name of the data storage S3 bucket"
  value       = aws_s3_bucket.data.id
}

output "data_bucket_arn" {
  description = "ARN of the data storage S3 bucket"
  value       = aws_s3_bucket.data.arn
}
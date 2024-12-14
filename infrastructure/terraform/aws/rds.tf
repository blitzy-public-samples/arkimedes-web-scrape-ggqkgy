# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# RDS Subnet Group for Multi-AZ deployment
resource "aws_db_subnet_group" "main" {
  name        = "${var.environment}-rds-subnet-group"
  description = "RDS subnet group for ${var.environment} PostgreSQL database"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name        = "${var.environment}-rds-subnet-group"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# RDS Parameter Group for PostgreSQL optimization
resource "aws_db_parameter_group" "main" {
  family      = "postgres15"
  name        = "${var.environment}-postgres-params"
  description = "Custom parameter group for Web Scraping Platform"

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4}"
  }

  parameter {
    name  = "work_mem"
    value = "16384"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152"
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory*3/4}"
  }

  parameter {
    name  = "ssl"
    value = "1"
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Role for Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.environment}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Attach Enhanced Monitoring Policy
resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# RDS Instance with Multi-AZ, Encryption, and Enhanced Monitoring
resource "aws_db_instance" "main" {
  identifier     = "${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.rds_instance_class

  # Storage Configuration
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type         = "gp3"
  storage_encrypted    = true

  # Database Configuration
  db_name  = "scraping_platform"
  username = "admin"
  # Password should be managed through AWS Secrets Manager
  manage_master_user_password = true

  # High Availability Configuration
  multi_az               = true
  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  # Security Configuration
  deletion_protection       = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "${var.environment}-postgres-final"
  publicly_accessible      = false

  # Monitoring Configuration
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports      = ["postgresql", "upgrade"]

  # Maintenance Configuration
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot     = true

  tags = {
    Name        = "${var.environment}-postgres"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Outputs for application configuration
output "rds_endpoint" {
  description = "The connection endpoint for the RDS instance"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "The port number for the RDS instance"
  value       = aws_db_instance.main.port
}

output "rds_resource_id" {
  description = "The RDS Resource ID for monitoring configuration"
  value       = aws_db_instance.main.resource_id
}
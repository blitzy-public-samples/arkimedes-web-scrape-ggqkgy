# AWS DocumentDB Configuration
# Provider version: ~> 5.0

# KMS Key for DocumentDB encryption
resource "aws_kms_key" "docdb" {
  description             = "KMS key for DocumentDB encryption"
  deletion_window_in_days = 30
  enable_key_rotation    = true

  tags = {
    Name        = "${var.environment}-docdb-kms"
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

# Random password generation for DocumentDB master user
resource "random_password" "docdb" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store the password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "docdb_master" {
  name        = "${var.environment}/docdb/master"
  description = "DocumentDB master user credentials"
  kms_key_id  = aws_kms_key.docdb.arn

  tags = {
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "docdb_master" {
  secret_id = aws_secretsmanager_secret.docdb_master.id
  secret_string = jsonencode({
    username = "docdbadmin"
    password = random_password.docdb.result
  })
}

# Security group for DocumentDB
resource "aws_security_group" "docdb" {
  name        = "${var.environment}-docdb-sg"
  description = "Security group for DocumentDB cluster"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
    description     = "Allow MongoDB protocol access from application"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name        = "${var.environment}-docdb-sg"
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

# DocumentDB subnet group
resource "aws_docdb_subnet_group" "main" {
  name        = "${var.environment}-docdb-subnet-group"
  description = "DocumentDB subnet group"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name        = "${var.environment}-docdb-subnet-group"
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

# DocumentDB cluster parameter group
resource "aws_docdb_cluster_parameter_group" "main" {
  family      = "docdb5.0"
  name        = "${var.environment}-docdb-params"
  description = "Custom parameter group for DocumentDB cluster"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  parameter {
    name  = "ttl_monitor"
    value = "enabled"
  }

  tags = {
    Name        = "${var.environment}-docdb-params"
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

# IAM role for enhanced monitoring
resource "aws_iam_role" "docdb_monitoring" {
  name = "${var.environment}-docdb-monitoring-role"

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
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "docdb_monitoring" {
  role       = aws_iam_role.docdb_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# DocumentDB cluster
resource "aws_docdb_cluster" "main" {
  cluster_identifier              = "${var.environment}-docdb"
  engine                         = "docdb"
  engine_version                 = "5.0.0"
  master_username                = "docdbadmin"
  master_password                = random_password.docdb.result
  backup_retention_period        = 30
  preferred_backup_window        = "02:00-04:00"
  preferred_maintenance_window   = "sun:04:00-sun:08:00"
  skip_final_snapshot           = false
  final_snapshot_identifier     = "${var.environment}-docdb-final-snapshot"
  storage_encrypted             = true
  kms_key_id                    = aws_kms_key.docdb.arn
  vpc_security_group_ids        = [aws_security_group.docdb.id]
  db_subnet_group_name          = aws_docdb_subnet_group.main.name
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name
  enabled_cloudwatch_logs_exports = ["audit", "profiler"]
  deletion_protection           = true
  apply_immediately             = false

  tags = {
    Name        = "${var.environment}-docdb-cluster"
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

# DocumentDB cluster instances
resource "aws_docdb_cluster_instance" "main" {
  count              = 3
  identifier         = "${var.environment}-docdb-${count.index}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.documentdb_instance_class
  
  auto_minor_version_upgrade = true
  promotion_tier            = count.index
  
  monitoring_interval = 30
  monitoring_role_arn = aws_iam_role.docdb_monitoring.arn

  tags = {
    Name        = "${var.environment}-docdb-instance-${count.index}"
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }
}

# Outputs
output "docdb_cluster_endpoint" {
  description = "DocumentDB cluster endpoint"
  value       = aws_docdb_cluster.main.endpoint
}

output "docdb_cluster_reader_endpoint" {
  description = "DocumentDB cluster reader endpoint"
  value       = aws_docdb_cluster.main.reader_endpoint
}

output "docdb_cluster_resource_id" {
  description = "DocumentDB cluster resource ID"
  value       = aws_docdb_cluster.main.cluster_resource_id
}
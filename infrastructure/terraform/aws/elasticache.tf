# AWS ElastiCache Redis Configuration
# Provider version: ~> 5.0

# Redis Subnet Group
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.environment}-redis-subnet-group"
  subnet_ids  = var.private_subnet_ids
  description = "Private subnet group for Redis cluster in ${var.environment}"

  tags = {
    Name        = "${var.environment}-redis-subnet-group"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "redis-cache"
  }
}

# Redis Parameter Group with optimized settings
resource "aws_elasticache_parameter_group" "redis" {
  family      = "redis7"
  name        = "${var.environment}-redis-params"
  description = "Optimized Redis parameter group for ${var.environment}"

  # Performance and reliability optimizations
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "redis-cache"
  }
}

# Redis Replication Group (Cluster)
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.environment}-redis-cluster"
  description         = "Highly available Redis cluster for ${var.environment}"
  
  # Node configuration
  node_type                  = var.elasticache_node_type
  num_cache_clusters         = 3
  port                      = 6379
  
  # Network configuration
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  parameter_group_name       = aws_elasticache_parameter_group.redis.name
  
  # High availability settings
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  # Engine configuration
  engine                    = "redis"
  engine_version           = "7.0"
  
  # Security settings
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled        = true
  
  # Maintenance and backup
  maintenance_window        = "sun:05:00-sun:07:00"
  snapshot_window          = "03:00-05:00"
  snapshot_retention_limit = 7
  auto_minor_version_upgrade = true
  
  # Deployment configuration
  apply_immediately        = false
  
  # Monitoring
  notification_topic_arn   = var.sns_topic_arn

  tags = {
    Name             = "${var.environment}-redis-cluster"
    Environment      = var.environment
    ManagedBy        = "terraform"
    Purpose          = "redis-cache"
    BackupRetention  = "7days"
    HighAvailability = "enabled"
  }
}

# Outputs for service discovery and configuration
output "redis_endpoint" {
  description = "Redis primary endpoint address for application configuration"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port number for application configuration"
  value       = aws_elasticache_replication_group.redis.port
}

output "redis_configuration" {
  description = "Redis configuration endpoint for cluster operations"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
}
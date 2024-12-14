# AWS CloudWatch Configuration for Web Scraping Platform
# Provider version: ~> 5.0

locals {
  # Common tags for all CloudWatch resources
  common_tags = {
    Environment = var.environment
    Project     = "web-scraping-platform"
    ManagedBy   = "terraform"
  }

  # Environment-specific log retention periods
  log_retention_days = {
    dev     = 14
    staging = 30
    prod    = 90
  }

  # Metric alarm thresholds
  alarm_thresholds = {
    cpu_utilization    = 80
    memory_utilization = 85
    error_rate         = 5
    api_latency_ms     = 1000
    db_connections     = 85
  }
}

# Log Groups
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/webscraper/${var.environment}/application"
  retention_in_days = lookup(local.log_retention_days, var.environment, 30)
  kms_key_id       = aws_kms_key.cloudwatch.arn

  tags = merge(local.common_tags, {
    LogType = "Application"
  })
}

resource "aws_cloudwatch_log_group" "system" {
  name              = "/aws/webscraper/${var.environment}/system"
  retention_in_days = lookup(local.log_retention_days, var.environment, 30)
  kms_key_id       = aws_kms_key.cloudwatch.arn

  tags = merge(local.common_tags, {
    LogType = "System"
  })
}

resource "aws_cloudwatch_log_group" "audit" {
  name              = "/aws/webscraper/${var.environment}/audit"
  retention_in_days = lookup(local.log_retention_days, var.environment, 90)
  kms_key_id       = aws_kms_key.cloudwatch.arn

  tags = merge(local.common_tags, {
    LogType = "Audit"
  })
}

# Metric Alarms
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${var.environment}-high-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "CPUUtilization"
  namespace          = "AWS/EKS"
  period             = 300
  statistic          = "Average"
  threshold          = local.alarm_thresholds.cpu_utilization
  alarm_description  = "High CPU utilization in EKS cluster"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = data.aws_eks_cluster.main.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "error_rate" {
  alarm_name          = "${var.environment}-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "ErrorRate"
  namespace          = "WebScraperPlatform"
  period             = 300
  statistic          = "Average"
  threshold          = local.alarm_thresholds.error_rate
  alarm_description  = "High error rate in scraping operations"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${var.environment}-high-api-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name        = "APILatency"
  namespace          = "WebScraperPlatform"
  period             = 300
  statistic          = "p95"
  threshold          = local.alarm_thresholds.api_latency_ms
  alarm_description  = "High API latency detected"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]

  tags = local.common_tags
}

# Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.environment}-webscraper-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/EKS", "CPUUtilization", "ClusterName", data.aws_eks_cluster.main.name],
            [".", "MemoryUtilization", ".", "."]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "EKS Cluster Resource Utilization"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["WebScraperPlatform", "ErrorRate"],
            [".", "APILatency"]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Application Performance"
        }
      }
    ]
  })
}

# Container Insights
resource "aws_cloudwatch_log_group" "container_insights" {
  name              = "/aws/containerinsights/${var.environment}/performance"
  retention_in_days = lookup(local.log_retention_days, var.environment, 30)
  kms_key_id       = aws_kms_key.cloudwatch.arn

  tags = merge(local.common_tags, {
    LogType = "ContainerInsights"
  })
}

# Outputs
output "log_group_names" {
  description = "CloudWatch Log Group names for application configuration"
  value = {
    application_log_group = aws_cloudwatch_log_group.application.name
    system_log_group     = aws_cloudwatch_log_group.system.name
    audit_log_group      = aws_cloudwatch_log_group.audit.name
  }
}

output "alarm_arns" {
  description = "CloudWatch Alarm ARNs for notification configuration"
  value = {
    critical_alarms = [
      aws_cloudwatch_metric_alarm.cpu_utilization.arn,
      aws_cloudwatch_metric_alarm.error_rate.arn
    ]
    warning_alarms = [
      aws_cloudwatch_metric_alarm.api_latency.arn
    ]
  }
}

output "dashboard_arns" {
  description = "CloudWatch Dashboard ARNs for access management"
  value = {
    system_dashboards = [aws_cloudwatch_dashboard.main.dashboard_arn]
  }
}
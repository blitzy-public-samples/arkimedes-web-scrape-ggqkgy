# AWS Route53 Configuration for Web Scraping Platform
# Provider version: hashicorp/aws ~> 5.0

# Primary Hosted Zone Configuration
resource "aws_route53_zone" "main" {
  name              = var.domain_name
  comment           = "Managed by Terraform - Web Scraping Platform"
  force_destroy     = false
  
  # Enable DNSSEC for enhanced security
  dnssec_config {
    signing_enabled = true
  }

  tags = {
    Name          = "${var.project_name}-${var.environment}-zone"
    Environment   = var.environment
    ManagedBy     = "Terraform"
    SecurityLevel = "High"
    CostCenter    = "Infrastructure"
  }
}

# Primary Web Application A Record with Failover Configuration
resource "aws_route53_record" "web_app_primary" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.environment}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id               = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  failover_routing_policy {
    type = "PRIMARY"
  }

  set_identifier  = "primary"
  health_check_id = aws_route53_health_check.primary.id
}

# API Endpoint Record
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.environment}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id               = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  latency_routing_policy {
    region = var.aws_region
  }

  set_identifier = "api-${var.aws_region}"
}

# Primary Health Check Configuration
resource "aws_route53_health_check" "primary" {
  fqdn              = "${var.environment}.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "30"
  measure_latency   = true
  enable_sni        = true
  
  regions = [
    "us-east-1",    # N. Virginia
    "eu-west-1",    # Ireland
    "ap-southeast-1" # Singapore
  ]

  search_string         = "\"status\":\"healthy\""
  inverted             = false
  child_health_threshold = 1

  tags = {
    Name        = "${var.project_name}-${var.environment}-health-check"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Type        = "Primary"
    CostCenter  = "Infrastructure"
  }
}

# Secondary Health Check for API Endpoint
resource "aws_route53_health_check" "api" {
  fqdn              = "api.${var.environment}.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health"
  failure_threshold = "2"
  request_interval  = "10"
  measure_latency   = true
  enable_sni        = true

  regions = [
    "us-east-1",
    "eu-west-1",
    "ap-southeast-1"
  ]

  tags = {
    Name        = "${var.project_name}-${var.environment}-api-health-check"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Type        = "API"
    CostCenter  = "Infrastructure"
  }
}

# CNAME Record for Monitoring Subdomain
resource "aws_route53_record" "monitoring" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "monitoring.${var.environment}.${var.domain_name}"
  type    = "CNAME"
  ttl     = "300"
  records = ["${var.environment}-monitoring.${var.domain_name}"]
}

# TXT Record for Domain Verification
resource "aws_route53_record" "domain_verification" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = "300"
  records = ["v=spf1 include:_spf.${var.domain_name} -all"]
}

# Outputs for DNS Configuration
output "route53_zone_id" {
  description = "The Route53 zone ID for DNS record management"
  value       = aws_route53_zone.main.zone_id
}

output "route53_zone_nameservers" {
  description = "The nameservers for the Route53 zone"
  value       = aws_route53_zone.main.name_servers
}

output "route53_health_check_id" {
  description = "The ID of the primary Route53 health check"
  value       = aws_route53_health_check.primary.id
}

# CAA Records for SSL/TLS Certificate Authorities
resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = "300"
  records = [
    "0 issue \"amazon.com\"",
    "0 issue \"letsencrypt.org\"",
    "0 issuewild \"amazon.com\"",
    "0 iodef \"mailto:security@${var.domain_name}\""
  ]
}
#!/bin/bash

# Version: 1.0.0
# Enterprise-grade backup script for PostgreSQL and DocumentDB databases
# Implements tiered retention, parallel processing, and comprehensive monitoring

set -euo pipefail
IFS=$'\n\t'

# Import AWS CLI v2.0+, pg_dump 15.0+, mongodump 100.7.0+
command -v aws >/dev/null 2>&1 || { echo "AWS CLI v2.0+ required but not installed. Aborting." >&2; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump 15.0+ required but not installed. Aborting." >&2; exit 1; }
command -v mongodump >/dev/null 2>&1 || { echo "mongodump 100.7.0+ required but not installed. Aborting." >&2; exit 1; }

# Global Configuration
BACKUP_ROOT="/backup"
S3_BUCKET="s3://scraping-platform-backups"
HOT_RETENTION_DAYS=30
WARM_RETENTION_DAYS=90
COLD_RETENTION_YEARS=7
LOG_DIR="/var/log/backups"
METRICS_NAMESPACE="Backup/Metrics"
NOTIFICATION_TOPIC="arn:aws:sns:region:account:backup-notifications"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Logging Configuration
mkdir -p "${LOG_DIR}"
LOGFILE="${LOG_DIR}/backup_${TIMESTAMP}.log"
exec 1> >(tee -a "${LOGFILE}")
exec 2>&1

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

send_metric() {
    local metric_name=$1
    local value=$2
    local unit=$3
    
    aws cloudwatch put-metric-data \
        --namespace "${METRICS_NAMESPACE}" \
        --metric-name "${metric_name}" \
        --value "${value}" \
        --unit "${unit}" \
        --timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}

send_notification() {
    local subject=$1
    local message=$2
    local priority=$3
    
    aws sns publish \
        --topic-arn "${NOTIFICATION_TOPIC}" \
        --subject "${subject}" \
        --message "${message}" \
        --message-attributes "Priority={DataType=String,StringValue=${priority}}"
}

backup_postgres() {
    local backup_type=$1
    local parallel_jobs=$2
    local compression_level=$3
    local start_time
    start_time=$(date +%s)
    
    log "Starting PostgreSQL backup - Type: ${backup_type}"
    
    # Generate backup filename
    local backup_file="${BACKUP_ROOT}/postgres_${backup_type}_${TIMESTAMP}.dump"
    
    # Execute pg_dump with parallel processing
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${RDS_ENDPOINT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -F c \
        -j "${parallel_jobs}" \
        -Z "${compression_level}" \
        -f "${backup_file}" \
        --verbose
    
    # Calculate backup size and duration
    local backup_size
    backup_size=$(du -b "${backup_file}" | cut -f1)
    local duration
    duration=$(($(date +%s) - start_time))
    
    # Upload to S3 with server-side encryption
    aws s3 cp "${backup_file}" "${S3_BUCKET}/postgres/${backup_type}/" \
        --storage-class STANDARD_IA \
        --server-side-encryption aws:kms
    
    # Send metrics
    send_metric "PostgreSQLBackupSize" "${backup_size}" "Bytes"
    send_metric "PostgreSQLBackupDuration" "${duration}" "Seconds"
    
    # Cleanup local backup
    rm -f "${backup_file}"
    
    log "PostgreSQL backup completed successfully"
    return 0
}

backup_documentdb() {
    local backup_type=$1
    local include_indexes=$2
    local compression_level=$3
    local start_time
    start_time=$(date +%s)
    
    log "Starting DocumentDB backup - Type: ${backup_type}"
    
    # Generate backup directory
    local backup_dir="${BACKUP_ROOT}/docdb_${backup_type}_${TIMESTAMP}"
    mkdir -p "${backup_dir}"
    
    # Execute mongodump with SSL
    mongodump \
        --host "${DOCDB_ENDPOINT}" \
        --username "${DOCDB_USER}" \
        --password "${DOCDB_PASSWORD}" \
        --ssl \
        --sslCAFile /etc/ssl/certs/rds-ca-2019-root.pem \
        --out "${backup_dir}" \
        $([ "${include_indexes}" = true ] && echo "--indexesFirst") \
        --gzip \
        --numParallelCollections 4
    
    # Create tarball with compression
    local backup_file="${backup_dir}.tar.gz"
    tar -czf "${backup_file}" -C "${backup_dir}" . \
        --remove-files
    
    # Calculate backup size and duration
    local backup_size
    backup_size=$(du -b "${backup_file}" | cut -f1)
    local duration
    duration=$(($(date +%s) - start_time))
    
    # Upload to S3 with server-side encryption
    aws s3 cp "${backup_file}" "${S3_BUCKET}/documentdb/${backup_type}/" \
        --storage-class STANDARD_IA \
        --server-side-encryption aws:kms
    
    # Send metrics
    send_metric "DocumentDBBackupSize" "${backup_size}" "Bytes"
    send_metric "DocumentDBBackupDuration" "${duration}" "Seconds"
    
    # Cleanup local backup
    rm -f "${backup_file}"
    rm -rf "${backup_dir}"
    
    log "DocumentDB backup completed successfully"
    return 0
}

cleanup_old_backups() {
    local retention_tier=$1
    local dry_run=$2
    
    log "Starting backup cleanup - Tier: ${retention_tier}"
    
    case ${retention_tier} in
        "hot")
            aws s3 ls "${S3_BUCKET}" --recursive \
                | awk -v date="$(date -d"-${HOT_RETENTION_DAYS} days" +%Y-%m-%d)" '$1 < date {print $4}' \
                | while read -r object; do
                    if [ "${dry_run}" = false ]; then
                        aws s3 mv "${S3_BUCKET}/${object}" \
                            "${S3_BUCKET}/warm/${object##*/}"
                    fi
                    log "Moved to warm storage: ${object}"
                done
            ;;
        "warm")
            aws s3 ls "${S3_BUCKET}/warm/" --recursive \
                | awk -v date="$(date -d"-${WARM_RETENTION_DAYS} days" +%Y-%m-%d)" '$1 < date {print $4}' \
                | while read -r object; do
                    if [ "${dry_run}" = false ]; then
                        aws s3 mv "s3://${S3_BUCKET}/warm/${object}" \
                            "${S3_BUCKET}/cold/${object##*/}" \
                            --storage-class GLACIER
                    fi
                    log "Moved to cold storage: ${object}"
                done
            ;;
        "cold")
            aws s3 ls "${S3_BUCKET}/cold/" --recursive \
                | awk -v date="$(date -d"-${COLD_RETENTION_YEARS} years" +%Y-%m-%d)" '$1 < date {print $4}' \
                | while read -r object; do
                    if [ "${dry_run}" = false ]; then
                        aws s3 rm "${S3_BUCKET}/cold/${object}"
                    fi
                    log "Deleted from cold storage: ${object}"
                done
            ;;
    esac
    
    return 0
}

main() {
    log "Starting database backup process"
    
    # Create backup directory
    mkdir -p "${BACKUP_ROOT}"
    
    # Perform PostgreSQL backup
    backup_postgres "full" 4 9 || {
        send_notification "Backup Failed" "PostgreSQL backup failed" "high"
        exit 1
    }
    
    # Perform DocumentDB backup
    backup_documentdb "full" true 9 || {
        send_notification "Backup Failed" "DocumentDB backup failed" "high"
        exit 1
    }
    
    # Cleanup old backups
    cleanup_old_backups "hot" false
    cleanup_old_backups "warm" false
    cleanup_old_backups "cold" false
    
    log "Database backup process completed successfully"
    send_notification "Backup Success" "All database backups completed successfully" "normal"
}

# Execute main function
main
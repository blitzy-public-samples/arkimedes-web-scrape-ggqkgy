"""
Database initialization module for the Web Scraping Platform.
Configures SQLAlchemy models, session management, encryption, connection pooling,
and monitoring for secure and high-performance database operations.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
import asyncio
import logging
from typing import Optional, Dict, Any
from datetime import datetime

# Third-party imports with versions
from sqlalchemy import create_engine, MetaData  # v2.0.0
from sqlalchemy.ext.asyncio import AsyncEngine  # v2.0.0
from tenacity import retry, stop_after_attempt, wait_exponential  # v8.2.0
from cryptography.fernet import Fernet  # v41.0.0

# Internal imports
from .session import get_session, Base
from .models.user import User
from .models.task import Task

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
SCHEMA_VERSION = "1.0.0"
DB_TIMEOUT = 30
MAX_POOL_SIZE = 20

class DatabaseError(Exception):
    """Custom exception for database operations with detailed tracking."""
    
    def __init__(self, message: str, error_code: str, details: Optional[Dict] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        self.timestamp = datetime.utcnow().isoformat()

class HealthStatus:
    """Database health status container with comprehensive metrics."""
    
    def __init__(self):
        self.connection_pool_status: Dict[str, Any] = {}
        self.replication_lag: Optional[float] = None
        self.query_performance: Dict[str, float] = {}
        self.encryption_status: bool = False
        self.connection_count: int = 0
        self.disk_usage: Dict[str, float] = {}
        self.backup_status: Dict[str, Any] = {}
        self.timestamp: str = datetime.utcnow().isoformat()

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
async def init_models(engine: AsyncEngine) -> None:
    """
    Initialize all SQLAlchemy models with schema version tracking and validation.
    
    Args:
        engine: AsyncEngine instance for database operations
        
    Raises:
        DatabaseError: If initialization fails
    """
    try:
        # Create schema version table if not exists
        metadata = MetaData()
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
            
            # Verify schema version
            result = await conn.execute(
                "SELECT version FROM schema_version ORDER BY timestamp DESC LIMIT 1"
            )
            current_version = result.scalar()
            
            if current_version and current_version != SCHEMA_VERSION:
                logger.warning(
                    f"Schema version mismatch. Current: {current_version}, "
                    f"Expected: {SCHEMA_VERSION}"
                )
            
            # Create or update schema version
            await conn.execute(
                "INSERT INTO schema_version (version, timestamp) VALUES (:version, :timestamp)",
                {"version": SCHEMA_VERSION, "timestamp": datetime.utcnow()}
            )
            
            # Create all model tables
            await conn.run_sync(Base.metadata.create_all)
            
        logger.info(f"Database models initialized successfully. Schema version: {SCHEMA_VERSION}")
        
    except Exception as e:
        raise DatabaseError(
            message="Failed to initialize database models",
            error_code="DB_INIT_001",
            details={"error": str(e)}
        )

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
async def setup_database(config: Dict[str, Any]) -> AsyncEngine:
    """
    Configure secure database connection with encryption, pooling, and monitoring.
    
    Args:
        config: Database configuration dictionary
        
    Returns:
        AsyncEngine: Configured database engine
        
    Raises:
        DatabaseError: If setup fails
    """
    try:
        # Configure SSL context
        ssl_context = {
            "ssl_cert": config.get("ssl_cert", "/etc/ssl/certs/postgres.crt"),
            "ssl_key": config.get("ssl_key", "/etc/ssl/private/postgres.key"),
            "ssl_ca": config.get("ssl_ca", "/etc/ssl/certs/ca.crt")
        }
        
        # Configure connection pool
        pool_settings = {
            "pool_size": min(int(config.get("pool_size", MAX_POOL_SIZE)), MAX_POOL_SIZE),
            "max_overflow": int(config.get("max_overflow", 10)),
            "pool_timeout": int(config.get("pool_timeout", DB_TIMEOUT)),
            "pool_recycle": int(config.get("pool_recycle", 3600)),
            "pool_pre_ping": True
        }
        
        # Configure engine settings
        engine_settings = {
            "echo": bool(config.get("echo", False)),
            "future": True,
            "pool_pre_ping": True,
            "connect_args": {
                **ssl_context,
                "connect_timeout": DB_TIMEOUT,
                "application_name": "web_scraping_platform",
                "options": "-c timezone=UTC"
            }
        }
        
        # Create engine
        engine = create_engine(
            config["database_url"],
            **pool_settings,
            **engine_settings
        )
        
        # Initialize models
        await init_models(engine)
        
        # Verify connection
        async with engine.connect() as conn:
            await conn.execute("SELECT 1")
            
        logger.info("Database setup completed successfully")
        return engine
        
    except Exception as e:
        raise DatabaseError(
            message="Failed to setup database",
            error_code="DB_SETUP_001",
            details={"error": str(e)}
        )

async def check_database_health() -> HealthStatus:
    """
    Perform comprehensive database health check.
    
    Returns:
        HealthStatus: Database health status object
        
    Raises:
        DatabaseError: If health check fails
    """
    try:
        status = HealthStatus()
        
        async with get_session() as session:
            # Check connection pool
            pool_stats = await session.execute("SELECT * FROM pg_stat_activity")
            status.connection_pool_status = {
                "active_connections": len(pool_stats.fetchall()),
                "max_connections": MAX_POOL_SIZE
            }
            
            # Check replication lag
            if await session.execute("SELECT pg_is_in_recovery()").scalar():
                lag = await session.execute(
                    "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))"
                )
                status.replication_lag = lag.scalar()
            
            # Check query performance
            perf = await session.execute("SELECT * FROM pg_stat_statements LIMIT 10")
            status.query_performance = {
                row.query: row.mean_exec_time
                for row in perf.fetchall()
            }
            
            # Check disk usage
            usage = await session.execute(
                "SELECT pg_database_size(current_database())/1024/1024 as size_mb"
            )
            status.disk_usage = {
                "size_mb": usage.scalar(),
                "available_mb": await session.execute(
                    "SELECT pg_tablespace_size('pg_default')/1024/1024"
                ).scalar()
            }
            
            # Check backup status
            backup = await session.execute("SELECT * FROM pg_stat_archiver")
            status.backup_status = {
                "last_archived_wal": backup.scalar(),
                "last_archived_time": datetime.utcnow().isoformat()
            }
            
        return status
        
    except Exception as e:
        raise DatabaseError(
            message="Database health check failed",
            error_code="DB_HEALTH_001",
            details={"error": str(e)}
        )

# Export public interface
__all__ = [
    "Base",
    "get_session",
    "setup_database",
    "check_database_health",
    "DatabaseError",
    "HealthStatus"
]
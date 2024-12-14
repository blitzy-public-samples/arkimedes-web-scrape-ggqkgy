"""
Enhanced Alembic migrations environment configuration module.
Provides async support, improved security, and robust error handling for database schema migrations.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import logging
import sys
from logging.handlers import RotatingFileHandler
from typing import Optional

# Third-party imports with versions
from alembic import context  # v1.12.0
from alembic.environment import EnvironmentContext  # v1.12.0
from sqlalchemy import pool, engine_from_config
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncConnection  # v2.0.0
from sqlalchemy.engine import Connection

# Internal imports
from ../../api.core.config import get_postgres_uri, get_ssl_config
from ..session import get_engine, get_async_engine

# Configure logging
logger = logging.getLogger('alembic')
logger.setLevel(logging.INFO)

# Add rotating file handler
file_handler = RotatingFileHandler(
    'logs/alembic.log',
    maxBytes=10485760,  # 10MB
    backupCount=5
)
file_handler.setFormatter(
    logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
)
logger.addHandler(file_handler)

# Add console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(
    logging.Formatter('%(levelname)s: %(message)s')
)
logger.addHandler(console_handler)

# Import all models for Alembic to detect
from ..models import *  # noqa

# Get Alembic configuration
config = context.config

def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode with enhanced error handling and logging.
    
    This configures the context with the URL and sets up the Engine
    outside the normal test suite setup.
    """
    try:
        logger.info("Starting offline migration")
        
        # Get database URL with SSL config
        url = get_postgres_uri()
        
        # Configure context with enhanced settings
        context.configure(
            url=url,
            target_metadata=Base.metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            compare_type=True,
            compare_server_default=True,
            include_schemas=True,
            version_table="alembic_version",
            version_table_schema="public"
        )

        with context.begin_transaction():
            logger.info("Executing offline migration")
            context.run_migrations()
            
        logger.info("Offline migration completed successfully")
            
    except Exception as e:
        logger.error(f"Error during offline migration: {str(e)}", exc_info=True)
        raise

async def run_async_migrations(connection: AsyncConnection) -> None:
    """
    Run migrations asynchronously with enhanced monitoring and safety checks.
    
    Args:
        connection: AsyncConnection instance for database operations
    """
    try:
        logger.info("Starting async migration")
        
        def do_migrations(conn: Connection) -> None:
            # Bind connection to context
            context.configure(
                connection=conn,
                target_metadata=Base.metadata,
                compare_type=True,
                compare_server_default=True,
                include_schemas=True,
                version_table="alembic_version",
                version_table_schema="public",
                transaction_per_migration=True,
                lock_table="alembic_migration_lock"
            )
            
            # Execute migrations with progress tracking
            with context.begin_transaction():
                logger.info("Executing async migrations")
                context.run_migrations()

        # Run migrations using async connection
        async with connection.begin() as trans:
            await connection.run_sync(do_migrations)
            logger.info("Async migrations completed successfully")
            await trans.commit()
            
    except Exception as e:
        logger.error(f"Error during async migration: {str(e)}", exc_info=True)
        raise

def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode with transaction management and monitoring.
    
    This is the preferred way to run migrations as it offers better error handling
    and transaction management.
    """
    try:
        logger.info("Starting online migration")
        
        # Create async engine with SSL config
        connectable = get_async_engine()
        
        # Handle both async and sync execution
        if isinstance(connectable, AsyncEngine):
            # Run async migrations
            asyncio.run(run_async_migrations(connectable.connect()))
        else:
            # Configure context for sync execution
            with connectable.connect() as connection:
                context.configure(
                    connection=connection,
                    target_metadata=Base.metadata,
                    compare_type=True,
                    compare_server_default=True,
                    include_schemas=True,
                    version_table="alembic_version",
                    version_table_schema="public",
                    transaction_per_migration=True,
                    lock_table="alembic_migration_lock"
                )
                
                # Execute migrations with transaction management
                with context.begin_transaction():
                    logger.info("Executing online migration")
                    context.run_migrations()
                    
        logger.info("Online migration completed successfully")
                    
    except Exception as e:
        logger.error(f"Error during online migration: {str(e)}", exc_info=True)
        raise

if context.is_offline_mode():
    logger.info("Running migrations in offline mode")
    run_migrations_offline()
else:
    logger.info("Running migrations in online mode")
    run_migrations_online()
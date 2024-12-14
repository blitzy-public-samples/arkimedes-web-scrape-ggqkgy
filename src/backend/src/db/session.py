"""
Database session management module providing SQLAlchemy engines and session factories.
Implements optimized connection pooling, security features, and both sync/async support.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from typing import Optional
from contextlib import contextmanager

# Third-party imports with versions
from sqlalchemy import create_engine  # v2.0.0
from sqlalchemy.orm import DeclarativeBase, sessionmaker  # v2.0.0
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # v2.0.0
from sqlalchemy.engine.url import URL  # v2.0.0
from sqlalchemy import MetaData  # v2.0.0
from sqlalchemy.pool import QueuePool  # v2.0.0

# Internal imports
from ..api.core.config import settings

# Global connection pool settings
POOL_SIZE = 20
MAX_OVERFLOW = 10
POOL_TIMEOUT = 30
POOL_RECYCLE = 3600  # Recycle connections after 1 hour
POOL_PRE_PING = True
ECHO_SQL = False

# SQLAlchemy naming convention for constraints
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

class Base(DeclarativeBase):
    """
    SQLAlchemy declarative base class for ORM models.
    Implements consistent naming conventions and metadata configuration.
    """
    
    # Configure metadata with naming convention
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    
    # Schema version for migrations
    __table_args__ = {'schema_version': '1.0'}

def create_db_engine(is_replica: bool = False):
    """
    Creates SQLAlchemy engine with optimized connection pool settings
    and security configurations.
    
    Args:
        is_replica: Boolean flag to use replica database if True
        
    Returns:
        SQLAlchemy Engine instance
    """
    # Get database URI from settings
    db_url = settings.get_postgres_uri()
    
    # Parse database URL for validation
    url_obj = URL.create(
        drivername="postgresql+psycopg",
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB
    )
    
    # Configure connection pool settings
    pool_settings = {
        "poolclass": QueuePool,
        "pool_size": POOL_SIZE,
        "max_overflow": MAX_OVERFLOW,
        "pool_timeout": POOL_TIMEOUT,
        "pool_recycle": POOL_RECYCLE,
        "pool_pre_ping": POOL_PRE_PING
    }
    
    # Configure engine settings
    engine_settings = {
        "pool_pre_ping": True,
        "echo": ECHO_SQL,
        "future": True,
        "execution_options": {
            "isolation_level": "READ COMMITTED",
            "postgresql_readonly": is_replica,
            "postgresql_auto_prepares": True
        }
    }
    
    # Create engine with all configurations
    engine = create_engine(
        url_obj,
        **pool_settings,
        **engine_settings,
        connect_args=settings.get_ssl_config()
    )
    
    return engine

def create_async_db_engine(is_replica: bool = False):
    """
    Creates async SQLAlchemy engine for non-blocking database operations
    with security features.
    
    Args:
        is_replica: Boolean flag to use replica database if True
        
    Returns:
        AsyncEngine instance
    """
    # Get database URI and convert to async format
    db_url = settings.get_postgres_uri().replace('postgresql://', 'postgresql+asyncpg://')
    
    # Configure async pool settings
    pool_settings = {
        "pool_size": POOL_SIZE,
        "max_overflow": MAX_OVERFLOW,
        "pool_timeout": POOL_TIMEOUT,
        "pool_recycle": POOL_RECYCLE,
        "pool_pre_ping": POOL_PRE_PING
    }
    
    # Configure async engine settings
    engine_settings = {
        "echo": ECHO_SQL,
        "future": True,
        "execution_options": {
            "isolation_level": "READ COMMITTED",
            "postgresql_readonly": is_replica
        }
    }
    
    # Create async engine with all configurations
    engine = create_async_engine(
        db_url,
        **pool_settings,
        **engine_settings,
        connect_args=settings.get_ssl_config()
    )
    
    return engine

# Initialize engines
_engine = None
_async_engine = None
_SessionLocal = None
_AsyncSessionLocal = None

def get_session():
    """
    Session factory function providing database session instances
    with automatic cleanup.
    
    Returns:
        SQLAlchemy Session instance
    """
    global _engine, _SessionLocal
    
    if _engine is None:
        _engine = create_db_engine()
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=_engine,
            expire_on_commit=False
        )
    
    return _SessionLocal()

def get_async_session():
    """
    Async session factory function for non-blocking database operations
    with automatic cleanup.
    
    Returns:
        AsyncSession instance
    """
    global _async_engine, _AsyncSessionLocal
    
    if _async_engine is None:
        _async_engine = create_async_db_engine()
        _AsyncSessionLocal = sessionmaker(
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            bind=_async_engine,
            expire_on_commit=False
        )
    
    return _AsyncSessionLocal()

# Export public components
__all__ = [
    "Base",
    "get_session",
    "get_async_session"
]
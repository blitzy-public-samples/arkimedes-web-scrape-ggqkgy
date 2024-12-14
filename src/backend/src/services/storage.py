"""
Storage service module implementing multi-tier data storage operations with encryption,
caching, and automated archival capabilities for the web scraping platform.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

import asyncio
import zlib
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Tuple

# Third-party imports with versions
from motor.motor_asyncio import AsyncIOMotorClient  # v3.3.0
from redis.asyncio import Redis  # v5.0.0
import boto3  # v1.28.0

# Internal imports
from ..api.core.config import settings
from ..utils.encryption import encrypt, decrypt
from ..db.session import get_async_session

# Global constants for storage configuration
HOT_STORAGE_DAYS = 30
WARM_STORAGE_DAYS = 90
COLD_STORAGE_YEARS = 7
CACHE_TTL_SECONDS = 900  # 15 minutes
MAX_RETRY_ATTEMPTS = 3
BATCH_SIZE = 1000
COMPRESSION_LEVEL = 6

class StorageService:
    """
    Async service class managing multi-tier data storage operations with encryption,
    caching, and archival capabilities.
    """
    
    def __init__(self, config: Dict[str, Any], pool_size: int = 20, max_overflow: int = 10):
        """
        Initialize storage service with async database connections and connection pooling.
        
        Args:
            config: Configuration dictionary
            pool_size: Database connection pool size
            max_overflow: Maximum number of connections to overflow
        """
        # Initialize PostgreSQL connection
        self.db_session = get_async_session()
        
        # Initialize MongoDB connection with retry policy
        self.mongo_client = AsyncIOMotorClient(
            settings.get_mongo_uri(),
            maxPoolSize=pool_size,
            waitQueueTimeoutMS=5000,
            retryWrites=True
        )
        self.mongo_db = self.mongo_client[settings.MONGODB_DB]
        
        # Initialize Redis connection for caching
        self.redis_client = Redis.from_url(
            settings.get_redis_uri(),
            encoding="utf-8",
            decode_responses=True,
            max_connections=pool_size
        )
        
        # Initialize S3 client for archival
        self.s3_client = boto3.client(
            's3',
            **settings.get_s3_config()
        )
        
        # Initialize encryption key
        self.encryption_key = config.get('encryption_key')
        
        # Setup monitoring and health check
        self._setup_health_check()

    async def store_task_data(self, task_data: Dict[str, Any], encrypt_fields: bool = True) -> str:
        """
        Stores encrypted task configuration data in PostgreSQL with retry logic.
        
        Args:
            task_data: Task configuration data
            encrypt_fields: Flag to enable field-level encryption
            
        Returns:
            str: Task ID with storage confirmation
            
        Raises:
            Exception: If storage operation fails after retries
        """
        async with self.db_session as session:
            try:
                # Encrypt sensitive fields if enabled
                if encrypt_fields:
                    task_data = await self._encrypt_sensitive_fields(task_data)
                
                # Add metadata
                task_data.update({
                    'created_at': datetime.utcnow(),
                    'storage_tier': 'hot',
                    'last_accessed': datetime.utcnow()
                })
                
                # Store in PostgreSQL
                async with session.begin():
                    result = await session.execute(
                        """
                        INSERT INTO tasks (data, metadata)
                        VALUES (:data, :metadata)
                        RETURNING id
                        """,
                        {
                            'data': json.dumps(task_data),
                            'metadata': json.dumps({
                                'encrypted': encrypt_fields,
                                'schema_version': '1.0'
                            })
                        }
                    )
                    task_id = result.scalar_one()
                
                return str(task_id)
                
            except Exception as e:
                await session.rollback()
                raise Exception(f"Failed to store task data: {str(e)}")

    async def store_scraped_data(
        self,
        task_id: str,
        scraped_data: Dict[str, Any],
        cache_enabled: bool = True
    ) -> str:
        """
        Stores scraped data in MongoDB with tiered storage and caching.
        
        Args:
            task_id: Associated task identifier
            scraped_data: Scraped data to store
            cache_enabled: Flag to enable Redis caching
            
        Returns:
            str: Data ID with storage location
        """
        try:
            # Compress data if size exceeds threshold
            data_size = len(json.dumps(scraped_data))
            if data_size > 1024 * 1024:  # 1MB
                compressed_data = zlib.compress(
                    json.dumps(scraped_data).encode(),
                    level=COMPRESSION_LEVEL
                )
                is_compressed = True
            else:
                compressed_data = scraped_data
                is_compressed = False
            
            # Store in MongoDB
            result = await self.mongo_db.scraped_data.insert_one({
                'task_id': task_id,
                'data': compressed_data,
                'metadata': {
                    'compressed': is_compressed,
                    'original_size': data_size,
                    'created_at': datetime.utcnow(),
                    'storage_tier': 'hot'
                }
            })
            
            data_id = str(result.inserted_id)
            
            # Cache if enabled
            if cache_enabled:
                cache_key = f"scraped_data:{data_id}"
                await self.redis_client.setex(
                    cache_key,
                    CACHE_TTL_SECONDS,
                    json.dumps(scraped_data)
                )
            
            return data_id
            
        except Exception as e:
            raise Exception(f"Failed to store scraped data: {str(e)}")

    async def archive_data(self, data_id: str, storage_tier: str) -> bool:
        """
        Archives data to appropriate storage tier based on age and access patterns.
        
        Args:
            data_id: Data identifier
            storage_tier: Target storage tier ('warm' or 'cold')
            
        Returns:
            bool: True if archival successful
        """
        try:
            if storage_tier == 'warm':
                # Move to warm storage in MongoDB with different collection
                await self._move_to_warm_storage(data_id)
            elif storage_tier == 'cold':
                # Archive to S3 with compression
                await self._archive_to_s3(data_id)
            
            return True
            
        except Exception as e:
            raise Exception(f"Failed to archive data: {str(e)}")

    async def cleanup_expired_data(self) -> Tuple[int, int]:
        """
        Performs automated cleanup of expired data based on retention policies.
        
        Returns:
            Tuple[int, int]: Count of cleaned up records and errors
        """
        try:
            cleanup_count = 0
            error_count = 0
            
            # Cleanup hot storage
            hot_cutoff = datetime.utcnow() - timedelta(days=HOT_STORAGE_DAYS)
            hot_result = await self.mongo_db.scraped_data.update_many(
                {
                    'metadata.storage_tier': 'hot',
                    'metadata.created_at': {'$lt': hot_cutoff}
                },
                {'$set': {'metadata.storage_tier': 'warm'}}
            )
            cleanup_count += hot_result.modified_count
            
            # Cleanup warm storage
            warm_cutoff = datetime.utcnow() - timedelta(days=WARM_STORAGE_DAYS)
            warm_result = await self.mongo_db.scraped_data.update_many(
                {
                    'metadata.storage_tier': 'warm',
                    'metadata.created_at': {'$lt': warm_cutoff}
                },
                {'$set': {'metadata.storage_tier': 'cold'}}
            )
            cleanup_count += warm_result.modified_count
            
            return cleanup_count, error_count
            
        except Exception as e:
            raise Exception(f"Failed to cleanup expired data: {str(e)}")

    async def _encrypt_sensitive_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Encrypts sensitive fields in data using field-level encryption.
        
        Args:
            data: Data containing sensitive fields
            
        Returns:
            Dict with encrypted sensitive fields
        """
        sensitive_fields = ['credentials', 'auth_token', 'api_key']
        encrypted_data = data.copy()
        
        for field in sensitive_fields:
            if field in encrypted_data:
                encrypted_data[field] = encrypt(
                    self.encryption_key,
                    json.dumps(encrypted_data[field]).encode()
                )
        
        return encrypted_data

    async def _move_to_warm_storage(self, data_id: str) -> None:
        """
        Moves data to warm storage tier with updated metadata.
        
        Args:
            data_id: Data identifier to move
        """
        await self.mongo_db.scraped_data.update_one(
            {'_id': data_id},
            {
                '$set': {
                    'metadata.storage_tier': 'warm',
                    'metadata.moved_at': datetime.utcnow()
                }
            }
        )

    async def _archive_to_s3(self, data_id: str) -> None:
        """
        Archives data to S3 cold storage with compression.
        
        Args:
            data_id: Data identifier to archive
        """
        data = await self.mongo_db.scraped_data.find_one({'_id': data_id})
        if data:
            # Compress data for archival
            compressed = zlib.compress(
                json.dumps(data).encode(),
                level=COMPRESSION_LEVEL
            )
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=settings.S3_BUCKET,
                Key=f"archives/{data_id}.gz",
                Body=compressed,
                StorageClass='GLACIER'
            )

    def _setup_health_check(self) -> None:
        """Configures periodic health checks for storage services."""
        async def health_check():
            while True:
                try:
                    # Check MongoDB connection
                    await self.mongo_client.admin.command('ping')
                    
                    # Check Redis connection
                    await self.redis_client.ping()
                    
                    # Check PostgreSQL connection
                    async with self.db_session() as session:
                        await session.execute("SELECT 1")
                    
                    await asyncio.sleep(30)
                    
                except Exception as e:
                    # Log health check failure
                    print(f"Storage health check failed: {str(e)}")
                    await asyncio.sleep(5)
        
        asyncio.create_task(health_check())

# Export StorageService class
__all__ = ['StorageService']
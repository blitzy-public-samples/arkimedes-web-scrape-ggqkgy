"""
FastAPI router module for handling scraped data endpoints with enhanced security,
tiered storage access, and comprehensive monitoring capabilities.

Version: 1.0.0
Author: Web Scraping Platform Team
"""

# Standard library imports
from datetime import timedelta
from typing import Optional
import logging
import structlog

# Third-party imports
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks  # v0.100.0
from fastapi.responses import StreamingResponse  # v0.100.0
from sqlalchemy.ext.asyncio import AsyncSession  # v2.0.0

# Internal imports
from ..schemas.data import DataBase, ScrapedData, DataResponse, DataFilter, DataExportFormat, StorageTier
from ..core.dependencies import get_db, get_current_user, check_rate_limit, audit_log
from ...services.storage import StorageService

# Configure structured logging
logger = structlog.get_logger(__name__)

# Initialize router with prefix and tags
router = APIRouter(prefix="/api/v1/data", tags=["data"])

# Constants
CACHE_TTL = timedelta(minutes=15)
MAX_EXPORT_SIZE = 1000000  # 1 million records limit for exports

# Initialize storage service
storage_service = StorageService(config={
    'encryption_key': settings.SECRET_KEY.encode()
})

@router.get("/")
@check_rate_limit
@audit_log
async def get_data(
    filters: DataFilter,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    tier: StorageTier = StorageTier.HOT
) -> DataResponse:
    """
    Enhanced paginated data retrieval with storage tier awareness and caching.
    
    Args:
        filters: Query filters and pagination parameters
        db: Database session
        current_user: Authenticated user information
        tier: Storage tier to query
        
    Returns:
        DataResponse: Paginated data with metadata
        
    Raises:
        HTTPException: For invalid requests or access denied
    """
    try:
        # Validate user permissions
        if not current_user.get("permissions", {}).get("data_read"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to access data"
            )

        # Check cache for hot tier requests
        cache_key = f"data:{current_user['id']}:{filters.json()}:{tier}"
        if tier == StorageTier.HOT:
            cached_data = await storage_service.redis_client.get(cache_key)
            if cached_data:
                return DataResponse.parse_raw(cached_data)

        # Apply filters with tier awareness
        query_params = {
            "storage_tier": tier,
            "page": filters.page,
            "size": filters.size,
            "query_hints": filters.query_hints
        }
        
        if filters.status:
            query_params["status"] = filters.status
        if filters.execution_id:
            query_params["execution_id"] = filters.execution_id
        if filters.start_date:
            query_params["start_date"] = filters.start_date
        if filters.end_date:
            query_params["end_date"] = filters.end_date

        # Execute optimized query
        data = await storage_service.get_from_tier(
            tier=tier,
            params=query_params,
            db=db
        )

        # Prepare response
        response = DataResponse(
            data=data.records,
            total=data.total,
            page=filters.page,
            size=filters.size,
            metadata={
                "storage_tier": tier,
                "query_time_ms": data.query_time,
                "cache_hit": False
            }
        )

        # Cache hot tier results
        if tier == StorageTier.HOT:
            await storage_service.cache_data(
                cache_key,
                response.json(),
                ttl=CACHE_TTL
            )

        # Log access
        logger.info(
            "data_access",
            user_id=current_user["id"],
            tier=tier,
            filters=filters.dict(),
            records_count=len(data.records)
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "data_access_error",
            error=str(e),
            user_id=current_user["id"],
            filters=filters.dict()
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve data"
        )

@router.get("/export")
@check_rate_limit
@audit_log
async def export_data(
    filters: DataFilter,
    format: DataExportFormat,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    background_tasks: BackgroundTasks
) -> StreamingResponse:
    """
    Enhanced data export with progress tracking and memory management.
    
    Args:
        filters: Export filters
        format: Export format specification
        db: Database session
        current_user: Authenticated user information
        background_tasks: Background task manager
        
    Returns:
        StreamingResponse: Chunked data export stream
        
    Raises:
        HTTPException: For invalid requests or export limits exceeded
    """
    try:
        # Validate user permissions
        if not current_user.get("permissions", {}).get("data_export"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions to export data"
            )

        # Validate export size
        total_records = await storage_service.get_filtered_count(filters, db)
        if total_records > MAX_EXPORT_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Export size exceeds maximum limit of {MAX_EXPORT_SIZE} records"
            )

        # Initialize export tracking
        export_id = f"export_{current_user['id']}_{datetime.utcnow().timestamp()}"
        await storage_service.redis_client.setex(
            f"export_progress:{export_id}",
            3600,  # 1 hour TTL
            json.dumps({"status": "started", "progress": 0})
        )

        # Configure chunked processing
        async def data_generator():
            try:
                processed = 0
                chunk_size = 1000

                # Stream header
                if format == DataExportFormat.CSV:
                    yield "id,execution_id,collected_at,status,data\n"

                # Stream data chunks
                async for chunk in storage_service.stream_filtered_data(
                    filters,
                    chunk_size=chunk_size,
                    db=db
                ):
                    # Format chunk
                    if format == DataExportFormat.JSON:
                        yield json.dumps(chunk) + "\n"
                    else:
                        for record in chunk:
                            yield f"{record.id},{record.execution_id},{record.collected_at},{record.status},{json.dumps(record.data)}\n"

                    # Update progress
                    processed += len(chunk)
                    await storage_service.redis_client.setex(
                        f"export_progress:{export_id}",
                        3600,
                        json.dumps({
                            "status": "processing",
                            "progress": (processed / total_records) * 100
                        })
                    )

                # Mark completion
                await storage_service.redis_client.setex(
                    f"export_progress:{export_id}",
                    3600,
                    json.dumps({"status": "completed", "progress": 100})
                )

            except Exception as e:
                logger.error(
                    "export_error",
                    error=str(e),
                    export_id=export_id,
                    user_id=current_user["id"]
                )
                await storage_service.redis_client.setex(
                    f"export_progress:{export_id}",
                    3600,
                    json.dumps({"status": "failed", "error": str(e)})
                )
                raise

        # Configure response headers
        headers = {
            "Content-Disposition": f"attachment; filename=export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{format.lower()}"
        }

        # Log export
        logger.info(
            "data_export",
            user_id=current_user["id"],
            format=format,
            filters=filters.dict(),
            total_records=total_records
        )

        # Return streaming response
        return StreamingResponse(
            data_generator(),
            media_type="application/octet-stream",
            headers=headers
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "export_error",
            error=str(e),
            user_id=current_user["id"],
            filters=filters.dict()
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initiate data export"
        )
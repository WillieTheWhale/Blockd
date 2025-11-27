"""
Cache management endpoint
"""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.cache_service import get_cache_service

logger = logging.getLogger(__name__)
router = APIRouter()


class CacheDeleteRequest(BaseModel):
    """Request to delete cache entries"""
    pattern: str


@router.delete("/cache")
async def delete_cache(request: CacheDeleteRequest):
    """
    Delete cache entries by pattern

    Args:
        request: Cache delete request

    Returns:
        Success message
    """
    try:
        cache_service = await get_cache_service()
        await cache_service.delete_cache(request.pattern)

        return {
            "message": f"Cache entries matching '{request.pattern}' deleted successfully"
        }

    except Exception as e:
        logger.error(f"Error deleting cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete cache")


@router.get("/cache/stats")
async def get_cache_stats():
    """
    Get cache statistics

    Returns:
        Cache statistics
    """
    # Placeholder for cache statistics
    return {
        "total_entries": 0,
        "hit_rate": 0.0,
        "miss_rate": 0.0,
        "memory_usage_mb": 0.0
    }

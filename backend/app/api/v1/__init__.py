from fastapi import APIRouter

from . import health, structures

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(structures.router, prefix="/structures", tags=["structures"])

__all__ = ["api_router"]

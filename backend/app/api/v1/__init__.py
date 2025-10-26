from fastapi import APIRouter

from . import events, health, structures

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(structures.router, prefix="/structures", tags=["structures"])
api_router.include_router(events.router, prefix="/events", tags=["events"])

__all__ = ["api_router"]

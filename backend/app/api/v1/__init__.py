from fastapi import APIRouter

from . import auth, events, health, quotes, structures

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(structures.router, prefix="/structures", tags=["structures"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(quotes.router, tags=["quotes"])

__all__ = ["api_router"]

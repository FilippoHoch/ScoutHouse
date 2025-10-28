from fastapi import APIRouter

from . import auth, events, export, health, imports, quotes, structures, templates

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(imports.router, prefix="/import", tags=["import"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(structures.router, prefix="/structures", tags=["structures"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(quotes.router, tags=["quotes"])
api_router.include_router(export.router, prefix="/export", tags=["export"])

__all__ = ["api_router"]

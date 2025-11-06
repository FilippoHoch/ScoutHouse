from fastapi import APIRouter

from . import (
    attachments,
    auth,
    events,
    export,
    health,
    imports,
    mail,
    ops,
    quotes,
    structures,
    templates,
    users,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(attachments.router, tags=["attachments"])
api_router.include_router(imports.router, prefix="/import", tags=["import"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(structures.router, prefix="/structures", tags=["structures"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(quotes.router, tags=["quotes"])
api_router.include_router(export.router, prefix="/export", tags=["export"])
api_router.include_router(mail.router)
api_router.include_router(ops.router)
api_router.include_router(users.router)

__all__ = ["api_router"]

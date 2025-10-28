from fastapi import APIRouter
from rq.registry import FailedJobRegistry, StartedJobRegistry

from app.tasks.queue import queue

router = APIRouter(prefix="/ops", tags=["ops"])


@router.get("/queue")
def queue_metrics() -> dict[str, int | str]:
    started = StartedJobRegistry(queue=queue)
    failed = FailedJobRegistry(queue=queue)
    return {
        "queue": queue.name,
        "queued": queue.count,
        "started": len(started),
        "failed": len(failed),
    }


__all__ = ["router"]

"""Lightweight in-memory publish/subscribe bus for local notifications."""

from __future__ import annotations

import asyncio
import logging
from asyncio import QueueEmpty, QueueFull
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from threading import Lock
from typing import Any
from uuid import uuid4


@dataclass(slots=True)
class EventMessage:
    """Envelope for messages dispatched through the :class:`EventBus`."""

    message_id: str
    type: str
    payload: dict[str, Any]


class EventBus:
    """Fan-out events to multiple subscribers living in the same process."""

    def __init__(self, *, queue_maxsize: int = 256) -> None:
        self._queue_maxsize = queue_maxsize
        self._subscribers: set[asyncio.Queue[EventMessage]] = set()
        self._subscribers_lock = Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._logger = logging.getLogger("app.pubsub")

    def bind_to_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Bind the bus to the main asyncio loop.

        The bus can operate without an explicit binding as long as at least one
        subscriber is active (the loop will be captured on subscription). This
        hook allows eager configuration during application startup which makes
        publishing from background threads safe even before the first
        subscription is established.
        """

        self._loop = loop

    def publish(self, event_type: str, payload: dict[str, Any]) -> str:
        """Publish an event to all active subscribers.

        Returns the generated event identifier so callers can trace the message
        if needed. Publishing is fire-and-forget; slow subscribers get the most
        recent event (older ones are dropped once the queue is full).
        """

        if not isinstance(payload, dict):  # Defensive guard for unexpected inputs
            raise TypeError("payload must be a dictionary")

        message = EventMessage(message_id=str(uuid4()), type=event_type, payload=payload)

        with self._subscribers_lock:
            subscribers = list(self._subscribers)

        if not subscribers:
            return message.message_id

        loop = self._loop
        if loop is None:
            raise RuntimeError("EventBus is not bound to an event loop")

        for queue in subscribers:
            loop.call_soon_threadsafe(self._enqueue, queue, message)

        return message.message_id

    def _enqueue(self, queue: asyncio.Queue[EventMessage], message: EventMessage) -> None:
        if queue.full():
            try:
                queue.get_nowait()
            except QueueEmpty:
                pass
            else:
                self._logger.debug("Dropped oldest event due to slow subscriber")

        try:
            queue.put_nowait(message)
        except QueueFull:  # pragma: no cover - defensive guard
            self._logger.warning("Unable to enqueue event for subscriber; dropping message")

    def subscribe(self) -> AsyncGenerator[EventMessage, None]:
        """Register a new subscriber and return an async iterator of messages."""

        queue: asyncio.Queue[EventMessage] = asyncio.Queue(self._queue_maxsize)

        async def iterator() -> AsyncGenerator[EventMessage, None]:
            try:
                if self._loop is None:
                    self._loop = asyncio.get_running_loop()
                while True:
                    message = await queue.get()
                    yield message
            finally:
                with self._subscribers_lock:
                    self._subscribers.discard(queue)

        with self._subscribers_lock:
            self._subscribers.add(queue)

        return iterator()


event_bus = EventBus()

__all__ = ["EventBus", "EventMessage", "event_bus"]

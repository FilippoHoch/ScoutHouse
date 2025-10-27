# Live updates (SSE)

The ScoutHouse API exposes a lightweight real-time channel based on
[Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
to refresh the event dashboard without relying on WebSockets.

## Architecture overview

- **Publisher** – mutations touching events, candidates or tasks publish
  notifications on an in-memory `EventBus` (`app/core/pubsub.py`). The bus keeps
  a per-subscriber queue and drops the oldest event if a client falls behind.
- **Transport** – `GET /api/v1/events/{id}/live` streams JSON payloads with the
  fields `type`, `event_id` and `payload`. Every 60 seconds, if no domain event
  was emitted, the server sends `{ "type": "keepalive" }` as a heartbeat to
  keep connections alive.
- **Consumers** – the frontend hook `useEventLive(eventId)` opens an
  `EventSource` with the `access_token` query parameter, invalidating the
  relevant TanStack Query caches when `candidate_updated`, `task_updated` or
  `summary_updated` arrive. When SSE is unavailable or drops, the hook falls
  back to the legacy 15 s polling by invalidating the same queries on a timer.

## Limitations

- The bus is **in-memory** and **single-process**. Horizontal scaling requires
  replacing it with a shared transport such as Redis Pub/Sub or a message
  broker. The publication layer is encapsulated, so swapping the implementation
  only requires changing `EventBus.publish/subscribe`.
- SSE connections are handled per Uvicorn worker. Running multiple workers
  without a shared backend may result in missed events for clients connected to
  different workers.
- SSE is unidirectional. If bidirectional messaging is required in the future,
  consider upgrading the endpoint to WebSockets; the frontend hook keeps the
  query invalidation logic isolated, easing such a migration.

## Security considerations

- The SSE endpoint reuses the regular JWT access token, passed through the
  `access_token` query parameter. Query strings are visible to reverse proxies
  and access logs; to reduce exposure the request logging middleware skips
  access logging for this route. In production, prefer HTTPS and ensure reverse
  proxies mask or discard sensitive query parameters.
- The endpoint enforces `event_member` permissions server-side before opening
  the stream.

## Future improvements

- Replace the in-memory bus with Redis or another shared broker to unlock
  horizontal scaling.
- Add automatic retries/reconnects in the frontend hook for transient network
  failures.
- Expand the event types if additional parts of the UI need real-time
  invalidation.

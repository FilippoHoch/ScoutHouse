from starlette.requests import Request

from slowapi import Limiter
from slowapi.util import get_remote_address

TEST_RATE_LIMIT_HEADER = "X-Test-Rate-Limit-Key"


def _get_rate_limit_key(request: Request) -> str:
    override = request.headers.get(TEST_RATE_LIMIT_HEADER)
    if override:
        return override
    return get_remote_address(request)

limiter = Limiter(
    key_func=_get_rate_limit_key,
    default_limits=[],
    headers_enabled=True,
)

__all__ = ["limiter", "TEST_RATE_LIMIT_HEADER"]

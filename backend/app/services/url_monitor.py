from __future__ import annotations

from collections.abc import Sequence
from typing import Final

import httpx

__all__ = ["find_unreachable_urls"]


_USER_AGENT: Final = "ScoutHouseLinkChecker/1.0"
_DEFAULT_TIMEOUT: Final[float] = 5.0


def _unique_urls(urls: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        unique.append(url)
    return unique


def _probe_url(client: httpx.Client, url: str) -> bool:
    try:
        response = client.head(url, follow_redirects=True)
    except httpx.RequestError:
        return False

    if response.status_code >= 400 or response.status_code == 405:
        try:
            response = client.get(url, follow_redirects=True)
        except httpx.RequestError:
            return False

    return response.status_code < 400


def find_unreachable_urls(urls: Sequence[str], *, timeout: float = _DEFAULT_TIMEOUT) -> list[str]:
    """Return the URLs that could not be reached successfully."""

    unique_urls = _unique_urls(urls)
    if not unique_urls:
        return []

    unreachable: list[str] = []
    try:
        with httpx.Client(timeout=timeout, headers={"User-Agent": _USER_AGENT}) as client:
            for url in unique_urls:
                if not _probe_url(client, url):
                    unreachable.append(url)
    except httpx.HTTPError:
        # If the client itself cannot be created (e.g. invalid proxy),
        # treat all URLs as unreachable to surface the warning to the caller.
        return list(unique_urls)

    return unreachable

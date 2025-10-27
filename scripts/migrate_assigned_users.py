#!/usr/bin/env python
"""Populate assigned_user_id for legacy event records.

The script scans event structure candidates and contact tasks that still use the
legacy textual ``assigned_user`` field and assigns them to placeholder users so
that the new foreign-key ``assigned_user_id`` column is populated.

Usage::

    python scripts/migrate_assigned_users.py [--email-domain example.com]

"""

from __future__ import annotations

import argparse
import secrets
import sys
from typing import Dict

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import EventContactTask, EventStructureCandidate, User

DEFAULT_DOMAIN = "placeholder.local"


def _slugify(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    slug = "-".join(part for part in slug.split("-") if part)
    return slug or "user"


def ensure_placeholder_user(db, name: str, domain: str, cache: Dict[str, User]) -> User:
    if name in cache:
        return cache[name]

    base_slug = _slugify(name)
    counter = 1
    while True:
        email = f"{base_slug}{'' if counter == 1 else f'-{counter}'}@{domain}"
        existing = db.query(User).filter(User.email == email).first()
        if existing is None:
            break
        counter += 1

    password = secrets.token_urlsafe(12)
    user = User(
        name=name,
        email=email,
        password_hash=hash_password(password),
        is_active=False,
    )
    db.add(user)
    db.flush()
    cache[name] = user
    return user


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--email-domain",
        default=DEFAULT_DOMAIN,
        help="Domain to use for placeholder user email addresses",
    )
    args = parser.parse_args()

    placeholders: Dict[str, User] = {}

    with SessionLocal() as db:
        candidates = (
            db.query(EventStructureCandidate)
            .filter(
                EventStructureCandidate.assigned_user.isnot(None),
                EventStructureCandidate.assigned_user != "",
                EventStructureCandidate.assigned_user_id.is_(None),
            )
            .all()
        )
        tasks = (
            db.query(EventContactTask)
            .filter(
                EventContactTask.assigned_user.isnot(None),
                EventContactTask.assigned_user != "",
                EventContactTask.assigned_user_id.is_(None),
            )
            .all()
        )

        for candidate in candidates:
            user = ensure_placeholder_user(db, candidate.assigned_user, args.email_domain, placeholders)
            candidate.assigned_user_id = user.id

        for task in tasks:
            user = ensure_placeholder_user(db, task.assigned_user, args.email_domain, placeholders)
            task.assigned_user_id = user.id

        if candidates or tasks:
            db.commit()
        else:
            print("No legacy assignments found", file=sys.stderr)
            return 0

    print(f"Migrated {len(candidates)} candidates and {len(tasks)} tasks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

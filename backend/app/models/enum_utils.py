"""Helpers for configuring SQLAlchemy Enum columns.

These utilities ensure that SQLAlchemy stores the actual enum values defined in
our ``Enum`` classes instead of their member names. Without this, passing
``SQLEnum`` a Python ``Enum`` subclass defaults to using the member names (e.g.
``"HOUSE"``) which does not match the lowercase labels defined in the
migrations. As a result, inserts fail with errors such as ``invalid input value
for enum``.
"""

from __future__ import annotations

from enum import Enum

from sqlalchemy import Enum as SQLEnum


def enum_values[E: Enum](enum_cls: type[E]) -> list[str]:
    """Return the list of values for the given Enum class."""

    return [member.value for member in enum_cls]


def sqla_enum[E: Enum](enum_cls: type[E], **kwargs) -> SQLEnum:
    """Create an ``SQLEnum`` that stores the enum *values* instead of names."""

    return SQLEnum(
        enum_cls,
        values_callable=enum_values,
        validate_strings=True,
        **kwargs,
    )


__all__ = ["sqla_enum", "enum_values"]

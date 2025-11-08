"""Merge postal code branch into main history"""

from __future__ import annotations

revision = "20250301_0026_merge_postal_code_branch"
down_revision = ("20250220_0025", "20240703_0001")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge branch."""


def downgrade() -> None:
    """No-op merge downgrade."""

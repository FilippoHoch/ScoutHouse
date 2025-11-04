"""Ensure structure_type enum includes land and mixed"""

from collections.abc import Sequence

from alembic import op

from migrations.utils.postgres import add_enum_value_if_missing

revision: str = "20241010_0018"
down_revision: str | None = "20240920_0017_structure_contact_emails"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    add_enum_value_if_missing("structure_type", "land")
    add_enum_value_if_missing("structure_type", "mixed")


def downgrade() -> None:
    # Removing enum values is not supported without recreating the type.
    pass

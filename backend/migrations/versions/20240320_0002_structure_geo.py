"""add geolocation fields to structures"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20240320_0002"
down_revision: str | None = "20240320_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

NEW_STRUCTURE_TYPE = sa.Enum(
    "house",
    "land",
    "mixed",
    name="structure_type",
)

OLD_STRUCTURE_TYPE = sa.Enum(
    "community",
    "event",
    "training",
    name="structure_type",
)


def upgrade() -> None:
    bind = op.get_bind()

    # Update enum values
    op.execute("ALTER TYPE structure_type RENAME TO structure_type_old")
    NEW_STRUCTURE_TYPE.create(bind, checkfirst=False)
    op.execute(
        "ALTER TABLE structures "
        "ALTER COLUMN type TYPE structure_type USING type::text::structure_type"
    )
    op.execute("DROP TYPE structure_type_old")

    # Add new columns and indexes
    op.add_column("structures", sa.Column("address", sa.Text(), nullable=True))
    op.add_column(
        "structures",
        sa.Column("latitude", sa.Numeric(9, 6), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("longitude", sa.Numeric(9, 6), nullable=True),
    )
    op.execute(
        "ALTER TABLE structures DROP CONSTRAINT IF EXISTS uq_structures_slug"
    )
    op.create_index(
        "idx_structures_slug_unique",
        "structures",
        ["slug"],
        unique=True,
    )
    op.create_index(
        "idx_structures_province",
        "structures",
        ["province"],
    )
    op.create_index(
        "idx_structures_name_lower",
        "structures",
        [sa.text("lower(name)")],
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("idx_structures_name_lower", table_name="structures")
    op.drop_index("idx_structures_province", table_name="structures")
    op.drop_index("idx_structures_slug_unique", table_name="structures")
    op.create_unique_constraint("uq_structures_slug", "structures", ["slug"])

    op.drop_column("structures", "longitude")
    op.drop_column("structures", "latitude")
    op.drop_column("structures", "address")

    op.execute("ALTER TYPE structure_type RENAME TO structure_type_new")
    OLD_STRUCTURE_TYPE.create(bind, checkfirst=False)
    op.execute(
        "ALTER TABLE structures "
        "ALTER COLUMN type TYPE structure_type USING type::text::structure_type"
    )
    op.execute("DROP TYPE structure_type_new")

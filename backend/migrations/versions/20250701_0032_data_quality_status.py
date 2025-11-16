"""Replace data quality flags with status column and map legacy values"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import JSON, Integer, inspect

# revision identifiers, used by Alembic.
revision: str = "20250701_0032"
down_revision: Union[str, None] = "20250615_0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


data_quality_status_enum = sa.Enum(
    "verified",
    "unverified",
    name="structure_data_quality_status",
)

structures_table = sa.table(
    "structures",
    sa.column("id", Integer),
    sa.column("data_quality_flags", JSON),
    sa.column("data_quality_status", data_quality_status_enum),
)


def upgrade() -> None:
    bind = op.get_bind()
    data_quality_status_enum.create(bind, checkfirst=True)
    op.add_column(
        "structures",
        sa.Column(
            "data_quality_status",
            data_quality_status_enum,
            nullable=False,
            server_default="unverified",
        ),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.select(
            structures_table.c.id,
            structures_table.c.data_quality_flags,
        )
    ).fetchall()
    for row in rows:
        flags = row.data_quality_flags or []
        status = "unverified" if len(flags) > 0 else "verified"
        connection.execute(
            sa.update(structures_table)
            .where(structures_table.c.id == row.id)
            .values(data_quality_status=status)
        )

    op.alter_column("structures", "data_quality_status", server_default=None)

    existing_columns = {col["name"] for col in inspect(connection).get_columns("structures")}
    if "data_quality_flags" in existing_columns:
        op.drop_column("structures", "data_quality_flags")


def downgrade() -> None:
    op.add_column("structures", sa.Column("data_quality_flags", sa.JSON(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(
        sa.select(
            structures_table.c.id,
            structures_table.c.data_quality_status,
        )
    ).fetchall()
    for row in rows:
        flags: list[str] | None = []
        if row.data_quality_status == "unverified":
            flags = ["legacy_data_unverified"]
        connection.execute(
            sa.update(structures_table)
            .where(structures_table.c.id == row.id)
            .values(data_quality_flags=flags)
        )

    op.drop_column("structures", "data_quality_status")
    data_quality_status_enum.drop(op.get_bind(), checkfirst=True)

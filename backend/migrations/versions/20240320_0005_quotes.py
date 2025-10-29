"""Create quotes table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from migrations.utils.postgres import (
    create_enum_if_not_exists,
    create_index_if_not_exists,
    drop_enum_if_exists,
)

# revision identifiers, used by Alembic.
revision = "20240320_0005"
down_revision = "20240320_0004"
branch_labels = None
depends_on = None

scenario_enum_name = "quote_scenario"
scenario_enum_values = ("best", "realistic", "worst")
json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    create_enum_if_not_exists(scenario_enum_name, scenario_enum_values)
    scenario_enum = postgresql.ENUM(
        *scenario_enum_values,
        name=scenario_enum_name,
        create_type=False,
    )

    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("quotes"):
        op.create_table(
            "quotes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "event_id",
                sa.Integer(),
                sa.ForeignKey("events.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "structure_id",
                sa.Integer(),
                sa.ForeignKey("structures.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "scenario", scenario_enum, nullable=False, server_default="realistic"
            ),
            sa.Column("currency", sa.CHAR(length=3), nullable=False, server_default="EUR"),
            sa.Column("totals", json_type, nullable=False),
            sa.Column("breakdown", json_type, nullable=False),
            sa.Column("inputs", json_type, nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS ix_quotes_event_id ON "quotes" (event_id)'
    )
    create_index_if_not_exists(
        'CREATE INDEX IF NOT EXISTS ix_quotes_structure_id ON "quotes" (structure_id)'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_quotes_structure_id')
    op.execute('DROP INDEX IF EXISTS ix_quotes_event_id')
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("quotes"):
        op.drop_table("quotes")
    drop_enum_if_exists(scenario_enum_name)

"""Create quotes table"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20240320_0005"
down_revision = "20240320_0004"
branch_labels = None
depends_on = None

scenario_enum = sa.Enum("best", "realistic", "worst", name="quote_scenario")
json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    scenario_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "quotes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "structure_id",
            sa.Integer(),
            sa.ForeignKey("structures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scenario",
            scenario_enum,
            nullable=False,
            server_default="realistic",
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
    op.create_index("ix_quotes_event_id", "quotes", ["event_id"])
    op.create_index("ix_quotes_structure_id", "quotes", ["structure_id"])


def downgrade() -> None:
    op.drop_index("ix_quotes_structure_id", table_name="quotes")
    op.drop_index("ix_quotes_event_id", table_name="quotes")
    op.drop_table("quotes")
    scenario_enum.drop(op.get_bind(), checkfirst=True)

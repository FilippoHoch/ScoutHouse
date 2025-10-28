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

# NOTE:
# The PostgreSQL ENUM type is created separately with an idempotent DO block to
# avoid race conditions where the type exists from a prior partially-applied
# migration (for example when the worker restarts mid-run). Using
# ``postgresql.ENUM`` with ``create_type=False`` on the column prevents
# SQLAlchemy from attempting to recreate the type for each table creation.
scenario_enum_name = "quote_scenario"
scenario_enum_values = ("best", "realistic", "worst")
scenario_enum = postgresql.ENUM(
    *scenario_enum_values,
    name=scenario_enum_name,
    create_type=False,
)
json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def _quote_literal(value: str) -> str:
    """Return a PostgreSQL-safe literal representation of *value*.

    The migration only uses static strings, but guarding against stray single
    quotes keeps the helper safe if the enum values are ever adjusted.
    """

    return value.replace("'", "''")


def _create_enum_type_if_not_exists() -> None:
    enum_name_literal = _quote_literal(scenario_enum_name)
    enum_values_literal = ", ".join(
        f"'{_quote_literal(value)}'" for value in scenario_enum_values
    )

    op.execute(
        sa.text(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = '{enum_name_literal}'
                ) THEN
                    EXECUTE 'CREATE TYPE ' || quote_ident('{enum_name_literal}') ||
                        ' AS ENUM ({enum_values_literal})';
                END IF;
            END;
            $$;
            """
        )
    )


def upgrade() -> None:
    _create_enum_type_if_not_exists()

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
    enum_name_literal = _quote_literal(scenario_enum_name)
    op.execute(
        sa.text(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = '{enum_name_literal}'
                ) THEN
                    EXECUTE 'DROP TYPE ' || quote_ident('{enum_name_literal}');
                END IF;
            END;
            $$;
            """
        )
    )

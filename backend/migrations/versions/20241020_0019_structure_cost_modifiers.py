"""structure cost modifiers

Revision ID: 20241020_0019
Revises: 20241010_0018
Create Date: 2024-10-20 00:19:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241020_0019"
down_revision = "20241010_0018"
branch_labels = None
depends_on = None


STRUCTURE_COST_MODIFIER_KIND = "structure_cost_modifier_kind"


def upgrade() -> None:
    op.create_table(
        "structure_cost_modifier",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cost_option_id", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "season",
                "date_range",
                "weekend",
                name=STRUCTURE_COST_MODIFIER_KIND,
            ),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "season",
            sa.Enum(
                "winter",
                "spring",
                "summer",
                "autumn",
                name="structure_season",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("date_start", sa.Date(), nullable=True),
        sa.Column("date_end", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(
            ["cost_option_id"],
            ["structure_cost_option.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "(kind != 'date_range') OR (date_start IS NOT NULL AND date_end IS NOT NULL AND date_start <= date_end)",
            name="ck_structure_cost_modifier_date_range",
        ),
    )
    op.create_index(
        "ix_structure_cost_modifier_cost_option_id",
        "structure_cost_modifier",
        ["cost_option_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_structure_cost_modifier_cost_option_id", table_name="structure_cost_modifier")
    op.drop_table("structure_cost_modifier")
    op.execute(f"DROP TYPE IF EXISTS {STRUCTURE_COST_MODIFIER_KIND}")

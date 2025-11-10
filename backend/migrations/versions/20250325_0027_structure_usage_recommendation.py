from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250325_0027"
down_revision = "20250301_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    usage_enum = sa.Enum(
        "outings_only",
        "camps_only",
        "prefer_outings",
        "prefer_camps",
        name="structure_usage_recommendation",
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        usage_enum.create(bind, checkfirst=True)

    op.add_column(
        "structures",
        sa.Column("usage_recommendation", usage_enum, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("structures", "usage_recommendation")

    usage_enum = sa.Enum(
        "outings_only",
        "camps_only",
        "prefer_outings",
        "prefer_camps",
        name="structure_usage_recommendation",
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        usage_enum.drop(bind, checkfirst=True)

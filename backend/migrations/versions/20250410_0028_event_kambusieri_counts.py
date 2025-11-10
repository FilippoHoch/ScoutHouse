import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20250410_0028"
down_revision = "20250325_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "event_branch_segments",
        sa.Column("kambusieri_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column(
        "event_branch_segments",
        "kambusieri_count",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("event_branch_segments", "kambusieri_count")

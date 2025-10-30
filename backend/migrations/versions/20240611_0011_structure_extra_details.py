"""Add extra structure details"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20240611_0011"
down_revision = "20240320_0010_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("structures", sa.Column("beds", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("bathrooms", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("showers", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("dining_capacity", sa.Integer(), nullable=True))
    op.add_column(
        "structures",
        sa.Column(
            "has_kitchen",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column("structures", sa.Column("website_url", sa.String(length=255), nullable=True))
    op.add_column("structures", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("structures", "notes")
    op.drop_column("structures", "website_url")
    op.drop_column("structures", "has_kitchen")
    op.drop_column("structures", "dining_capacity")
    op.drop_column("structures", "showers")
    op.drop_column("structures", "bathrooms")
    op.drop_column("structures", "beds")

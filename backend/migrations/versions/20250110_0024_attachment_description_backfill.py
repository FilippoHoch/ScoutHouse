"""Ensure attachment description column exists"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250110_0024"
down_revision = "20241220_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_column("attachments", "description"):
        op.add_column("attachments", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_column("attachments", "description"):
        op.drop_column("attachments", "description")

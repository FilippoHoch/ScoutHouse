"""Ensure attachment description column exists"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20250110_0024"
down_revision = "20241220_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {column["name"] for column in inspector.get_columns("attachments")}

    if "description" not in columns:
        op.add_column("attachments", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {column["name"] for column in inspector.get_columns("attachments")}

    if "description" in columns:
        op.drop_column("attachments", "description")

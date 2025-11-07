"""Add attachment description column

Revision ID: 20240320_0011
Revises: 20240320_0010_attachments
Create Date: 2024-03-20 00:11:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20240320_0011_attachment_description"
down_revision: Union[str, None] = "20240320_0010_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("attachments", "description")


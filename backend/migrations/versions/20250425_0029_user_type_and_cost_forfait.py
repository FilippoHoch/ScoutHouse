"""user type and cost forfait trigger

Revision ID: 20250425_0029
Revises: 20250410_0028
Create Date: 2025-04-25 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20250425_0029"
down_revision: Union[str, None] = "20250410_0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


USER_TYPE_ENUM = sa.Enum("LC", "EG", "RS", "LEADERS", "OTHER", name="user_type")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        USER_TYPE_ENUM.create(bind, checkfirst=True)

    op.add_column(
        "users",
        sa.Column("user_type", USER_TYPE_ENUM, nullable=True),
    )
    op.add_column(
        "structure_cost_option",
        sa.Column("forfait_trigger_total", sa.Numeric(10, 2), nullable=True),
    )



def downgrade() -> None:
    op.drop_column("structure_cost_option", "forfait_trigger_total")
    op.drop_column("users", "user_type")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        USER_TYPE_ENUM.drop(bind, checkfirst=True)

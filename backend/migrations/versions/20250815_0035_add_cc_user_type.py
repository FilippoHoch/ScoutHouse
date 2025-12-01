"""
Add CC user type option

Revision ID: 20250815_0035
Revises: 20250801_0034_transport_access_points
Create Date: 2025-08-15 00:00:00.000000
"""

from typing import Union

from alembic import op

from migrations.utils.postgres import add_enum_value_if_missing

# revision identifiers, used by Alembic.
revision: str = "20250815_0035"
down_revision: Union[str, None] = "20250801_0034_transport_access_points"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        add_enum_value_if_missing("user_type", "CC")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'user_type'
                ) THEN
                    DELETE FROM pg_enum
                    WHERE enumlabel = 'CC'
                      AND enumtypid = (
                          SELECT oid FROM pg_type WHERE typname = 'user_type'
                      );
                END IF;
            END$$;
            """
        )
    # No action needed for SQLite or other dialects

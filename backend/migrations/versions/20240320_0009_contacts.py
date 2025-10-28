"""Add contacts table and candidate link"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20240320_0009"
down_revision: str | None = "20240320_0008"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

preferred_channel_enum = sa.Enum("email", "phone", "other", name="contact_preferred_channel")


def upgrade() -> None:
    preferred_channel_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "structure_id",
            sa.Integer(),
            sa.ForeignKey("structures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column(
            "preferred_channel",
            preferred_channel_enum,
            nullable=False,
            server_default=sa.text("'email'"),
        ),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("gdpr_consent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_index("idx_contacts_structure", "contacts", ["structure_id"])
    op.create_index(
        "idx_contacts_email",
        "contacts",
        ["email"],
        unique=False,
        postgresql_where=sa.text("email IS NOT NULL"),
        sqlite_where=sa.text("email IS NOT NULL"),
    )
    op.create_index(
        "uix_contacts_primary_per_structure",
        "contacts",
        ["structure_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
        sqlite_where=sa.text("is_primary = 1"),
    )

    op.add_column(
        "event_structure_candidate",
        sa.Column(
            "contact_id",
            sa.Integer(),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_event_structure_candidate_contact_id",
        "event_structure_candidate",
        ["contact_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_event_structure_candidate_contact_id", table_name="event_structure_candidate")
    op.drop_column("event_structure_candidate", "contact_id")

    op.drop_index("uix_contacts_primary_per_structure", table_name="contacts")
    op.drop_index("idx_contacts_email", table_name="contacts")
    op.drop_index("idx_contacts_structure", table_name="contacts")
    op.drop_table("contacts")

    preferred_channel_enum.drop(op.get_bind(), checkfirst=True)

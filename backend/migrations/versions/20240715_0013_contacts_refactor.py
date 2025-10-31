"""Refactor contacts to support reuse across structures

Revision ID: 20240715_0013
Revises: 20240320_0011
Create Date: 2024-07-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20240715_0013"
down_revision = "20240320_0011"
branch_labels = None
depends_on = None

CHANNEL_VALUES = ("email", "phone", "other")


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_preferred_channel') THEN
            CREATE TYPE contact_preferred_channel AS ENUM ('email','phone','other');
          END IF;
        END$$;
        """
    )

    preferred_channel = postgresql.ENUM(
        *CHANNEL_VALUES,
        name="contact_preferred_channel",
        create_type=False,
        validate_strings=True,
    )

    op.add_column("contacts", sa.Column("first_name", sa.Text(), nullable=True))
    op.add_column("contacts", sa.Column("last_name", sa.Text(), nullable=True))

    if insp.has_table("contacts"):
        # Preserve existing names by copying them to first_name when available
        op.execute("UPDATE contacts SET first_name = name WHERE name IS NOT NULL")

    op.create_table(
        "structure_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "structure_id",
            sa.Integer(),
            sa.ForeignKey("structures.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            sa.Integer(),
            sa.ForeignKey("contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.Text(), nullable=True),
        sa.Column(
            "preferred_channel",
            preferred_channel,
            nullable=False,
            server_default=sa.text("'email'"),
        ),
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
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
        sa.UniqueConstraint("structure_id", "contact_id", name="uix_structure_contact_unique"),
    )

    # Copy existing relationships into the new linking table
    if insp.has_table("contacts"):
        op.execute(
            """
            INSERT INTO structure_contacts (
                structure_id,
                contact_id,
                role,
                preferred_channel,
                is_primary,
                gdpr_consent_at,
                created_at,
                updated_at
            )
            SELECT
                structure_id,
                id,
                role,
                preferred_channel,
                is_primary,
                gdpr_consent_at,
                created_at,
                updated_at
            FROM contacts
            """
        )

    op.create_index(
        "idx_structure_contacts_structure",
        "structure_contacts",
        ["structure_id"],
    )
    op.create_index(
        "idx_structure_contacts_contact",
        "structure_contacts",
        ["contact_id"],
    )
    op.create_index(
        "uix_structure_contacts_primary",
        "structure_contacts",
        ["structure_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
        sqlite_where=sa.text("is_primary = 1"),
    )

    # Drop constraints that depended on structure-specific data
    if insp.has_table("contacts"):
        existing_indexes = {idx["name"] for idx in insp.get_indexes("contacts")}
        if "idx_contacts_structure" in existing_indexes:
            op.drop_index("idx_contacts_structure", table_name="contacts")
        if "uix_contacts_primary_per_structure" in existing_indexes:
            op.drop_index("uix_contacts_primary_per_structure", table_name="contacts")

        existing_constraints = {
            constraint["name"]
            for constraint in insp.get_unique_constraints("contacts")
        }
        if "uq_contact_structure_email" in existing_constraints:
            op.drop_constraint(
                "uq_contact_structure_email", "contacts", type_="unique"
            )

    op.drop_column("contacts", "structure_id")
    op.drop_column("contacts", "role")
    op.drop_column("contacts", "preferred_channel")
    op.drop_column("contacts", "is_primary")
    op.drop_column("contacts", "gdpr_consent_at")
    op.drop_column("contacts", "name")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    op.add_column(
        "contacts",
        sa.Column("name", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "contacts",
        sa.Column("gdpr_consent_at", sa.DateTime(timezone=True), nullable=True),
    )
    preferred_channel = postgresql.ENUM(
        *CHANNEL_VALUES,
        name="contact_preferred_channel",
        create_type=False,
        validate_strings=True,
    )
    op.add_column(
        "contacts",
        sa.Column(
            "is_primary", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "contacts",
        sa.Column(
            "preferred_channel",
            preferred_channel,
            nullable=False,
            server_default=sa.text("'email'"),
        ),
    )
    op.add_column("contacts", sa.Column("role", sa.Text(), nullable=True))
    op.add_column(
        "contacts",
        sa.Column(
            "structure_id",
            sa.Integer(),
            sa.ForeignKey("structures.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    if insp.has_table("structure_contacts"):
        # Copy data back into the contact table. Pick the first structure when multiple exist.
        op.execute(
            """
            WITH ranked AS (
                SELECT
                    sc.contact_id,
                    sc.structure_id,
                    sc.role,
                    sc.preferred_channel,
                    sc.is_primary,
                    sc.gdpr_consent_at,
                    sc.created_at,
                    sc.updated_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY sc.contact_id
                        ORDER BY sc.is_primary DESC, sc.created_at
                    ) AS rn
                FROM structure_contacts sc
            )
            UPDATE contacts c
            SET
                structure_id = ranked.structure_id,
                role = ranked.role,
                preferred_channel = ranked.preferred_channel,
                is_primary = ranked.is_primary,
                gdpr_consent_at = ranked.gdpr_consent_at,
                created_at = ranked.created_at,
                updated_at = ranked.updated_at
            FROM ranked
            WHERE ranked.contact_id = c.id AND ranked.rn = 1
            """
        )

        # Populate name column from first/last name fallback data
        op.execute(
            """
            UPDATE contacts
            SET name = TRIM(
                COALESCE(NULLIF(first_name, ''), '') ||
                CASE
                    WHEN first_name IS NOT NULL AND first_name <> '' AND last_name IS NOT NULL AND last_name <> ''
                        THEN ' ' || last_name
                    WHEN (first_name IS NULL OR first_name = '') AND last_name IS NOT NULL AND last_name <> ''
                        THEN last_name
                    ELSE ''
                END
            )
            """
        )

        # Provide fallbacks for empty names
        op.execute(
            """
            UPDATE contacts
            SET name = COALESCE(NULLIF(name, ''), COALESCE(email, phone, 'Contatto'))
            """
        )

        # Ensure structure_id is filled for existing links
        op.execute(
            """
            WITH ranked AS (
                SELECT
                    sc.contact_id,
                    sc.structure_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY sc.contact_id
                        ORDER BY sc.is_primary DESC, sc.created_at
                    ) AS rn
                FROM structure_contacts sc
            )
            UPDATE contacts c
            SET structure_id = ranked.structure_id
            FROM ranked
            WHERE ranked.contact_id = c.id AND ranked.rn = 1
            """
        )

    # Restore indexes and constraints
    op.create_index("idx_contacts_structure", "contacts", ["structure_id"])
    op.create_index(
        "uix_contacts_primary_per_structure",
        "contacts",
        ["structure_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
        sqlite_where=sa.text("is_primary = 1"),
    )
    op.create_unique_constraint(
        "uq_contact_structure_email", "contacts", ["structure_id", "email"]
    )

    op.drop_index("uix_structure_contacts_primary", table_name="structure_contacts")
    op.drop_index("idx_structure_contacts_contact", table_name="structure_contacts")
    op.drop_index("idx_structure_contacts_structure", table_name="structure_contacts")
    op.drop_table("structure_contacts")

    op.drop_column("contacts", "last_name")
    op.drop_column("contacts", "first_name")

    op.alter_column("contacts", "structure_id", nullable=False)


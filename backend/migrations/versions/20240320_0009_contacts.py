from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20240320_0009_contacts"
down_revision = "20240320_0008"
branch_labels = None
depends_on = None

preferred_channel_enum = sa.Enum(
    "email",
    "phone",
    "other",
    name="contact_preferred_channel",
    create_type=False,
    validate_strings=True,
)


def upgrade():
    conn = op.get_bind()
    insp = inspect(conn)

    preferred_channel_enum.create(conn, checkfirst=True)

    if not insp.has_table("contacts"):
        op.create_table(
            "contacts",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "structure_id",
                sa.Integer,
                sa.ForeignKey("structures.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.Text, nullable=False),
            sa.Column("role", sa.Text, nullable=True),
            sa.Column("email", sa.Text, nullable=True),
            sa.Column("phone", sa.Text, nullable=True),
            sa.Column(
                "preferred_channel",
                preferred_channel_enum,
                nullable=False,
                server_default=sa.text("'email'"),
            ),
            sa.Column(
                "is_primary", sa.Boolean, nullable=False, server_default=sa.false()
            ),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column(
                "gdpr_consent_at", sa.DateTime(timezone=True), nullable=True
            ),
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

    insp = inspect(conn)

    if insp.has_table("contacts"):
        existing_indexes = {idx["name"] for idx in insp.get_indexes("contacts")}
        if "idx_contacts_structure" not in existing_indexes:
            op.create_index("idx_contacts_structure", "contacts", ["structure_id"])
        if "idx_contacts_email" not in existing_indexes:
            op.create_index(
                "idx_contacts_email",
                "contacts",
                ["email"],
                unique=False,
                postgresql_where=sa.text("email IS NOT NULL"),
                sqlite_where=sa.text("email IS NOT NULL"),
            )
        if "uix_contacts_primary_per_structure" not in existing_indexes:
            op.create_index(
                "uix_contacts_primary_per_structure",
                "contacts",
                ["structure_id"],
                unique=True,
                postgresql_where=sa.text("is_primary"),
                sqlite_where=sa.text("is_primary = 1"),
            )

        existing_constraints = {
            constraint["name"]
            for constraint in insp.get_unique_constraints("contacts")
        }
        if "uq_contact_structure_email" not in existing_constraints:
            op.create_unique_constraint(
                "uq_contact_structure_email", "contacts", ["structure_id", "email"]
            )

    if insp.has_table("event_structure_candidate"):
        candidate_columns = {
            column["name"] for column in insp.get_columns("event_structure_candidate")
        }
        if "contact_id" not in candidate_columns:
            op.add_column(
                "event_structure_candidate",
                sa.Column(
                    "contact_id",
                    sa.Integer,
                    sa.ForeignKey("contacts.id", ondelete="SET NULL"),
                    nullable=True,
                ),
            )
            op.create_index(
                "ix_event_structure_candidate_contact_id",
                "event_structure_candidate",
                ["contact_id"],
            )


def downgrade():
    conn = op.get_bind()
    insp = inspect(conn)

    if insp.has_table("event_structure_candidate"):
        candidate_columns = {
            column["name"] for column in insp.get_columns("event_structure_candidate")
        }
        if "contact_id" in candidate_columns:
            existing_indexes = {
                idx["name"] for idx in insp.get_indexes("event_structure_candidate")
            }
            if "ix_event_structure_candidate_contact_id" in existing_indexes:
                op.drop_index(
                    "ix_event_structure_candidate_contact_id",
                    table_name="event_structure_candidate",
                )
            op.drop_column("event_structure_candidate", "contact_id")

    insp = inspect(conn)

    if insp.has_table("contacts"):
        existing_indexes = {idx["name"] for idx in insp.get_indexes("contacts")}
        if "uix_contacts_primary_per_structure" in existing_indexes:
            op.drop_index(
                "uix_contacts_primary_per_structure", table_name="contacts"
            )
        if "idx_contacts_email" in existing_indexes:
            op.drop_index("idx_contacts_email", table_name="contacts")
        if "idx_contacts_structure" in existing_indexes:
            op.drop_index("idx_contacts_structure", table_name="contacts")

        existing_constraints = {
            constraint["name"]
            for constraint in insp.get_unique_constraints("contacts")
        }
        if "uq_contact_structure_email" in existing_constraints:
            op.drop_constraint(
                "uq_contact_structure_email", "contacts", type_="unique"
            )

        op.drop_table("contacts")

    preferred_channel_enum.drop(conn, checkfirst=True)

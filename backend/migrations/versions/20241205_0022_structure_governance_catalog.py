import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20241205_0022"
down_revision = "20241112_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    structure_operational_status = sa.Enum(
        "operational",
        "seasonal",
        "temporarily_closed",
        "permanently_closed",
        name="structure_operational_status",
    )
    structure_contact_status = sa.Enum(
        "unknown",
        "to_contact",
        "contacted",
        "confirmed",
        "stale",
        name="structure_contact_status",
    )
    structure_animal_policy = sa.Enum(
        "allowed",
        "allowed_on_request",
        "forbidden",
        name="structure_animal_policy",
    )
    structure_field_slope = sa.Enum(
        "flat",
        "gentle",
        "moderate",
        "steep",
        name="structure_field_slope",
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        structure_operational_status.create(bind, checkfirst=True)
        structure_contact_status.create(bind, checkfirst=True)
        structure_animal_policy.create(bind, checkfirst=True)
        structure_field_slope.create(bind, checkfirst=True)

    op.add_column("structures", sa.Column("municipality", sa.String(length=255), nullable=True))
    op.add_column("structures", sa.Column("municipality_code", sa.String(length=16), nullable=True))
    op.add_column("structures", sa.Column("locality", sa.String(length=255), nullable=True))
    op.add_column("structures", sa.Column("indoor_rooms", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("field_slope", structure_field_slope, nullable=True))
    op.add_column("structures", sa.Column("pitches_tende", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("water_at_field", sa.Boolean(), nullable=True))
    op.add_column("structures", sa.Column("fire_rules", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("bus_type_access", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("wheelchair_accessible", sa.Boolean(), nullable=True))
    op.add_column("structures", sa.Column("step_free_access", sa.Boolean(), nullable=True))
    op.add_column("structures", sa.Column("parking_car_slots", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("parking_bus_slots", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("parking_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("accessibility_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("allowed_audiences", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("usage_rules", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("animal_policy", structure_animal_policy, nullable=True))
    op.add_column("structures", sa.Column("animal_policy_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("in_area_protetta", sa.Boolean(), nullable=True))
    op.add_column(
        "structures",
        sa.Column("ente_area_protetta", sa.String(length=255), nullable=True),
    )
    op.add_column("structures", sa.Column("environmental_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("seasonal_amenities", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("booking_url", sa.String(length=255), nullable=True))
    op.add_column("structures", sa.Column("whatsapp", sa.String(length=32), nullable=True))
    op.add_column(
        "structures",
        sa.Column(
            "contact_status",
            structure_contact_status,
            nullable=False,
            server_default="unknown",
        ),
    )
    op.add_column(
        "structures",
        sa.Column("operational_status", structure_operational_status, nullable=True),
    )
    op.add_column("structures", sa.Column("data_source", sa.String(length=255), nullable=True))
    op.add_column("structures", sa.Column("data_source_url", sa.String(length=255), nullable=True))
    op.add_column("structures", sa.Column("data_last_verified", sa.Date(), nullable=True))
    op.add_column("structures", sa.Column("governance_notes", sa.Text(), nullable=True))

    op.add_column(
        "structure_open_periods",
        sa.Column("blackout", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.alter_column("structure_cost_option", "deposit", new_column_name="booking_deposit")
    op.add_column(
        "structure_cost_option",
        sa.Column("damage_deposit", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "structure_cost_option",
        sa.Column("utilities_included", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "structure_cost_option",
        sa.Column("utilities_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "structure_cost_option",
        sa.Column("payment_methods", sa.JSON(), nullable=True),
    )
    op.add_column(
        "structure_cost_option",
        sa.Column("payment_terms", sa.Text(), nullable=True),
    )
    op.add_column(
        "structure_cost_option",
        sa.Column("price_per_resource", sa.JSON(), nullable=True),
    )

    op.add_column(
        "structure_cost_modifier",
        sa.Column("price_per_resource", sa.JSON(), nullable=True),
    )

    op.alter_column("structures", "contact_status", server_default=None)
    op.alter_column("structure_open_periods", "blackout", server_default=None)


def downgrade() -> None:
    op.alter_column("structure_open_periods", "blackout", server_default=sa.false())
    op.drop_column("structure_open_periods", "blackout")

    op.drop_column("structure_cost_modifier", "price_per_resource")

    op.drop_column("structure_cost_option", "price_per_resource")
    op.drop_column("structure_cost_option", "payment_terms")
    op.drop_column("structure_cost_option", "payment_methods")
    op.drop_column("structure_cost_option", "utilities_notes")
    op.drop_column("structure_cost_option", "utilities_included")
    op.drop_column("structure_cost_option", "damage_deposit")
    op.alter_column("structure_cost_option", "booking_deposit", new_column_name="deposit")

    op.drop_column("structures", "governance_notes")
    op.drop_column("structures", "data_last_verified")
    op.drop_column("structures", "data_source_url")
    op.drop_column("structures", "data_source")
    op.drop_column("structures", "operational_status")
    op.drop_column("structures", "contact_status")
    op.drop_column("structures", "whatsapp")
    op.drop_column("structures", "booking_url")
    op.drop_column("structures", "seasonal_amenities")
    op.drop_column("structures", "environmental_notes")
    op.drop_column("structures", "ente_area_protetta")
    op.drop_column("structures", "in_area_protetta")
    op.drop_column("structures", "animal_policy_notes")
    op.drop_column("structures", "animal_policy")
    op.drop_column("structures", "usage_rules")
    op.drop_column("structures", "allowed_audiences")
    op.drop_column("structures", "accessibility_notes")
    op.drop_column("structures", "parking_notes")
    op.drop_column("structures", "parking_bus_slots")
    op.drop_column("structures", "parking_car_slots")
    op.drop_column("structures", "step_free_access")
    op.drop_column("structures", "wheelchair_accessible")
    op.drop_column("structures", "bus_type_access")
    op.drop_column("structures", "fire_rules")
    op.drop_column("structures", "water_at_field")
    op.drop_column("structures", "pitches_tende")
    op.drop_column("structures", "field_slope")
    op.drop_column("structures", "indoor_rooms")
    op.drop_column("structures", "locality")
    op.drop_column("structures", "municipality_code")
    op.drop_column("structures", "municipality")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        sa.Enum(name="structure_operational_status").drop(bind, checkfirst=True)
        sa.Enum(name="structure_contact_status").drop(bind, checkfirst=True)
        sa.Enum(name="structure_animal_policy").drop(bind, checkfirst=True)
        sa.Enum(name="structure_field_slope").drop(bind, checkfirst=True)

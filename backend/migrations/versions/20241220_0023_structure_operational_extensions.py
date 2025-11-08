"""Add operational extensions to structures"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20241220_0023"
down_revision = "20241205_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cell_coverage_enum = sa.Enum(
        "none",
        "limited",
        "good",
        "excellent",
        name="structure_cell_coverage",
    )
    wastewater_enum = sa.Enum(
        "none",
        "septic",
        "holding_tank",
        "mains",
        "unknown",
        name="structure_wastewater_type",
    )
    flood_risk_enum = sa.Enum(
        "none",
        "low",
        "medium",
        "high",
        name="structure_flood_risk",
    )
    river_swimming_enum = sa.Enum(
        "si",
        "no",
        "unknown",
        name="structure_river_swimming",
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        cell_coverage_enum.create(bind, checkfirst=True)
        wastewater_enum.create(bind, checkfirst=True)
        flood_risk_enum.create(bind, checkfirst=True)
        river_swimming_enum.create(bind, checkfirst=True)

    op.add_column(
        "structures",
        sa.Column("country", sa.String(length=2), nullable=False, server_default="IT"),
    )
    op.add_column("structures", sa.Column("plus_code", sa.String(length=16), nullable=True))
    op.add_column("structures", sa.Column("what3words", sa.String(length=64), nullable=True))
    op.add_column("structures", sa.Column("emergency_coordinates", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("winter_access_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures",
        sa.Column("road_weight_limit_tonnes", sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("bridge_weight_limit_tonnes", sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("max_vehicle_height_m", sa.Numeric(4, 2), nullable=True),
    )
    op.add_column("structures", sa.Column("road_access_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures", sa.Column("power_capacity_kw", sa.Numeric(7, 2), nullable=True)
    )
    op.add_column("structures", sa.Column("power_outlets_count", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("power_outlet_types", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("generator_available", sa.Boolean(), nullable=True))
    op.add_column("structures", sa.Column("generator_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures", sa.Column("water_tank_capacity_liters", sa.Integer(), nullable=True)
    )
    op.add_column(
        "structures",
        sa.Column("wastewater_type", wastewater_enum, nullable=True),
    )
    op.add_column("structures", sa.Column("wastewater_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("dry_toilet", sa.Boolean(), nullable=True))
    op.add_column("structures", sa.Column("outdoor_bathrooms", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("outdoor_showers", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("booking_required", sa.Boolean(), nullable=True))
    op.add_column("structures", sa.Column("booking_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("documents_required", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("map_resources_urls", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("event_rules_url", sa.String(length=255), nullable=True))
    op.add_column("structures", sa.Column("event_rules_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures",
        sa.Column("cell_coverage", cell_coverage_enum, nullable=True),
    )
    op.add_column("structures", sa.Column("cell_coverage_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures",
        sa.Column("communications_infrastructure", sa.JSON(), nullable=True),
    )
    op.add_column("structures", sa.Column("aed_on_site", sa.Boolean(), nullable=True))
    op.add_column(
        "structures",
        sa.Column("emergency_phone_available", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "structures",
        sa.Column("emergency_response_time_minutes", sa.Integer(), nullable=True),
    )
    op.add_column("structures", sa.Column("emergency_plan_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures", sa.Column("evacuation_plan_url", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "structures",
        sa.Column(
            "risk_assessment_template_url", sa.String(length=255), nullable=True
        ),
    )
    op.add_column("structures", sa.Column("wildlife_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures", sa.Column("river_swimming", river_swimming_enum, nullable=True)
    )
    op.add_column(
        "structures", sa.Column("flood_risk", flood_risk_enum, nullable=True)
    )
    op.add_column("structures", sa.Column("weather_risk_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("activity_spaces", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("activity_equipment", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("inclusion_services", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("inclusion_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("pec_email", sa.String(length=255), nullable=True))
    op.add_column(
        "structures", sa.Column("sdi_recipient_code", sa.String(length=7), nullable=True)
    )
    op.add_column("structures", sa.Column("invoice_available", sa.Boolean(), nullable=True))
    op.add_column("structures", sa.Column("iban", sa.String(length=34), nullable=True))
    op.add_column("structures", sa.Column("payment_methods", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("fiscal_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("data_quality_score", sa.Integer(), nullable=True))
    op.add_column("structures", sa.Column("data_quality_notes", sa.Text(), nullable=True))
    op.add_column("structures", sa.Column("data_quality_flags", sa.JSON(), nullable=True))
    op.add_column("structures", sa.Column("logistics_arrival_notes", sa.Text(), nullable=True))
    op.add_column(
        "structures", sa.Column("logistics_departure_notes", sa.Text(), nullable=True)
    )

    op.execute("UPDATE structures SET country='IT' WHERE country IS NULL")
    op.alter_column("structures", "country", server_default=None)

    op.create_check_constraint(
        "power_capacity_kw_non_negative",
        "structures",
        "power_capacity_kw >= 0 OR power_capacity_kw IS NULL",
    )
    op.create_check_constraint(
        "power_outlets_count_non_negative",
        "structures",
        "power_outlets_count >= 0 OR power_outlets_count IS NULL",
    )
    op.create_check_constraint(
        "water_tank_capacity_liters_non_negative",
        "structures",
        "water_tank_capacity_liters >= 0 OR water_tank_capacity_liters IS NULL",
    )
    op.create_check_constraint(
        "outdoor_bathrooms_non_negative",
        "structures",
        "outdoor_bathrooms >= 0 OR outdoor_bathrooms IS NULL",
    )
    op.create_check_constraint(
        "outdoor_showers_non_negative",
        "structures",
        "outdoor_showers >= 0 OR outdoor_showers IS NULL",
    )
    op.create_check_constraint(
        "emergency_response_time_minutes_non_negative",
        "structures",
        "emergency_response_time_minutes >= 0 OR emergency_response_time_minutes IS NULL",
    )
    op.create_check_constraint(
        "data_quality_score_range",
        "structures",
        "data_quality_score BETWEEN 0 AND 100 OR data_quality_score IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint("data_quality_score_range", "structures", type_="check")
    op.drop_constraint(
        "emergency_response_time_minutes_non_negative",
        "structures",
        type_="check",
    )
    op.drop_constraint("outdoor_showers_non_negative", "structures", type_="check")
    op.drop_constraint("outdoor_bathrooms_non_negative", "structures", type_="check")
    op.drop_constraint(
        "water_tank_capacity_liters_non_negative",
        "structures",
        type_="check",
    )
    op.drop_constraint(
        "power_outlets_count_non_negative", "structures", type_="check"
    )
    op.drop_constraint("power_capacity_kw_non_negative", "structures", type_="check")

    op.drop_column("structures", "logistics_departure_notes")
    op.drop_column("structures", "logistics_arrival_notes")
    op.drop_column("structures", "data_quality_flags")
    op.drop_column("structures", "data_quality_notes")
    op.drop_column("structures", "data_quality_score")
    op.drop_column("structures", "fiscal_notes")
    op.drop_column("structures", "payment_methods")
    op.drop_column("structures", "iban")
    op.drop_column("structures", "invoice_available")
    op.drop_column("structures", "sdi_recipient_code")
    op.drop_column("structures", "pec_email")
    op.drop_column("structures", "inclusion_notes")
    op.drop_column("structures", "inclusion_services")
    op.drop_column("structures", "activity_equipment")
    op.drop_column("structures", "activity_spaces")
    op.drop_column("structures", "weather_risk_notes")
    op.drop_column("structures", "flood_risk")
    op.drop_column("structures", "river_swimming")
    op.drop_column("structures", "wildlife_notes")
    op.drop_column("structures", "risk_assessment_template_url")
    op.drop_column("structures", "evacuation_plan_url")
    op.drop_column("structures", "emergency_plan_notes")
    op.drop_column("structures", "emergency_response_time_minutes")
    op.drop_column("structures", "emergency_phone_available")
    op.drop_column("structures", "aed_on_site")
    op.drop_column("structures", "communications_infrastructure")
    op.drop_column("structures", "cell_coverage_notes")
    op.drop_column("structures", "cell_coverage")
    op.drop_column("structures", "event_rules_notes")
    op.drop_column("structures", "event_rules_url")
    op.drop_column("structures", "map_resources_urls")
    op.drop_column("structures", "documents_required")
    op.drop_column("structures", "booking_notes")
    op.drop_column("structures", "booking_required")
    op.drop_column("structures", "outdoor_showers")
    op.drop_column("structures", "outdoor_bathrooms")
    op.drop_column("structures", "dry_toilet")
    op.drop_column("structures", "wastewater_notes")
    op.drop_column("structures", "wastewater_type")
    op.drop_column("structures", "water_tank_capacity_liters")
    op.drop_column("structures", "generator_notes")
    op.drop_column("structures", "generator_available")
    op.drop_column("structures", "power_outlet_types")
    op.drop_column("structures", "power_outlets_count")
    op.drop_column("structures", "power_capacity_kw")
    op.drop_column("structures", "road_access_notes")
    op.drop_column("structures", "max_vehicle_height_m")
    op.drop_column("structures", "bridge_weight_limit_tonnes")
    op.drop_column("structures", "road_weight_limit_tonnes")
    op.drop_column("structures", "winter_access_notes")
    op.drop_column("structures", "emergency_coordinates")
    op.drop_column("structures", "what3words")
    op.drop_column("structures", "plus_code")
    op.drop_column("structures", "country")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        river_swimming_enum = sa.Enum(name="structure_river_swimming")
        flood_risk_enum = sa.Enum(name="structure_flood_risk")
        wastewater_enum = sa.Enum(name="structure_wastewater_type")
        cell_coverage_enum = sa.Enum(name="structure_cell_coverage")
        river_swimming_enum.drop(bind, checkfirst=True)
        flood_risk_enum.drop(bind, checkfirst=True)
        wastewater_enum.drop(bind, checkfirst=True)
        cell_coverage_enum.drop(bind, checkfirst=True)

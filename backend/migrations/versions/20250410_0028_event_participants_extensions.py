"""Add kambusieri counts and detached participants"""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20250410_0028"
down_revision = "20250325_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "event_branch_segments",
        sa.Column("kambusieri_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column(
        "event_branch_segments",
        "kambusieri_count",
        server_default=None,
    )

    conn = op.get_bind()
    events = conn.execute(sa.text("SELECT id, participants FROM events")).mappings().all()
    for row in events:
        participants = dict(row.get("participants") or {})
        participants.setdefault("lc", 0)
        participants.setdefault("eg", 0)
        participants.setdefault("rs", 0)
        participants.setdefault("leaders", 0)
        participants.setdefault("lc_kambusieri", 0)
        participants.setdefault("eg_kambusieri", 0)
        participants.setdefault("rs_kambusieri", 0)
        participants.setdefault("detached_leaders", 0)
        participants.setdefault("detached_guests", 0)
        conn.execute(
            sa.text("UPDATE events SET participants = :participants WHERE id = :id"),
            {"id": row["id"], "participants": json.dumps(participants)},
        )


def downgrade() -> None:
    conn = op.get_bind()
    events = conn.execute(sa.text("SELECT id, participants FROM events")).mappings().all()
    for row in events:
        participants = dict(row.get("participants") or {})
        for key in (
            "lc_kambusieri",
            "eg_kambusieri",
            "rs_kambusieri",
            "detached_leaders",
            "detached_guests",
        ):
            participants.pop(key, None)
        conn.execute(
            sa.text("UPDATE events SET participants = :participants WHERE id = :id"),
            {"id": row["id"], "participants": json.dumps(participants)},
        )

    op.drop_column("event_branch_segments", "kambusieri_count")

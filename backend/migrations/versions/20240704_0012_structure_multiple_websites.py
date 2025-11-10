"""Store multiple website URLs for structures.

Revision ID: 20240704_0012
Revises: 20240701_0012_structure_photos
Create Date: 2024-07-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20240704_0012"
down_revision = "20240701_0012_structure_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("structures", sa.Column("website_urls", sa.JSON(), nullable=True))

    structures = sa.table(
        "structures",
        sa.column("id", sa.Integer()),
        sa.column("website_url", sa.String(length=255)),
        sa.column("website_urls", sa.JSON()),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.select(structures.c.id, structures.c.website_url).where(
            structures.c.website_url.isnot(None)
        )
    ).fetchall()

    for structure_id, url in rows:
        if not url:
            continue
        connection.execute(
            sa.update(structures).where(structures.c.id == structure_id).values(website_urls=[url])
        )

    op.drop_column("structures", "website_url")


def downgrade() -> None:
    op.add_column("structures", sa.Column("website_url", sa.String(length=255), nullable=True))

    structures = sa.table(
        "structures",
        sa.column("id", sa.Integer()),
        sa.column("website_url", sa.String(length=255)),
        sa.column("website_urls", sa.JSON()),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.select(structures.c.id, structures.c.website_urls).where(
            structures.c.website_urls.isnot(None)
        )
    ).fetchall()

    for structure_id, urls in rows:
        first_url = None
        if isinstance(urls, (list, tuple)) and urls:
            first_url = urls[0]
        connection.execute(
            sa.update(structures)
            .where(structures.c.id == structure_id)
            .values(website_url=first_url)
        )

    op.drop_column("structures", "website_urls")

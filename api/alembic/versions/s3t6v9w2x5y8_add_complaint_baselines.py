"""add complaint_baselines table

Revision ID: s3t6v9w2x5y8
Revises: r2s5u8v1w4x7
Create Date: 2026-04-17

Postgres-backed source of truth for per-venue noise-complaint baselines,
with the shrinkage prior persisted alongside so the read path is
self-contained. Redis remains a cache.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "s3t6v9w2x5y8"
down_revision = "r2s5u8v1w4x7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "complaint_baselines",
        sa.Column("venue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("venues.id"), primary_key=True),
        sa.Column("weekly_observed", sa.Float, nullable=False),
        sa.Column("n_weeks", sa.Float, nullable=False),
        sa.Column("borough_prior", sa.Float, nullable=False),
        sa.Column("posterior", sa.Float, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade():
    op.drop_table("complaint_baselines")

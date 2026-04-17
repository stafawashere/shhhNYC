"""add scoring_predictions telemetry table

Revision ID: r2s5u8v1w4x7
Revises: q1r4s7t9u2v5
Create Date: 2026-04-16

Persists every quiet_score call: components, final score, confidence,
and a hash of the realtime signals snapshot. Used to fit calibrated
weights and to evaluate confidence calibration vs DEP residuals.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "r2s5u8v1w4x7"
down_revision = "q1r4s7t9u2v5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scoring_predictions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("venue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("scored_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("hour", sa.SmallInteger, nullable=False),
        sa.Column("dow", sa.SmallInteger, nullable=False),
        sa.Column("static", sa.Float, nullable=False),
        sa.Column("temporal", sa.Float, nullable=False),
        sa.Column("realtime", sa.Float, nullable=False),
        sa.Column("traffic", sa.Float, nullable=False),
        sa.Column("score", sa.Float, nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("signal_hash", sa.String(16), nullable=True),
    )
    op.create_index(
        "idx_scoring_pred_venue_time",
        "scoring_predictions",
        ["venue_id", "scored_at"],
    )


def downgrade():
    op.drop_index("idx_scoring_pred_venue_time", table_name="scoring_predictions")
    op.drop_table("scoring_predictions")

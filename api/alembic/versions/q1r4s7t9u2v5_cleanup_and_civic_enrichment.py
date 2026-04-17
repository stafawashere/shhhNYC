"""cleanup dead fields and add civic enrichment fields

Revision ID: q1r4s7t9u2v5
Revises: p9q2r6s8t4u5
Create Date: 2026-04-16

Drops: has_outlets, wifi_quality, wifi_policy, kid_friendly, noise_level_tripadvisor
Drops: wifi_quality and wifi_policy ENUMs
Adds: has_outdoor_seating, is_cabaret, liquor_license_type, health_grade
"""
from alembic import op
import sqlalchemy as sa

revision = "q1r4s7t9u2v5"
down_revision = "mggen8z0hm4p"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("venues", "has_outlets")
    op.drop_column("venues", "wifi_quality")
    op.drop_column("venues", "wifi_policy")
    op.drop_column("venues", "kid_friendly")
    op.drop_column("venues", "noise_level_tripadvisor")

    op.execute("DROP TYPE IF EXISTS wifi_quality")
    op.execute("DROP TYPE IF EXISTS wifi_policy")

    op.add_column("venues", sa.Column("has_outdoor_seating", sa.Boolean(), nullable=True))
    op.add_column("venues", sa.Column("is_cabaret", sa.Boolean(), nullable=True))
    op.add_column("venues", sa.Column("liquor_license_type", sa.Text(), nullable=True))
    op.add_column("venues", sa.Column("health_grade", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("venues", "health_grade")
    op.drop_column("venues", "liquor_license_type")
    op.drop_column("venues", "is_cabaret")
    op.drop_column("venues", "has_outdoor_seating")

    op.execute("CREATE TYPE wifi_quality AS ENUM ('poor', 'fair', 'good', 'excellent')")
    op.execute("CREATE TYPE wifi_policy AS ENUM ('free', 'paid', 'none')")

    op.add_column("venues", sa.Column("noise_level_tripadvisor", sa.Text(), nullable=True))
    op.add_column("venues", sa.Column("kid_friendly", sa.Boolean(), server_default="true"))
    op.add_column("venues", sa.Column("wifi_policy", sa.Enum("free", "paid", "none", name="wifi_policy"), nullable=True))
    op.add_column("venues", sa.Column("wifi_quality", sa.Enum("poor", "fair", "good", "excellent", name="wifi_quality"), nullable=True))
    op.add_column("venues", sa.Column("has_outlets", sa.Boolean(), server_default="true"))

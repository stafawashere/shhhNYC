"""drop ceiling_type column and enum

Revision ID: m6n9o3p5q8r1
Revises: l5m8n1o4p7q0
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'm6n9o3p5q8r1'
down_revision = '20446a1cceb7'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('venues', 'ceiling_type')
    op.execute("DROP TYPE IF EXISTS ceiling_type")


def downgrade():
    op.execute("""
        CREATE TYPE ceiling_type AS ENUM ('high_hard', 'high_soft', 'low_hard', 'low_soft')
    """)
    op.add_column('venues', sa.Column(
        'ceiling_type',
        sa.Enum('high_hard', 'high_soft', 'low_hard', 'low_soft', name='ceiling_type'),
        nullable=True
    ))

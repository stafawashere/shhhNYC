"""add opening_hours to venues

Revision ID: p9q2r6s8t4u5
Revises: o8p1q5r7s2t3
Create Date: 2026-04-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'p9q2r6s8t4u5'
down_revision = 'o8p1q5r7s2t3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('venues', sa.Column('opening_hours', postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column('venues', 'opening_hours')

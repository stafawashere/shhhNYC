"""add google_review_signal column

Revision ID: k4l7m0n3o6p9
Revises: j3k6l9m2n5o8
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'k4l7m0n3o6p9'
down_revision = ('j3k6l9m2n5o8', '96c868bebf02')
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('venues', sa.Column('google_review_signal', sa.Integer(), nullable=True))

def downgrade():
    op.drop_column('venues', 'google_review_signal')

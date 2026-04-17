"""rename noise_level_yelp to noise_level_tripadvisor

Revision ID: l5m8n1o4p7q0
Revises: k4l7m0n3o6p9
Create Date: 2026-04-11
"""
from alembic import op

revision = 'l5m8n1o4p7q0'
down_revision = 'k4l7m0n3o6p9'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('venues', 'noise_level_yelp', new_column_name='noise_level_tripadvisor')


def downgrade():
    op.alter_column('venues', 'noise_level_tripadvisor', new_column_name='noise_level_yelp')

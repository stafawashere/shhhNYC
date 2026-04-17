"""add phone_number, website_url, venue_types, subway_lines_served to venues

Revision ID: mggen8z0hm4p
Revises: p9q2r6s8t4u5
Create Date: 2026-04-14 22:40:50.000000

Note: opening_hours was already added by p9q2r6s8t4u5.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'mggen8z0hm4p'
down_revision: Union[str, Sequence[str], None] = 'p9q2r6s8t4u5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('venues', sa.Column('phone_number', sa.String(), nullable=True))
    op.add_column('venues', sa.Column('website_url', sa.String(), nullable=True))
    op.add_column('venues', sa.Column('venue_types', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('venues', sa.Column('subway_lines_served', sa.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    op.drop_column('venues', 'subway_lines_served')
    op.drop_column('venues', 'venue_types')
    op.drop_column('venues', 'website_url')
    op.drop_column('venues', 'phone_number')

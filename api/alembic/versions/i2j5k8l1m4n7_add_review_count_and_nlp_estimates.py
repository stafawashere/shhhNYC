"""Add Google review count and Google NLP noise category to venues.

Revision ID: i2j5k8l1m4n7
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i2j5k8l1m4n7'
down_revision: Union[str, Sequence[str], None] = 'h6i9j3k5l7m1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('venues', sa.Column('google_review_count', sa.Integer(), nullable=True))
    op.add_column('venues', sa.Column('google_noise_estimate', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('venues', 'google_noise_estimate')
    op.drop_column('venues', 'google_review_count')

"""Drop foursquare_noise_estimate from venues.

Revision ID: j3k6l9m2n5o8
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'j3k6l9m2n5o8'
down_revision: Union[str, Sequence[str], None] = 'i2j5k8l1m4n7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('venues', 'foursquare_noise_estimate')


def downgrade() -> None:
    op.add_column('venues', sa.Column('foursquare_noise_estimate', sa.Text(), nullable=True))

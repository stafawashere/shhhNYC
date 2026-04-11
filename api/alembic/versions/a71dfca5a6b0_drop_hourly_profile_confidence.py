"""drop_hourly_profile_confidence

Revision ID: a71dfca5a6b0
Revises: e7b3f1d08c45
Create Date: 2026-04-11 01:14:36.907860

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a71dfca5a6b0'
down_revision: Union[str, Sequence[str], None] = 'e7b3f1d08c45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('venue_hourly_profiles', 'confidence')


def downgrade() -> None:
    op.add_column('venue_hourly_profiles', sa.Column('confidence', sa.Float(), nullable=True))

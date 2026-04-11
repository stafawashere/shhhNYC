"""Add MTA disruption, DEP noise, and pedestrian volume fields.

Revision ID: h6i9j3k5l7m1
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'h6i9j3k5l7m1'
down_revision: Union[str, Sequence[str], None] = 'g5h8i2j4k1l9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # realtime_modifiers: MTA service disruption severity + DEP ambient noise level
    op.add_column('realtime_modifiers',
        sa.Column('mta_disruption_severity', sa.Float(), nullable=True, server_default='0.0'))
    op.add_column('realtime_modifiers',
        sa.Column('dep_noise_level', sa.Float(), nullable=True))

    # venues: peak hourly pedestrian volume at nearest DOT intersection
    op.add_column('venues',
        sa.Column('pedestrian_volume', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('realtime_modifiers', 'dep_noise_level')
    op.drop_column('realtime_modifiers', 'mta_disruption_severity')
    op.drop_column('venues', 'pedestrian_volume')

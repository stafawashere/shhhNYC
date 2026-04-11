from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4c1a8e73f29'
down_revision: Union[str, Sequence[str], None] = 'b3e9f0c12d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('realtime_modifiers', sa.Column('event_count', sa.Integer(), nullable=True, server_default='0'))
    op.drop_column('realtime_modifiers', 'nearby_event')


def downgrade() -> None:
    op.add_column('realtime_modifiers', sa.Column('nearby_event', sa.Boolean(), nullable=True))
    op.drop_column('realtime_modifiers', 'event_count')

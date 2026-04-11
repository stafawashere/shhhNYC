from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c9d4b2a71e3f'
down_revision: Union[str, Sequence[str], None] = '28c0bc5b81da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('realtime_modifiers', sa.Column('noise_complaint_nearby', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('realtime_modifiers', 'noise_complaint_nearby')

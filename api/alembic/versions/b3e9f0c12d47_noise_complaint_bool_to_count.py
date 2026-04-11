from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b3e9f0c12d47'
down_revision: Union[str, Sequence[str], None] = 'a71dfca5a6b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('realtime_modifiers', sa.Column('noise_complaint_count', sa.Integer(), nullable=True, server_default='0'))
    op.drop_column('realtime_modifiers', 'noise_complaint_nearby')


def downgrade() -> None:
    op.add_column('realtime_modifiers', sa.Column('noise_complaint_nearby', sa.Boolean(), nullable=True))
    op.drop_column('realtime_modifiers', 'noise_complaint_count')

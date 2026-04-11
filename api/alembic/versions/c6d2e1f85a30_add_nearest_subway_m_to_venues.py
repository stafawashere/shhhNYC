from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c6d2e1f85a30'
down_revision: Union[str, Sequence[str], None] = 'f2a7c3b94e10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('venues', sa.Column('nearest_subway_m', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('venues', 'nearest_subway_m')

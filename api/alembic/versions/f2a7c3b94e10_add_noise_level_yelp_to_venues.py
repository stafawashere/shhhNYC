from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f2a7c3b94e10'
down_revision: Union[str, Sequence[str], None] = 'd4c1a8e73f29'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('venues', sa.Column('noise_level_yelp', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('venues', 'noise_level_yelp')

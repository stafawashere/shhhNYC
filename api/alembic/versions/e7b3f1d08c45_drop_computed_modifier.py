from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e7b3f1d08c45'
down_revision: Union[str, Sequence[str], None] = 'c9d4b2a71e3f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('realtime_modifiers', 'computed_modifier')


def downgrade() -> None:
    op.add_column('realtime_modifiers', sa.Column('computed_modifier', sa.Float(), nullable=True))

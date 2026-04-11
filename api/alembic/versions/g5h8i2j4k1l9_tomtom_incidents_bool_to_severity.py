from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g5h8i2j4k1l9'
down_revision: Union[str, Sequence[str], None] = 'c6d2e1f85a30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert tomtom_incidents_nearby from Boolean to Float.
    # True  → 5.0 (worst-case severity, preserves existing "incident present" data)
    # False → 0.0 (no incident)
    op.alter_column(
        'realtime_modifiers',
        'tomtom_incidents_nearby',
        type_=sa.Float(),
        postgresql_using='CASE WHEN tomtom_incidents_nearby THEN 5.0 ELSE 0.0 END',
        existing_type=sa.Boolean(),
        nullable=True,
        server_default='0.0',
    )


def downgrade() -> None:
    op.alter_column(
        'realtime_modifiers',
        'tomtom_incidents_nearby',
        type_=sa.Boolean(),
        postgresql_using='tomtom_incidents_nearby > 0',
        existing_type=sa.Float(),
        nullable=True,
        server_default='false',
    )

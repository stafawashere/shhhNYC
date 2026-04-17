"""drop espresso_position column and enum

Revision ID: n7o0p4q6r9s2
Revises: m6n9o3p5q8r1
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'n7o0p4q6r9s2'
down_revision = 'm6n9o3p5q8r1'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('venues', 'espresso_position')
    op.execute("DROP TYPE IF EXISTS expresso_position")


def downgrade():
    op.execute("""
        CREATE TYPE expresso_position AS ENUM ('central', 'back_corner', 'separate_room', 'none')
    """)
    op.add_column('venues', sa.Column(
        'espresso_position',
        sa.Enum('central', 'back_corner', 'separate_room', 'none', name='expresso_position'),
        nullable=True
    ))

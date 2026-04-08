from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

revision: str = '6ea91e0077e4'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('venues',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('address', sa.Text(), nullable=False),
    sa.Column('neighborhood', sa.Text(), nullable=True),
    sa.Column('borough', sa.Text(), nullable=True),
    sa.Column('location', geoalchemy2.types.Geography(geometry_type='POINT', srid=4326, dimension=2, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
    sa.Column('sq_ft', sa.Integer(), nullable=True),
    sa.Column('ceiling_type', postgresql.ENUM('high_hard', 'high_soft', 'low_hard', 'low_soft', name='ceiling_type'), nullable=True),
    sa.Column('seating_type', sa.ARRAY(sa.Text()), nullable=True),
    sa.Column('music_policy', postgresql.ENUM('none', 'quiet', 'moderate', 'loud', name='music_policy'), nullable=True),
    sa.Column('espresso_position', postgresql.ENUM('central', 'back_corner', 'separate_room', 'none', name='expresso_position'), nullable=True),
    sa.Column('has_outlets', sa.Boolean(), nullable=True),
    sa.Column('wifi_quality', postgresql.ENUM('poor', 'fair', 'good', 'excellent', name='wifi_quality'), nullable=True),
    sa.Column('wifi_policy', postgresql.ENUM('free', 'paid', 'none', name='wifi_policy'), nullable=True),
    sa.Column('serves_food', sa.Boolean(), nullable=True),
    sa.Column('serves_alcohol', sa.Boolean(), nullable=True),
    sa.Column('kid_friendly', sa.Boolean(), nullable=True),
    sa.Column('price_tier', sa.Integer(), nullable=True),
    sa.Column('google_place_id', sa.Text(), nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('google_place_id')
    )
    op.create_index('idx_venues_neighborhood', 'venues', ['neighborhood'], unique=False)
    op.create_table('realtime_modifiers',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('timestamp', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('google_live_busyness', sa.Float(), nullable=True),
    sa.Column('weather_modifier', sa.Float(), nullable=True),
    sa.Column('nearby_event', sa.Boolean(), nullable=True),
    sa.Column('event_description', sa.Text(), nullable=True),
    sa.Column('construction_nearby', sa.Boolean(), nullable=True),
    sa.Column('computed_modifier', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('user_signals',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('timestamp', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('noise_rating', sa.Integer(), nullable=True),
    sa.Column('headcount_est', sa.Text(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('venue_hourly_profiles',
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('hour', sa.Integer(), nullable=False),
    sa.Column('day_of_week', sa.Integer(), nullable=False),
    sa.Column('busyness_avg', sa.Float(), nullable=True),
    sa.Column('noise_estimate', sa.Float(), nullable=True),
    sa.Column('confidence', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], ),
    sa.PrimaryKeyConstraint('venue_id', 'hour', 'day_of_week')
    )


def downgrade() -> None:
    op.drop_table('venue_hourly_profiles')
    op.drop_table('user_signals')
    op.drop_table('realtime_modifiers')
    op.drop_index('idx_venues_neighborhood', table_name='venues')
    op.drop_table('venues')

"""replace realtime_modifiers with signal_events

Revision ID: o8p1q5r7s2t3
Revises: n7o0p4q6r9s2
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'o8p1q5r7s2t3'
down_revision = 'n7o0p4q6r9s2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'signal_events',
        sa.Column('id',          sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('venue_id',    postgresql.UUID(as_uuid=True), sa.ForeignKey('venues.id'), nullable=False),
        sa.Column('signal_type', sa.Text(), nullable=False),
        sa.Column('value',       postgresql.JSONB(), nullable=False),
        sa.Column('captured_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(
        'idx_se_venue_type_time',
        'signal_events',
        ['venue_id', 'signal_type', 'captured_at'],
    )
    op.drop_index('idx_rt_mod_venue_timestamp', table_name='realtime_modifiers')
    op.drop_table('realtime_modifiers')


def downgrade():
    op.create_table(
        'realtime_modifiers',
        sa.Column('id',                      sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('venue_id',                postgresql.UUID(as_uuid=True), sa.ForeignKey('venues.id'), nullable=False),
        sa.Column('timestamp',               sa.TIMESTAMP(timezone=True), server_default=sa.text('now()')),
        sa.Column('google_live_busyness',    sa.Float(), nullable=True),
        sa.Column('weather_modifier',        sa.Float(), nullable=True),
        sa.Column('event_count',             sa.Integer(), default=0),
        sa.Column('event_description',       sa.Text(), nullable=True),
        sa.Column('noise_complaint_count',   sa.Integer(), default=0),
        sa.Column('construction_nearby',     sa.Boolean(), default=False),
        sa.Column('tomtom_traffic_congestion', sa.Float(), nullable=True),
        sa.Column('tomtom_incidents_nearby', sa.Float(), default=0.0),
        sa.Column('mta_disruption_severity', sa.Float(), default=0.0),
        sa.Column('dep_noise_level',         sa.Float(), nullable=True),
        sa.Column('dep_complaint_count',     sa.Integer(), nullable=True),
        sa.Column('dep_severe_count',        sa.Integer(), nullable=True),
    )
    op.create_index(
        'idx_rt_mod_venue_timestamp',
        'realtime_modifiers',
        ['venue_id', 'timestamp'],
    )
    op.drop_index('idx_se_venue_type_time', table_name='signal_events')
    op.drop_table('signal_events')

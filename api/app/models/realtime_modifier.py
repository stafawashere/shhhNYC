from datetime import datetime, timezone
from sqlalchemy import Column, Float, Boolean, Integer, Text, TIMESTAMP, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import func
from app.db.session import Base


class RealtimeModifier(Base):
    __tablename__ = "realtime_modifiers"
    __table_args__ = (
        Index("idx_rt_mod_venue_timestamp", "venue_id", "timestamp"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    venue_id = Column(UUID, ForeignKey("venues.id"), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))

    google_live_busyness = Column(Float)
    weather_modifier = Column(Float)
    event_count = Column(Integer, default=0)
    event_description = Column(Text)
    noise_complaint_count = Column(Integer, default=0)
    construction_nearby = Column(Boolean, default=False)
    tomtom_traffic_congestion = Column(Float)
    tomtom_incidents_nearby = Column(Float, default=0.0)
    mta_disruption_severity = Column(Float, default=0.0)
    dep_noise_level = Column(Float)
    dep_complaint_count = Column(Integer)
    dep_severe_count = Column(Integer)

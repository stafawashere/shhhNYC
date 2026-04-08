from sqlalchemy import Column, Float, Boolean, Integer, Text, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import func
from app.db.session import Base


class RealtimeModifier(Base):
    __tablename__ = "realtime_modifiers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    venue_id = Column(UUID, ForeignKey("venues.id"), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), server_default=func.now())

    google_live_busyness = Column(Float)
    weather_modifier = Column(Float)
    nearby_event = Column(Boolean, default=False)
    event_description = Column(Text)
    construction_nearby = Column(Boolean, default=False)
    computed_modifier = Column(Float)

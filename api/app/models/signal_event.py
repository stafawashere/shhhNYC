from sqlalchemy import Column, BigInteger, Text, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB, TIMESTAMP
from sqlalchemy import func
from app.db.session import Base


SIGNAL_TTLS = {
    "weather":          120,
    "events":           120,
    "noise_complaints": 120,
    "construction":     240,
    "tomtom":           120,
    "mta":              60,
    "dep_noise":        20_160,
}

SIGNAL_CONFIDENCE = {
    "weather":          0.03,
    "events":           0.03,
    "noise_complaints": 0.03,
    "construction":     0.01,
    "tomtom":           0.07,
    "mta":              0.04,
    "dep_noise":        0.10,
}


class SignalEvent(Base):
    __tablename__ = "signal_events"
    __table_args__ = (
        Index("idx_se_venue_type_time", "venue_id", "signal_type", "captured_at"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    venue_id = Column(UUID, ForeignKey("venues.id"), nullable=False)
    signal_type = Column(Text, nullable=False)
    value = Column(JSONB, nullable=False)
    captured_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

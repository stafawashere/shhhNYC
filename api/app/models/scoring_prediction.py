from sqlalchemy import Column, BigInteger, Float, SmallInteger, String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from sqlalchemy import func
from app.db.session import Base


class ScoringPrediction(Base):
    __tablename__ = "scoring_predictions"
    __table_args__ = (
        Index("idx_scoring_pred_venue_time", "venue_id", "scored_at"),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    venue_id = Column(UUID, ForeignKey("venues.id"), nullable=False)
    scored_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    hour = Column(SmallInteger, nullable=False)
    dow = Column(SmallInteger, nullable=False)
    static = Column(Float, nullable=False)
    temporal = Column(Float, nullable=False)
    realtime = Column(Float, nullable=False)
    traffic = Column(Float, nullable=False)
    score = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)
    signal_hash = Column(String(16), nullable=True)

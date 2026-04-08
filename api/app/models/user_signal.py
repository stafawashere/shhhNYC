from sqlalchemy import Column, Integer, Text, TIMESTAMP, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import func
from app.db.session import Base


class UserSignal(Base):
    __tablename__ = "user_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    venue_id = Column(UUID, ForeignKey("venues.id"), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), server_default=func.now())

    noise_rating = Column(Integer, CheckConstraint("noise_rating BETWEEN 1 AND 5"))
    headcount_est = Column(Text)
    notes = Column(Text)

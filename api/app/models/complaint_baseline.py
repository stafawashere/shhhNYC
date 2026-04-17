from sqlalchemy import Column, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from sqlalchemy import func
from app.db.session import Base


class ComplaintBaseline(Base):
    __tablename__ = "complaint_baselines"

    venue_id = Column(UUID, ForeignKey("venues.id"), primary_key=True)
    weekly_observed = Column(Float, nullable=False)
    n_weeks = Column(Float, nullable=False)
    borough_prior = Column(Float, nullable=False)
    posterior = Column(Float, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

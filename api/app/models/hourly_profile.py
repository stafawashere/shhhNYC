from sqlalchemy import Column, Float, Integer
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base
from sqlalchemy import CheckConstraint, ForeignKey


class VenueHourlyProfile(Base):
    __tablename__ = "venue_hourly_profiles"

    venue_id = Column(UUID, ForeignKey("venues.id"), primary_key=True)
    hour = Column(Integer, CheckConstraint("hour BETWEEN 0 AND 23"), primary_key=True, nullable=False)
    day_of_week = Column(Integer, CheckConstraint("day_of_week BETWEEN 0 AND 6"), primary_key=True, nullable=False)
    busyness_avg = Column(Float, CheckConstraint("busyness_avg BETWEEN 0 AND 100"))
    noise_estimate = Column(Float)
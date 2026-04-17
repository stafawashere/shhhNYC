from sqlalchemy import Column, Text, Boolean, Integer, ARRAY, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, ENUM, JSONB
from app.db.session import Base
from geoalchemy2 import Geography
from sqlalchemy import func, CheckConstraint, Index
import uuid


MusicPolicy = ENUM(
    "none", "quiet", "moderate", "loud",
    name="music_policy"
)


class Venue(Base):
    __tablename__ = "venues"
    __table_args__ = (
        Index("idx_venues_location", "location", postgresql_using="gist"),
        Index("idx_venues_neighborhood", "neighborhood"),
    )

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    address = Column(Text, nullable=False)
    neighborhood = Column(Text)
    borough = Column(Text)
    location = Column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    sq_ft = Column(Integer)
    seating_type = Column(ARRAY(Text))
    music_policy = Column(MusicPolicy)
    serves_food = Column(Boolean, default=True)
    serves_alcohol = Column(Boolean, default=False)
    price_tier = Column(Integer, CheckConstraint("price_tier BETWEEN 1 AND 4"))
    nearest_subway_m = Column(Integer)
    pedestrian_volume = Column(Integer)
    google_review_count = Column(Integer)
    google_noise_estimate = Column(Text)
    google_review_signal = Column(Integer)
    photos = Column(ARRAY(Text))
    google_place_id = Column(Text, unique=True)
    opening_hours = Column(JSONB)
    phone_number = Column(Text, nullable=True)
    website_url = Column(Text, nullable=True)
    venue_types = Column(ARRAY(Text), nullable=True)
    subway_lines_served = Column(ARRAY(Text), nullable=True)
    has_outdoor_seating = Column(Boolean, nullable=True)
    is_cabaret = Column(Boolean, nullable=True)
    liquor_license_type = Column(Text, nullable=True)
    health_grade = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
from sqlalchemy import Column, Text, Boolean, Integer, ARRAY, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID, ENUM
from app.db.session import Base
from geoalchemy2 import Geography
from sqlalchemy import func, CheckConstraint, Index
import uuid


CeilingType = ENUM(
    "high_hard", "high_soft", "low_hard", "low_soft", 
    name="ceiling_type"
)

MusicPolicy = ENUM(
    "none", "quiet", "moderate", "loud",
    name="music_policy"
)

ExpressoPosition = ENUM(
    "central", "back_corner", "separate_room", "none",
    name="expresso_position"
)

WifiQuality = ENUM(
    "poor", "fair", "good", "excellent",
    name="wifi_quality"
)

WifiPolicy = ENUM(
    "free", "paid", "none",
    name="wifi_policy"
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
    ceiling_type = Column(CeilingType)
    seating_type = Column(ARRAY(Text))
    music_policy = Column(MusicPolicy)
    espresso_position = Column(ExpressoPosition)
    has_outlets = Column(Boolean, default=True)
    wifi_quality = Column(WifiQuality)
    wifi_policy = Column(WifiPolicy)
    serves_food = Column(Boolean, default=True)
    serves_alcohol = Column(Boolean, default=False)
    kid_friendly = Column(Boolean, default=True)
    price_tier = Column(Integer, CheckConstraint("price_tier BETWEEN 1 AND 4"))

    noise_level_yelp = Column(Text) 
    nearest_subway_m = Column(Integer)
    pedestrian_volume = Column(Integer)
    google_review_count = Column(Integer) 
    google_noise_estimate = Column(Text) 
    photos = Column(ARRAY(Text))
    google_place_id = Column(Text, unique=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

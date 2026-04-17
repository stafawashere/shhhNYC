from pydantic import BaseModel, ConfigDict
from typing import Optional
import uuid


class VenueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    address: str
    neighborhood: Optional[str] = None
    borough: Optional[str] = None
    sq_ft: Optional[int] = None
    seating_type: Optional[list[str]] = None
    music_policy: Optional[str] = None
    serves_food: Optional[bool] = None
    serves_alcohol: Optional[bool] = None
    price_tier: Optional[int] = None
    google_noise_estimate: Optional[str] = None
    google_place_id: Optional[str] = None
    photos: Optional[list[str]] = None
    opening_hours: Optional[dict] = None
    phone_number: Optional[str] = None
    website_url: Optional[str] = None
    venue_types: Optional[list[str]] = None
    subway_lines_served: Optional[list[str]] = None
    nearest_subway_m: Optional[int] = None
    pedestrian_volume: Optional[int] = None
    google_review_count: Optional[int] = None
    has_outdoor_seating: Optional[bool] = None
    is_cabaret: Optional[bool] = None
    liquor_license_type: Optional[str] = None
    health_grade: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class ScoreBreakdown(BaseModel):
    venue_traits: float
    time_pattern: float
    live_adjustment: float
    traffic_penalty: float = 0.0


class ScoreModelInfo(BaseModel):
    version: Optional[str] = None
    max_noise: float
    calibrated: bool
    n_train: Optional[int] = None


class ScoreResponse(BaseModel):
    quiet_score: Optional[int] = None
    label: str
    confidence: float
    breakdown: ScoreBreakdown
    traffic_congestion: Optional[float] = None
    closed: bool = False
    model: Optional[ScoreModelInfo] = None


class VenueWithScore(BaseModel):
    venue: VenueResponse
    score: ScoreResponse

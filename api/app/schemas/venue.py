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
    ceiling_type: Optional[str] = None
    seating_type: Optional[list[str]] = None
    music_policy: Optional[str] = None
    espresso_position: Optional[str] = None
    has_outlets: Optional[bool] = None
    wifi_quality: Optional[str] = None
    wifi_policy: Optional[str] = None
    serves_food: Optional[bool] = None
    serves_alcohol: Optional[bool] = None
    kid_friendly: Optional[bool] = None
    price_tier: Optional[int] = None
    google_place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class ScoreBreakdown(BaseModel):
    venue_traits: float
    time_pattern: float
    live_adjustment: float
    traffic_penalty: float = 0.0


class ScoreResponse(BaseModel):
    quiet_score: int
    label: str
    confidence: float
    breakdown: ScoreBreakdown
    traffic_congestion: Optional[float] = None


class VenueWithScore(BaseModel):
    venue: VenueResponse
    score: ScoreResponse

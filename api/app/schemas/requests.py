from pydantic import BaseModel
from typing import Optional


class CreateVenueRequest(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    neighborhood: Optional[str] = None
    borough: Optional[str] = None
    sq_ft: Optional[int] = None
    ceiling_type: Optional[str] = None
    seating_type: Optional[list[str]] = None
    music_policy: Optional[str] = None
    espresso_position: Optional[str] = None
    has_outlets: bool = True
    wifi_quality: Optional[str] = None
    wifi_policy: Optional[str] = None
    serves_food: bool = True
    serves_alcohol: bool = False
    kid_friendly: bool = True
    price_tier: Optional[int] = None
    google_place_id: Optional[str] = None


class SubmitSignalRequest(BaseModel):
    noise_rating: int
    headcount_est: Optional[str] = None
    notes: Optional[str] = None

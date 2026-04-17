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
    seating_type: Optional[list[str]] = None
    music_policy: Optional[str] = None
    serves_food: bool = True
    serves_alcohol: bool = False
    price_tier: Optional[int] = None
    google_place_id: Optional[str] = None

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import cast
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_MakePoint, ST_Distance
from geoalchemy2.shape import to_shape
from app.db.session import get_db
from app.models.venue import Venue
from app.scoring.composite import quiet_score
from app.schemas.venue import VenueWithScore, ScoreResponse

router = APIRouter(prefix="/venues", tags=["venues"])


def venue_to_dict(v: Venue) -> dict:
    point = to_shape(v.location)
    return {
        "id": v.id, "name": v.name, "address": v.address,
        "neighborhood": v.neighborhood, "borough": v.borough,
        "sq_ft": v.sq_ft, "ceiling_type": v.ceiling_type,
        "seating_type": v.seating_type, "music_policy": v.music_policy,
        "espresso_position": v.espresso_position, "has_outlets": v.has_outlets,
        "wifi_quality": v.wifi_quality, "wifi_policy": v.wifi_policy,
        "serves_food": v.serves_food, "serves_alcohol": v.serves_alcohol,
        "kid_friendly": v.kid_friendly, "price_tier": v.price_tier,
        "google_place_id": v.google_place_id,
        "lat": point.y, "lng": point.x,
    }


@router.get("/nearby", response_model=list[VenueWithScore])
def get_nearby_venues(lat: float, lng: float, radius: float = 0.5, limit: int = 20, db: Session = Depends(get_db)):
    point = cast(ST_MakePoint(lng, lat), Geography)
    venues = (
        db.query(Venue)
        .filter(ST_DWithin(Venue.location, point, radius * 1000))
        .order_by(ST_Distance(Venue.location, point))
        .limit(limit)
        .all()
    )
    return [{"venue": venue_to_dict(v), "score": quiet_score(db, v)} for v in venues]


@router.get("/search")
def search_venues(q: str, neighborhood: str | None = None, db: Session = Depends(get_db)):
    pass


@router.get("/{venue_id}", response_model=VenueWithScore)
def get_venue(venue_id: str, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    return {"venue": venue_to_dict(venue), "score": quiet_score(db, venue)}


@router.get("/{venue_id}/predict", response_model=ScoreResponse)
def predict_venue(venue_id: str, day: int, hour: int, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    dt = datetime.now().replace(hour=hour)
    return quiet_score(db, venue, dt)


@router.post("/{venue_id}/signal")
def submit_signal(venue_id: str, db: Session = Depends(get_db)):
    pass

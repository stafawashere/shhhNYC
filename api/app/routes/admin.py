from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from app.db.session import get_db
from app.models.venue import Venue
from app.schemas.requests import CreateVenueRequest
from app.schemas.venue import VenueResponse
from app.routes.venues import venue_to_dict

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/venues", response_model=VenueResponse)
def create_venue(body: CreateVenueRequest, db: Session = Depends(get_db)):
    if body.google_place_id:
        existing = db.query(Venue).filter(Venue.google_place_id == body.google_place_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Venue with this google_place_id already exists")

    venue = Venue(
        name=body.name,
        address=body.address,
        location=from_shape(Point(body.lng, body.lat), srid=4326),
        neighborhood=body.neighborhood,
        borough=body.borough,
        sq_ft=body.sq_ft,
        seating_type=body.seating_type,
        music_policy=body.music_policy,
        serves_food=body.serves_food,
        serves_alcohol=body.serves_alcohol,
        price_tier=body.price_tier,
        google_place_id=body.google_place_id,
    )

    db.add(venue)
    db.commit()
    db.refresh(venue)
    return venue_to_dict(venue)

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("/nearby")
def get_nearby_venues(lat: float, lng: float, radius: float = 0.5, limit: int = 20, db: Session = Depends(get_db)):
    pass


@router.get("/search")
def search_venues(q: str, neighborhood: str | None = None, db: Session = Depends(get_db)):
    pass


@router.get("/{venue_id}")
def get_venue(venue_id: str, db: Session = Depends(get_db)):
    pass


@router.get("/{venue_id}/predict")
def predict_venue(venue_id: str, day: int, hour: int, db: Session = Depends(get_db)):
    pass


@router.post("/{venue_id}/signal")
def submit_signal(venue_id: str, db: Session = Depends(get_db)):
    pass

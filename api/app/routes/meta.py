from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.venue import Venue

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/neighborhoods")
def get_neighborhoods(db: Session = Depends(get_db)):
    rows = db.query(Venue.neighborhood).distinct().filter(Venue.neighborhood.isnot(None)).all()
    return [r[0] for r in rows]

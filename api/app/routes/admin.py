from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/venues")
def create_venue(db: Session = Depends(get_db)):
    pass

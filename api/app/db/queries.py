from sqlalchemy.orm import Session
from app.models.hourly_profile import VenueHourlyProfile
from app.models.realtime_modifier import RealtimeModifier


def get_hourly_profile(db: Session, venue_id, hour: int, day_of_week: int):
    return db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id,
        VenueHourlyProfile.hour == hour,
        VenueHourlyProfile.day_of_week == day_of_week,
    ).first()


def get_latest_realtime(db: Session, venue_id):
    return (
        db.query(RealtimeModifier)
        .filter(RealtimeModifier.venue_id == venue_id)
        .order_by(RealtimeModifier.timestamp.desc())
        .first()
    )

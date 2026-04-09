from datetime import datetime
from sqlalchemy.orm import Session
from app.models.venue import Venue
from app.db.queries import get_hourly_profile


def temporal_score(db: Session, venue: Venue, dt: datetime) -> float:
    profile = get_hourly_profile(db, venue_id=venue.id, hour=dt.hour, day_of_week=dt.weekday())
    if profile is None:
        return 25.0

    base = profile.busyness_avg * 0.5

    if venue.serves_food and dt.hour in range(11, 15):
        base *= 1.2  # lunch rush

    if venue.serves_alcohol and dt.hour >= 17:
        base *= 1.15  # happy hour

    return max(0.0, min(50.0, base))

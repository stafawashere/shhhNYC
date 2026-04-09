from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.venue import Venue
from app.db.queries import get_hourly_profile, get_latest_realtime


def realtime_score(db: Session, venue: Venue) -> float:
    rt = get_latest_realtime(db, venue.id)
    if rt is None: return 0.0

    modifier = 0.0
    now = datetime.now(timezone.utc)
    if rt.google_live_busyness is not None:
        expected = get_hourly_profile(db, venue.id, now.hour, now.weekday())
        if expected:
            deviation = rt.google_live_busyness - expected.busyness_avg
            modifier += deviation * 0.1

    if rt.weather_modifier is not None:
        modifier += rt.weather_modifier

    if rt.nearby_event:
        modifier += 5.0

    if rt.construction_nearby:
        modifier += 4.0

    return max(-15.0, min(15.0, modifier))

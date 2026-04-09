from datetime import datetime
from sqlalchemy.orm import Session
from app.models.venue import Venue
from app.db.queries import get_hourly_profile
from app.scoring.static import static_score
from app.scoring.temporal import temporal_score
from app.scoring.realtime import realtime_score


def score_to_label(score: float) -> str:
    if score >= 80: return "Very Quiet"
    if score >= 60: return "Quiet"
    if score >= 40: return "Moderate"
    if score >= 20: return "Loud"
    return "Very Loud"


def compute_confidence(venue: Venue, profile) -> float:
    if profile is None:
        return 0.4
    if profile.confidence is not None:
        return profile.confidence
    return 0.7


def quiet_score(db: Session, venue: Venue, dt: datetime = None) -> dict:
    dt = dt or datetime.now()

    s = static_score(venue)
    t = temporal_score(db, venue, dt)
    r = realtime_score(db, venue)

    noise_score = max(0, min(100, s + t + r))
    score = 100 - noise_score

    profile = get_hourly_profile(db, venue.id, dt.hour, dt.weekday())

    return {
        "quiet_score": round(score),
        "label": score_to_label(score),
        "confidence": compute_confidence(venue, profile),
        "breakdown": {
            "venue_traits": s,
            "time_pattern": t,
            "live_adjustment": r,
        }
    }

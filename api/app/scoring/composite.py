import math
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from app.models.venue import Venue
from app.models.signal_event import SIGNAL_TTLS, SIGNAL_CONFIDENCE
from app.db.queries import (
    get_hourly_profile,
    get_latest_signals,
    count_profile_slots,
)
from app.scoring.static import static_score
from app.scoring.temporal import temporal_score, temporal_score_from_data
from app.scoring.realtime import realtime_score, Signals

_NYC_TZ = ZoneInfo("America/New_York")
_MAX_NOISE = 115.0


def score_to_label(score: float) -> str:
    if score >= 80: return "Very Quiet"
    if score >= 60: return "Quiet"
    if score >= 40: return "Moderate"
    if score >= 20: return "Loud"
    return "Very Loud"


def _review_count_factor(review_count: int | None) -> float:
    if not review_count or review_count < 1:
        return 0.0
    return min(1.0, math.log10(review_count) / 3.0)


def _to_category(level: str | None) -> str | None:
    if level in ("quiet",):               return "quiet"
    if level in ("average", "moderate"):  return "moderate"
    if level in ("loud", "very_loud"):    return "loud"
    return None


def compute_confidence(venue: Venue, profile, signals: Signals, slot_count: int) -> float:
    now = datetime.now(_NYC_TZ)
    score = 0.0
    if slot_count > 0:
        score += 0.05 + 0.25 * min(1.0, slot_count / 112)

    if profile is not None and profile.busyness_avg is not None:
        score += 0.05

    if venue.google_noise_estimate is not None:
        score += 0.07 * _review_count_factor(venue.google_review_count)

    for sig_type, max_contrib in SIGNAL_CONFIDENCE.items():
        entry = signals.get(sig_type)
        if entry is None:
            continue
        _, captured_at = entry
        ttl_min = SIGNAL_TTLS[sig_type]
        age_min = (now - captured_at.astimezone(_NYC_TZ)).total_seconds() / 60
        if age_min <= ttl_min:
            score += max_contrib

    return round(min(1.0, score), 2)


def _get_complaint_baseline(venue_id) -> float:
    try:
        from app.config import settings
        import redis as _redis
        r = _redis.from_url(settings.redis_url, decode_responses=True)
        val = r.get(f"complaint_baseline:{venue_id}")
        return float(val) if val else 0.0
    except Exception:
        return 0.0


def _build_score_dict(venue: Venue, profile, signals: Signals, slot_count: int, s: float, t: float, r: float, tp: float) -> dict:
    noise_raw = max(0.0, s + t + r + tp)
    score = max(0.0, min(100.0, 100.0 - (noise_raw / _MAX_NOISE) * 100.0))
    tomtom_entry = signals.get("tomtom")
    traffic_congestion = tomtom_entry[0].get("congestion") if tomtom_entry else None

    return {
        "quiet_score": round(score),
        "label": score_to_label(score),
        "confidence": compute_confidence(venue=venue, profile=profile, signals=signals, slot_count=slot_count),
        "breakdown": {
            "venue_traits":    s,
            "time_pattern":    t,
            "live_adjustment": r,
            "traffic_penalty": tp,
        },
        "traffic_congestion": traffic_congestion,
    }


def quiet_score(db: Session, venue: Venue, dt: datetime = None, include_realtime: bool = True) -> dict:
    dt = dt or datetime.now(_NYC_TZ)
    profile    = get_hourly_profile(db, venue.id, dt.hour, dt.weekday())
    signals    = get_latest_signals(db, venue.id) if include_realtime else {}
    slot_count = count_profile_slots(db, venue.id)
    complaint_baseline = _get_complaint_baseline(venue.id) if include_realtime else 0.0
    s = static_score(venue)
    t = temporal_score(db, profile, venue, dt)
    r, tp = realtime_score(venue, signals, complaint_baseline) if include_realtime else (0.0, 0.0)

    return _build_score_dict(venue, profile, signals, slot_count, s, t, r, tp)


def quiet_score_from_data(venue: Venue, dt: datetime, profile, signals: Signals, slot_count: int, recent_signals: list, dow_signals: list, complaint_baseline: float) -> dict:
    s  = static_score(venue)
    t  = temporal_score_from_data(profile, venue, dt, recent_signals, dow_signals)
    r, tp = realtime_score(venue, signals, complaint_baseline)

    return _build_score_dict(venue, profile, signals, slot_count, s, t, r, tp)

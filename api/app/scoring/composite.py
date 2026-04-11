import math
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from app.models.venue import Venue
from app.db.queries import (
    get_hourly_profile,
    get_latest_realtime,
    count_recent_signals,
    count_profile_slots,
    signal_confidence,
    get_user_signal_avg,
)
from app.scoring.static import static_score
from app.scoring.temporal import temporal_score
from app.scoring.realtime import realtime_score

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


def _user_avg_to_category(avg: float | None) -> str | None:
    if avg is None:  return None
    if avg < 2.0:    return "quiet"
    if avg < 3.5:    return "moderate"
    return "loud"


def _consensus_bonus(venue: Venue, user_avg: float | None) -> float:
    cats: list[str] = []
    c = _to_category(venue.noise_level_yelp)
    if c: cats.append(c)
    c = _to_category(venue.google_noise_estimate)
    if c: cats.append(c)
    c = _user_avg_to_category(user_avg)
    if c: cats.append(c)

    if len(cats) < 2:
        return 0.0
    if len(set(cats)) == 1:
        return 0.15 if len(cats) >= 3 else 0.10
    return 0.0


def compute_confidence(venue: Venue, profile, rt_row, slot_count: int, sig_score: float, user_avg: float | None = None,) -> float:
    if slot_count > 0:
        score = 0.05 + 0.25 * min(1.0, slot_count / 112)
    else:
        score = 0.00

    if profile is not None and profile.busyness_avg is not None:
        score += 0.05

    if venue.noise_level_yelp is not None:
        score += 0.08

    if venue.google_noise_estimate is not None:
        score += 0.07 * _review_count_factor(venue.google_review_count)

    if rt_row is not None:
        age_min = (datetime.now(_NYC_TZ) - rt_row.timestamp.astimezone(_NYC_TZ)).total_seconds() / 60
        if age_min < 30:    score += 0.18
        elif age_min < 90:  score += 0.10
        elif age_min < 360: score += 0.03

        if rt_row.tomtom_traffic_congestion is not None: score += 0.07
        if rt_row.google_live_busyness is not None:      score += 0.04
        if rt_row.dep_noise_level is not None:           score += 0.10

    score += sig_score
    score += _consensus_bonus(venue, user_avg)

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


def quiet_score(db: Session, venue: Venue, dt: datetime = None, include_realtime: bool = True) -> dict:
    dt = dt or datetime.now(_NYC_TZ)

    profile = get_hourly_profile(db, venue.id, dt.hour, dt.weekday())
    rt_row = get_latest_realtime(db, venue.id) if include_realtime else None
    signal_count = count_recent_signals(db, venue.id)
    slot_count = count_profile_slots(db, venue.id)
    sig_score = signal_confidence(db, venue.id, dt=dt)
    user_avg = get_user_signal_avg(db, venue.id, dt=dt)
    complaint_baseline = _get_complaint_baseline(venue.id) if include_realtime else 0.0

    s = static_score(venue)
    t = temporal_score(db, profile, venue, dt, signal_count)
    r, tp = realtime_score(venue, rt_row, profile, complaint_baseline) if include_realtime else (0.0, 0.0)

    noise_raw = max(0.0, s + t + r + tp)
    score = max(0.0, min(100.0, 100.0 - (noise_raw / _MAX_NOISE) * 100.0))

    return {
        "quiet_score": round(score),
        "label": score_to_label(score),
        "confidence": compute_confidence(
            venue=venue,
            profile=profile,
            rt_row=rt_row,
            slot_count=slot_count,
            sig_score=sig_score,
            user_avg=user_avg,
        ),
        "breakdown": {
            "venue_traits": s,
            "time_pattern": t,
            "live_adjustment": r,
            "traffic_penalty": tp,
        },
        "traffic_congestion": rt_row.tomtom_traffic_congestion if rt_row else None,
    }

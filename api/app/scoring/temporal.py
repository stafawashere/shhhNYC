import math
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from app.models.venue import Venue
from app.models.user_signal import UserSignal

_NYC_TZ = ZoneInfo("America/New_York")


def _weighted_signal_adjustment(recent: list, dow_signals: list, now: datetime) -> float:
    if not recent and not dow_signals:
        return 0.0

    total_w, weighted_sum = 0.0, 0.0

    for s in recent:
        ts = s.timestamp.astimezone(_NYC_TZ)
        age_h = (now - ts).total_seconds() / 3600
        w = math.exp(-age_h / 24)
        total_w += w
        weighted_sum += w * s.noise_rating

    for s in dow_signals:
        ts = s.timestamp.astimezone(_NYC_TZ)
        age_h = (now - ts).total_seconds() / 3600
        w = math.exp(-age_h / 24) * 0.5
        total_w += w
        weighted_sum += w * s.noise_rating

    if total_w == 0:
        return 0.0

    avg_rating = weighted_sum / total_w
    return (avg_rating - 3.0) / 2.0 * 10.0


def _signal_adjustment(db: Session, venue_id, dt: datetime) -> float:
    now = datetime.now(_NYC_TZ)
    cutoff_recent = now - timedelta(hours=72)
    cutoff_dow    = now - timedelta(days=14)

    recent = (
        db.query(UserSignal)
        .filter(UserSignal.venue_id == venue_id, UserSignal.timestamp >= cutoff_recent)
        .order_by(UserSignal.timestamp.desc())
        .limit(10)
        .all()
    )

    candidates = (
        db.query(UserSignal)
        .filter(
            UserSignal.venue_id == venue_id,
            UserSignal.timestamp >= cutoff_dow,
            UserSignal.timestamp < cutoff_recent,
        )
        .order_by(UserSignal.timestamp.desc())
        .limit(20)
        .all()
    )
    dow_signals = [
        s for s in candidates
        if (
            s.timestamp.astimezone(_NYC_TZ).weekday() == dt.weekday()
            and abs(s.timestamp.astimezone(_NYC_TZ).hour - dt.hour) <= 2
        )
    ]

    return _weighted_signal_adjustment(recent, dow_signals, now)


def _fallback_noise(venue: Venue, h: int) -> float:
    alcohol = venue.serves_alcohol
    food = venue.serves_food

    if alcohol and not food:
        if 21 <= h <= 23: return 35.0
        if 17 <= h <= 20: return 30.0
        if 15 <= h <= 16: return 14.0
        if 11 <= h <= 14: return 10.0
        return 4.0

    if alcohol and food:
        if 17 <= h <= 20: return 30.0
        if 11 <= h <= 14: return 26.0
        if 21 <= h <= 23: return 20.0
        if 15 <= h <= 16: return 14.0
        if 7 <= h <= 10:  return 12.0
        return 4.0

    if food:
        if 11 <= h <= 14: return 28.0
        if 7 <= h <= 10:  return 24.0
        if 17 <= h <= 20: return 22.0
        if 15 <= h <= 16: return 16.0
        if 21 <= h <= 23: return 10.0
        return 4.0

    if 11 <= h <= 14 or 17 <= h <= 20: return 24.0
    if 7 <= h <= 10:  return 18.0
    if 15 <= h <= 16: return 16.0
    if 21 <= h <= 23: return 10.0
    return 6.0


def _apply_multipliers(base: float, venue: Venue, dt: datetime) -> float:
    if dt.hour in range(11, 15):
        if venue.serves_food and not venue.serves_alcohol:
            base *= 1.25
        elif venue.serves_food and venue.serves_alcohol:
            base *= 1.1

    if venue.serves_alcohol and 16 <= dt.hour <= 21:
        base *= 1.2 if not venue.serves_food else 1.1

    return base


def temporal_score(db: Session, profile, venue: Venue, dt: datetime, signal_count: int = 0) -> float:
    if profile is None:
        return _fallback_noise(venue, dt.hour)

    if profile.noise_estimate is not None:
        base = profile.busyness_avg * 0.3 + profile.noise_estimate * 0.2
    else:
        base = profile.busyness_avg * 0.5

    base = _apply_multipliers(base, venue, dt)

    if signal_count > 0:
        base += _signal_adjustment(db, venue.id, dt)

    return max(0.0, min(50.0, base))


def temporal_score_from_data(profile, venue: Venue, dt: datetime, recent_signals: list, dow_signals: list,) -> float:
    if profile is None:
        return _fallback_noise(venue, dt.hour)

    if profile.noise_estimate is not None:
        base = profile.busyness_avg * 0.3 + profile.noise_estimate * 0.2
    else:
        base = profile.busyness_avg * 0.5

    base = _apply_multipliers(base, venue, dt)

    if recent_signals or dow_signals:
        now = datetime.now(_NYC_TZ)
        base += _weighted_signal_adjustment(recent_signals, dow_signals, now)

    return max(0.0, min(50.0, base))

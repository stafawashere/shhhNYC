from datetime import datetime
from zoneinfo import ZoneInfo
from app.models.venue import Venue

_NYC_TZ = ZoneInfo("America/New_York")


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


def _profile_base(profile) -> float:
    if profile.noise_estimate is not None:
        return profile.busyness_avg * 0.42 + profile.noise_estimate * 0.28
    return profile.busyness_avg * 0.70


def temporal_score(_db, profile, venue: Venue, dt: datetime, _signal_count: int = 0) -> float:
    if profile is None:
        return _apply_multipliers(_fallback_noise(venue, dt.hour), venue, dt)

    return max(0.0, min(50.0, _profile_base(profile)))


def temporal_score_from_data(profile, venue: Venue, dt: datetime, _recent_signals: list = None, _dow_signals: list = None) -> float:
    if profile is None:
        return _apply_multipliers(_fallback_noise(venue, dt.hour), venue, dt)

    return max(0.0, min(50.0, _profile_base(profile)))

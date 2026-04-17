from datetime import datetime, timezone
from app.models.venue import Venue
from app.models.signal_event import SIGNAL_TTLS

Signals = dict[str, tuple[dict, datetime]]


def _active(signals: Signals, name: str) -> tuple[dict | None, float | None]:
    entry = signals.get(name)
    if entry is None:
        return None, None
    val, captured_at = entry
    ttl_min = SIGNAL_TTLS.get(name, 120)
    age_min = (datetime.now(timezone.utc) - captured_at.astimezone(timezone.utc)).total_seconds() / 60
    if age_min > ttl_min:
        return None, None
    return val, age_min


def realtime_score(venue: Venue, signals: Signals, complaint_baseline: float = 0.0) -> tuple[float, float]:
    modifier = 0.0
    traffic_penalty = 0.0

    weather_val, _ = _active(signals, "weather")
    if weather_val is not None:
        wm = weather_val.get("modifier", 0.0)
        seating = venue.seating_type or []
        outdoor_only = bool(seating) and all(s == "outdoor" for s in seating)
        modifier += -wm if outdoor_only else wm

    events_val, _ = _active(signals, "events")
    ec = events_val["count"] if events_val is not None else 0
    if ec >= 6:
        modifier += 2.0
    elif ec >= 3:
        modifier += 1.5
    elif ec >= 1:
        modifier += 1.0

    complaints_val, _ = _active(signals, "noise_complaints")
    count = complaints_val["count"] if complaints_val is not None else 0
    if complaint_baseline > 0.5:
        excess_ratio = max(0.0, (count - complaint_baseline) / complaint_baseline)
        modifier += min(4.0, excess_ratio * 4.0)
    else:
        if count >= 6:
            modifier += 4.0
        elif count >= 3:
            modifier += 2.5
        elif count >= 1:
            modifier += 1.5

    construction_val, _ = _active(signals, "construction")
    if construction_val is not None and construction_val.get("nearby"):
        modifier += 4.0

    tomtom_val, tomtom_age = _active(signals, "tomtom")
    if tomtom_val is not None:
        modifier += tomtom_val.get("incidents", 0.0)
        congestion = tomtom_val.get("congestion")
        if congestion is not None:
            raw_penalty = max(0.0, (1.0 - congestion)) * 10.0
            if tomtom_age is not None and tomtom_age > 90:
                raw_penalty *= max(0.2, 1.0 - (tomtom_age - 90) / 120)
            traffic_penalty = raw_penalty

    mta_val, _ = _active(signals, "mta")
    if mta_val is not None:
        mta_sev = mta_val.get("severity", 0.0)
        if mta_sev > 0.0:
            impact = min(3.2, mta_sev * 0.8)
            nearest_m = venue.nearest_subway_m
            if nearest_m is not None:
                if nearest_m > 500:
                    impact *= 0.3
                elif nearest_m > 200:
                    impact *= 0.6
            modifier += impact

    dep_val, _ = _active(signals, "dep_noise")
    if dep_val is not None:
        dep = dep_val.get("level")
        if dep is not None:
            dep_modifier = (dep - 45.0) / 35.0 * 3.5
            modifier += max(-2.0, min(3.5, dep_modifier))

    return max(-15.0, min(15.0, modifier)), round(traffic_penalty, 1)

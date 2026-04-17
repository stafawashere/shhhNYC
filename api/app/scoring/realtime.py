import math
from datetime import datetime, timezone
from app.models.venue import Venue
from app.models.signal_event import SIGNAL_TTLS

Signals = dict[str, tuple[dict, datetime]]


def _outdoor_fraction(venue: Venue) -> float:
    """Continuous outdoor exposure in [0, 1].

    Prefers explicit seating_type composition. Falls back to the
    has_outdoor_seating flag with a curated-uncertainty default of 0.3
    when we know there's outdoor seating but not how much.
    """
    seating = venue.seating_type or []
    if seating:
        if all(s == "outdoor" for s in seating):
            return 1.0
        if "outdoor" in seating:
            # Even split across listed seating areas; still a coarse proxy
            # but at least matches the count of indoor zones.
            return 1.0 / len(seating)
        return 0.0
    if getattr(venue, "has_outdoor_seating", None) is True:
        return 0.3
    return 0.0


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

    outdoor_frac = _outdoor_fraction(venue)

    weather_val, _ = _active(signals, "weather")
    if weather_val is not None:
        wm = weather_val.get("modifier", 0.0)
        modifier += wm * (1.0 - 2.0 * outdoor_frac)

    disruption_sources = 0.0
    disruption_total = 0.0

    events_val, _ = _active(signals, "events")
    ec = events_val["count"] if events_val is not None else 0
    event_mod = 0.0
    if ec >= 6:
        event_mod = 2.0
    elif ec >= 3:
        event_mod = 1.5
    elif ec >= 1:
        event_mod = 1.0
    if event_mod:
        disruption_total += event_mod
        disruption_sources += 1

    complaints_val, _ = _active(signals, "noise_complaints")
    count = complaints_val["count"] if complaints_val is not None else 0
    baseline = max(complaint_baseline, 1.0)
    excess = max(0.0, (count + 0.5 - baseline) / (baseline + 1.0))
    complaint_mod = min(4.0, excess * 4.0)
    if complaint_mod:
        disruption_total += complaint_mod
        disruption_sources += 1

    construction_val, _ = _active(signals, "construction")
    if construction_val is not None and construction_val.get("nearby"):
        disruption_total += 4.0
        disruption_sources += 1

    tomtom_val, tomtom_age = _active(signals, "tomtom")
    tomtom_disruption = 0.0
    if tomtom_val is not None:
        incidents_raw = tomtom_val.get("incidents", 0.0) or 0.0
        tomtom_disruption = min(3.0, incidents_raw * 0.5)
        congestion = tomtom_val.get("congestion")
        if congestion is not None:
            raw_penalty = max(0.0, (1.0 - congestion)) * 10.0
            if tomtom_age is not None:
                tau = 90.0
                raw_penalty *= math.exp(-max(0.0, tomtom_age - 30.0) / tau)
            traffic_penalty = raw_penalty
    if tomtom_disruption:
        disruption_total += tomtom_disruption
        disruption_sources += 1

    if disruption_sources > 0:
        damping = 1.0 / (1.0 + 0.35 * (disruption_sources - 1))
        modifier += disruption_total * damping

    mta_val, _ = _active(signals, "mta")
    if mta_val is not None:
        mta_sev = mta_val.get("severity", 0.0)
        if mta_sev > 0.0:
            impact = min(3.2, mta_sev * 0.8)
            nearest_m = venue.nearest_subway_m
            if nearest_m is not None:
                impact *= math.exp(-nearest_m / 180.0)
            modifier += impact

    dep_val, _ = _active(signals, "dep_noise")
    if dep_val is not None:
        dep = dep_val.get("level")
        if dep is not None:
            dep_modifier = (dep - 45.0) / 35.0 * 3.5
            modifier += max(-2.0, min(3.5, dep_modifier))

    return max(-15.0, min(15.0, modifier)), round(traffic_penalty, 1)

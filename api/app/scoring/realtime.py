from datetime import datetime, timezone
from app.models.venue import Venue


def realtime_score(venue: Venue, rt_row, profile, complaint_baseline: float = 0.0) -> tuple[float, float]:
    if rt_row is None:
        return 0.0, 0.0

    modifier = 0.0
    traffic_penalty = 0.0

    if rt_row.google_live_busyness is not None and profile is not None:
        deviation = rt_row.google_live_busyness - profile.busyness_avg
        modifier += deviation * 0.1

    if rt_row.weather_modifier is not None:
        seating = venue.seating_type or []
        outdoor_only = bool(seating) and all(s == "outdoor" for s in seating)
        modifier += -rt_row.weather_modifier if outdoor_only else rt_row.weather_modifier

    ec = rt_row.event_count or 0
    if ec >= 6:
        modifier += 2.0
    elif ec >= 3:
        modifier += 1.5
    elif ec >= 1:
        modifier += 1.0

    count = rt_row.noise_complaint_count or 0
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

    if rt_row.construction_nearby:
        modifier += 4.0

    modifier += rt_row.tomtom_incidents_nearby or 0.0
    mta_sev = rt_row.mta_disruption_severity or 0.0
    if mta_sev > 0.0:
        modifier += min(3.2, mta_sev * 0.8)

    dep = rt_row.dep_noise_level
    if dep is not None:
        dep_modifier = (dep - 45.0) / 35.0 * 3.5
        modifier += max(-2.0, min(3.5, dep_modifier))

    if rt_row.tomtom_traffic_congestion is not None:
        traffic_penalty = max(0.0, (1.0 - rt_row.tomtom_traffic_congestion)) * 10.0

        age_min = (datetime.now(timezone.utc) - rt_row.timestamp.astimezone(timezone.utc)).total_seconds() / 60
        if age_min > 120:
            traffic_penalty *= max(0.2, 1.0 - (age_min - 120) / 240)

    return max(-15.0, min(15.0, modifier)), round(traffic_penalty, 1)

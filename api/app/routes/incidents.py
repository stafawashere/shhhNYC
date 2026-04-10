from datetime import date
from fastapi import APIRouter
from app.services import nyc_opendata

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("")
def get_incidents():
    construction_raw = nyc_opendata.get_citywide_construction(limit=300)
    noise_raw = nyc_opendata.get_citywide_noise_hotspots(limit=200, days=10)
    events_raw = nyc_opendata.get_street_events(date.today())

    construction = []
    for p in construction_raw:
        try:
            construction.append({
                "lat": float(p["latitude"]),
                "lng": float(p["longitude"]),
                "job_type": p.get("job_type", "Street Work").replace("_", " ").title(),
                "filing_status": p.get("filing_status", ""),
                "borough": p.get("borough", ""),
                "filing_date": p.get("filing_date", "")[:10] if p.get("filing_date") else None,
            })
        except (KeyError, ValueError, TypeError):
            continue

    noise = []
    for c in noise_raw:
        try:
            noise.append({
                "lat": float(c["latitude"]),
                "lng": float(c["longitude"]),
                "complaint_type": c.get("complaint_type", "Noise"),
                "descriptor": c.get("descriptor", ""),
                "borough": c.get("borough", ""),
                "created_date": c.get("created_date", "")[:10] if c.get("created_date") else None,
            })
        except (KeyError, ValueError, TypeError):
            continue

    events = [
        {
            "event_name": e.get("event_name") or e.get("event_type") or "Street Event",
            "event_type": e.get("event_type", ""),
            "event_borough": e.get("event_borough", ""),
            "event_location": e.get("event_location", ""),
            "street_closure_type": e.get("street_closure_type", ""),
            "start_date_time": e.get("start_date_time", ""),
        }
        for e in events_raw
    ]

    return {
        "construction": construction,
        "noise": noise,
        "events": events,
    }

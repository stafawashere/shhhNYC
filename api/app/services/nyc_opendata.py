import httpx
from datetime import date, timedelta, datetime, timezone

_CONSTRUCTION_URL = "https://data.cityofnewyork.us/resource/w9ak-ipjd.json" # DOB NOW: Build – Job Filings (has text lat/lng, no within_circle support)
_EVENTS_URL = "https://data.cityofnewyork.us/resource/tvpp-9vvx.json" # NYC Permitted Event Information (no coordinates — borough filter only)
_NOISE_311_URL = "https://data.cityofnewyork.us/resource/erm2-nwe9.json" # 311 Service Requests — only dataset with a Point column + within_circle support
_TIMEOUT = 15
_BBOX_DEG = 0.003


def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return (((lat1 - lat2) * 111_000) ** 2 + ((lng1 - lng2) * 85_000) ** 2) ** 0.5


def get_active_construction(lat: float, lng: float, radius_m: float = 150) -> list[dict]:
    params = {
        "$limit": 100,
        "$where": (
            f"latitude IS NOT NULL AND longitude IS NOT NULL"
            f" AND latitude > '{lat - _BBOX_DEG}' AND latitude < '{lat + _BBOX_DEG}'"
            f" AND longitude > '{lng - _BBOX_DEG}' AND longitude < '{lng + _BBOX_DEG}'"
            f" AND filing_status NOT IN ('Filing Withdrawn','Signed-off','Disapproved')"
        ),
        "$select": "job_filing_number,job_type,filing_status,latitude,longitude,borough,filing_date",
    }
    try:
        resp = httpx.get(_CONSTRUCTION_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        raw = resp.json()
    except httpx.HTTPError:
        return []

    nearby = []
    for p in raw:
        try:
            p_lat = float(p["latitude"])
            p_lng = float(p["longitude"])
        except (KeyError, ValueError, TypeError):
            continue
        if _dist_m(lat, lng, p_lat, p_lng) <= radius_m:
            nearby.append(p)

    return nearby


def get_street_events(event_date: date | None = None) -> list[dict]:
    if event_date is None:
        event_date = date.today()

    d = event_date.isoformat()
    params = {
        "$where": (
            f"event_borough='Manhattan'"
            f" AND start_date_time <= '{d}T23:59:59'"
            f" AND end_date_time >= '{d}T00:00:00'"
        ),
        "$order": "start_date_time DESC",
        "$limit": 200,
        "$select": "event_id,event_name,event_type,start_date_time,end_date_time,event_borough,event_location,street_closure_type",
    }
    try:
        resp = httpx.get(_EVENTS_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return []


def get_nearby_noise_complaints(lat: float, lng: float, radius_m: float = 300, days: int = 7) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    params = {
        "$limit": 20,
        "$where": (
            f"within_circle(location,{lat},{lng},{radius_m})"
            f" AND complaint_type like 'Noise%'"
            f" AND created_date > '{since}'"
        ),
        "$select": "unique_key,complaint_type,descriptor,created_date,status,latitude,longitude",
        "$order": "created_date DESC",
    }
    try:
        resp = httpx.get(_NOISE_311_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return []

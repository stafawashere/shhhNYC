import httpx
import re
from datetime import date, timedelta, datetime, timezone

_CONSTRUCTION_URL  = "https://data.cityofnewyork.us/resource/w9ak-ipjd.json"  # DOB NOW: Build – Job Filings
_EVENTS_URL        = "https://data.cityofnewyork.us/resource/tvpp-9vvx.json"  # NYC Permitted Event Information
_NOISE_311_URL     = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"  # 311 Service Requests
_PEDESTRIAN_URL    = "https://data.cityofnewyork.us/resource/cqsj-cfgu.json"  # NYC DOT Bi-Annual Pedestrian Counts
_TIMEOUT = 15
_BBOX_DEG = 0.003

_BOROUGH_LABELS: dict[str, str] = {
    "manhattan":    "MANHATTAN",
    "brooklyn":     "BROOKLYN",
    "queens":       "QUEENS",
    "bronx":        "BRONX",
    "staten island": "STATEN ISLAND",
}


def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return (((lat1 - lat2) * 111_000) ** 2 + ((lng1 - lng2) * 85_000) ** 2) ** 0.5


def get_active_construction(lat: float, lng: float, radius_m: float = 150) -> list[dict]:
    params = {
        "$limit": 100,
        "$where": (
            "latitude IS NOT NULL AND longitude IS NOT NULL"
            " AND filing_status NOT IN ('Filing Withdrawn','Signed-off','Disapproved')"
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
        "$select": "event_id,event_name,event_type,start_date_time,end_date_time,event_borough,event_location,street_closure_type,latitude,longitude",
    }
    try:
        resp = httpx.get(_EVENTS_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return []


def get_citywide_construction(limit: int = 300) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%S")
    params = {
        "$limit": limit,
        "$where": (
            "latitude IS NOT NULL AND longitude IS NOT NULL"
            " AND filing_status NOT IN ('Filing Withdrawn','Signed-off','Disapproved')"
            f" AND filing_date > '{cutoff}'"
        ),
        "$select": "job_filing_number,job_type,filing_status,latitude,longitude,borough,filing_date",
        "$order": "filing_date DESC",
    }
    try:
        resp = httpx.get(_CONSTRUCTION_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return []


def get_citywide_noise_hotspots(limit: int = 200, days: int = 10) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    params = {
        "$limit": limit,
        "$where": (
            f"within_circle(location,40.73,-73.99,15000)"
            f" AND complaint_type like 'Noise%'"
            f" AND created_date > '{since}'"
        ),
        "$select": "complaint_type,descriptor,created_date,latitude,longitude,borough",
        "$order": "created_date DESC",
    }
    try:
        resp = httpx.get(_NOISE_311_URL, params=params, timeout=_TIMEOUT)
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


def get_nta_noise_baseline(borough: str, days: int = 90) -> dict[str, float]:
    boro_label = _BOROUGH_LABELS.get((borough or "").lower().strip())
    if not boro_label:
        return {}

    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    params = {
        "$select": "community_board,count(*) as total",
        "$where": (
            f"complaint_type like 'Noise%'"
            f" AND borough='{boro_label}'"
            f" AND created_date > '{since}'"
            f" AND community_board IS NOT NULL"
        ),
        "$group": "community_board",
        "$limit": 100,
    }
    try:
        resp = httpx.get(_NOISE_311_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        weeks = days / 7.0
        return {
            row["community_board"]: float(row["total"]) / weeks
            for row in resp.json()
            if row.get("community_board") and row.get("total")
        }
    except httpx.HTTPError:
        return {}


def get_pedestrian_count_near(lat: float, lng: float, radius_m: float = 400) -> int | None:
    params = {
        "$limit": 5,
        "$where": f"within_circle(the_geom,{lat},{lng},{radius_m})",
    }
    try:
        resp = httpx.get(_PEDESTRIAN_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        rows = resp.json()
    except httpx.HTTPError:
        return None

    if not rows:
        return None

    _BAND_RE = re.compile(
        r"^(?:may|sept?|oct|june?|nov)_?\d{2}[_\s]?(?:am|md|p_?m)$", re.I
    )

    best_count: int | None = None
    for row in rows:
        band_vals: list[float] = []
        for col, val in row.items():
            if _BAND_RE.match(col) and val:
                try:
                    band_vals.append(float(val))
                except (ValueError, TypeError):
                    pass
        if not band_vals:
            continue
        candidate = round(max(band_vals))
        if best_count is None or candidate > best_count:
            best_count = candidate

    return best_count

import re
import math
import httpx
from datetime import datetime, timedelta, timezone

_311_URL = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"
_TIMEOUT = 15

_DEP_COMPLAINT_TYPES = (
    "Noise - Commercial",
    "Noise - Residential",
    "Noise - Street/Sidewalk",
    "Noise - Vehicle",
    "Noise - Construction After Hours",
    "Noise - Park",
)

_DB_RE = re.compile(r"(\d{2,3}(?:\.\d)?)\s*db", re.IGNORECASE)
_SEVERE_TYPES = {"Noise - Commercial", "Noise - Construction After Hours"}
_DB_MIN = 40.0
_DB_RANGE = 60.0


def get_dep_noise_complaints(lat: float, lng: float, radius_m: float = 300, days: int = 90) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    type_filter = " OR ".join(f"complaint_type='{t}'" for t in _DEP_COMPLAINT_TYPES)

    params = {
        "$limit": 100,
        "$where": (
            f"within_circle(location,{lat},{lng},{radius_m})"
            f" AND ({type_filter})"
            f" AND created_date > '{since}'"
        ),
        "$select": (
            "unique_key,complaint_type,descriptor,"
            "resolution_description,created_date,status,agency"
        ),
        "$order": "created_date DESC",
    }
    try:
        resp = httpx.get(_311_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return []


def estimate_noise_level(complaints: list[dict]) -> float | None:
    if not complaints:
        return None

    db_readings: list[float] = []
    for c in complaints:
        text = c.get("resolution_description") or ""
        for match in _DB_RE.findall(text):
            val = float(match)
            if 30.0 <= val <= 130.0:
                db_readings.append(val)

    if db_readings:
        avg_db = sum(db_readings) / len(db_readings)
        normalized = max(0.0, min(100.0, (avg_db - _DB_MIN) / _DB_RANGE * 100.0))
        return round(normalized, 1)

    count = len(complaints)
    severe_count = sum(1 for c in complaints if c.get("complaint_type") in _SEVERE_TYPES)
    base = min(80.0, math.log1p(count) / math.log1p(30) * 80.0)
    severity_bonus = min(15.0, severe_count * 3.0)
    return round(min(95.0, base + severity_bonus), 1)

import httpx
from app.config import settings

_BASE = "https://maps.googleapis.com/maps/api/place/details/json"


def _get_place_details(place_id: str) -> dict | None:
    if not settings.google_places_api_key:
        return None

    params = {
        "place_id": place_id,
        "fields": "name,geometry,price_level,current_opening_hours,opening_hours,popular_times",
        "key": settings.google_places_api_key,
    }
    try:
        resp = httpx.get(_BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data.get("result") if data.get("status") == "OK" else None
    except httpx.HTTPError:
        return None


def get_popular_times(place_id: str) -> dict[int, dict[int, float]] | None:
    result = _get_place_details(place_id)
    if not result:
        return None

    popular_times = result.get("popular_times")
    if not popular_times:
        return None

    # google returns days sunday-first; remap to python weekday (monday=0)
    google_to_python = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6}

    matrix: dict[int, dict[int, float]] = {}
    for google_day, day_data in enumerate(popular_times):
        python_day = google_to_python[google_day]
        matrix[python_day] = {
            hour: float(busyness)
            for hour, busyness in enumerate(day_data.get("data", []))
        }

    return matrix or None


def get_live_busyness(place_id: str) -> float | None:
    result = _get_place_details(place_id)
    if not result:
        return None

    secondary = result.get("current_opening_hours", {}).get("secondary_opening_hours", [])
    for entry in secondary:
        if entry.get("type") == "POPULAR_TIMES":
            val = entry.get("current_popularity")
            return float(val) if val else None

    return None

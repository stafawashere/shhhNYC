import httpx
from app.config import settings

_BASE  = "https://maps.googleapis.com/maps/api/place/details/json"
_PHOTO = "https://maps.googleapis.com/maps/api/place/photo"


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


def get_review_texts(place_id: str) -> list[str]:
    texts, _ = get_review_data(place_id)
    return texts


def get_review_data(place_id: str) -> tuple[list[str], int]:
    if not settings.google_places_api_key:
        return [], 0

    params = {
        "place_id": place_id,
        "fields": "reviews,user_ratings_total",
        "key": settings.google_places_api_key,
    }
    try:
        resp = httpx.get(_BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result") if data.get("status") == "OK" else None
        if not result:
            return [], 0
        texts = [r["text"] for r in result.get("reviews", []) if r.get("text")]
        count = int(result.get("user_ratings_total") or 0)
        return texts, count
    except httpx.HTTPError:
        return [], 0


def get_photo_references(place_id: str, max_photos: int = 3) -> list[str]:
    if not settings.google_places_api_key:
        return []
    params = {
        "place_id": place_id,
        "fields": "photos",
        "key": settings.google_places_api_key,
    }
    try:
        resp = httpx.get(_BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result") if data.get("status") == "OK" else None
        if not result:
            return []
        return [p["photo_reference"] for p in result.get("photos", [])[:max_photos] if p.get("photo_reference")]
    except httpx.HTTPError:
        return []


def fetch_photo(photo_reference: str, max_width: int = 800) -> bytes | None:
    if not settings.google_places_api_key:
        return None
    try:
        r = httpx.get(
            _PHOTO,
            params={"maxwidth": max_width, "photo_reference": photo_reference, "key": settings.google_places_api_key},
            follow_redirects=True,
            timeout=15,
        )
        if r.status_code == 200:
            return r.content
        return None
    except httpx.HTTPError:
        return None


def get_popular_times(place_id: str) -> dict[int, dict[int, float]] | None:
    result = _get_place_details(place_id)
    if not result:
        return None

    popular_times = result.get("popular_times")
    if not popular_times:
        return None

    google_to_python = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6}

    matrix: dict[int, dict[int, float]] = {}
    for google_day, day_data in enumerate(popular_times):
        python_day = google_to_python[google_day]
        matrix[python_day] = {
            hour: float(busyness)
            for hour, busyness in enumerate(day_data.get("data", []))
        }

    return matrix or None



import httpx
import redis
from app.config import settings

_FORECAST_URL = "https://besttime.app/api/v1/forecasts"
_NOW_URL = "https://besttime.app/api/v1/forecasts/now"
_WEEK_URL = "https://besttime.app/api/v1/forecasts/week"

# intensity_nr → busyness 0-100
_INTENSITY_TO_BUSYNESS: dict[int, float] = {
    -2: 10.0,
    -1: 30.0,
     0: 50.0,
     1: 70.0,
     2: 85.0,
     3: 95.0,
   999:  0.0,  # closed
}

# venue_ids cached 30 days — key: besttime:vid:{google_place_id}
_VID_TTL = 60 * 60 * 24 * 30


def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _cached_venue_id(google_place_id: str) -> str | None:
    try:
        return _redis().get(f"besttime:vid:{google_place_id}")
    except redis.RedisError:
        return None


def _cache_venue_id(google_place_id: str, besttime_venue_id: str) -> None:
    try:
        _redis().set(f"besttime:vid:{google_place_id}", besttime_venue_id, ex=_VID_TTL)
    except redis.RedisError:
        pass


def forecast_venue(name: str, address: str, google_place_id: str) -> dict | None:
    if not settings.besttime_api_key_private:
        return None

    try:
        resp = httpx.post(
            _FORECAST_URL,
            params={
                "api_key_private": settings.besttime_api_key_private,
                "venue_name": name,
                "venue_address": address,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "OK":
            return None

        venue_id = data["venue_info"]["venue_id"]
        _cache_venue_id(google_place_id, venue_id)
        return data

    except httpx.HTTPError:
        return None


def get_week_forecast(besttime_venue_id: str) -> list[dict] | None:
    if not settings.besttime_api_key_public:
        return None

    try:
        resp = httpx.get(
            _WEEK_URL,
            params={
                "api_key_public": settings.besttime_api_key_public,
                "venue_id": besttime_venue_id,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("analysis") if data.get("status") == "OK" else None
    except httpx.HTTPError:
        return None


def get_live_busyness(besttime_venue_id: str) -> float | None:
    if not settings.besttime_api_key_public:
        return None

    try:
        resp = httpx.get(
            _NOW_URL,
            params={
                "api_key_public": settings.besttime_api_key_public,
                "venue_id": besttime_venue_id,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != "OK":
            return None

        intensity_nr = data["analysis"]["hour_analysis"]["intensity_nr"]
        if intensity_nr == 999:
            return None
        return _INTENSITY_TO_BUSYNESS.get(intensity_nr, 50.0)

    except (httpx.HTTPError, KeyError, TypeError):
        return None


def week_to_hourly_matrix(analysis: list[dict]) -> dict[int, dict[int, float]]:
    # day_int 0=Monday matches python weekday; skip closed hours (999)
    matrix: dict[int, dict[int, float]] = {}
    for day in analysis:
        day_int = day["day_info"]["day_int"]
        matrix[day_int] = {}
        for entry in day.get("hour_analysis", []):
            nr = entry["intensity_nr"]
            if nr != 999:
                matrix[day_int][entry["hour"]] = _INTENSITY_TO_BUSYNESS.get(nr, 50.0)
    return matrix


def ensure_venue_id(name: str, address: str, google_place_id: str) -> str | None:
    vid = _cached_venue_id(google_place_id)
    if vid:
        return vid

    data = forecast_venue(name, address, google_place_id)
    if data:
        return data["venue_info"]["venue_id"]
    return None

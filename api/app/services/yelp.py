import httpx
import redis
from app.config import settings

_SEARCH_URL  = "https://api.yelp.com/v3/businesses/search"
_DETAILS_URL = "https://api.yelp.com/v3/businesses/{id}"
_REVIEWS_URL = "https://api.yelp.com/v3/businesses/{id}/reviews"
_YID_TTL = 60 * 60 * 24 * 30

_QUIET = {
    "quiet", "peaceful", "calm", "silent", "serene", "library", "hushed",
    "tranquil", "great for studying", "great for working", "good for work",
    "perfect for work", "laptop friendly", "study",
}

_LOUD = {
    "loud", "noisy", "crowded", "packed", "hectic", "chaotic",
    "music blasting", "can't hear", "too loud", "very loud",
    "deafening", "rowdy", "boisterous", "bustling",
}

_NOISE_LEVEL_MAP: dict[str, float] = {
    "quiet":     20.0,
    "average":   45.0,
    "loud":      70.0,
    "very_loud": 90.0,
}



def _redis() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.yelp_api_key}"}


def _cached_business_id(google_place_id: str) -> str | None:
    try:
        return _redis().get(f"yelp:bid:{google_place_id}")
    except redis.RedisError:
        return None


def _cache_business_id(google_place_id: str, yelp_id: str) -> None:
    try:
        _redis().set(f"yelp:bid:{google_place_id}", yelp_id, ex=_YID_TTL)
    except redis.RedisError:
        pass


def find_business_id(name: str, lat: float, lng: float, google_place_id: str) -> str | None:
    if not settings.yelp_api_key:
        return None

    cached = _cached_business_id(google_place_id)
    if cached:
        return cached

    try:
        resp = httpx.get(
            _SEARCH_URL,
            headers=_headers(),
            params={"term": name, "latitude": lat, "longitude": lng, "limit": 1},
            timeout=10,
        )
        resp.raise_for_status()
        businesses = resp.json().get("businesses", [])
        if not businesses:
            return None
        yelp_id = businesses[0]["id"]
        _cache_business_id(google_place_id, yelp_id)
        return yelp_id
    except httpx.HTTPError:
        return None


def get_noise_level(yelp_id: str) -> tuple[float | None, str | None]:
    if not settings.yelp_api_key:
        return None, None

    try:
        resp = httpx.get(
            _DETAILS_URL.format(id=yelp_id),
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError:
        return None, None

    attr_level = data.get("attributes", {}).get("noise_level")
    if attr_level and attr_level in _NOISE_LEVEL_MAP:
        return _NOISE_LEVEL_MAP[attr_level], attr_level
    reviews_text = [r["text"] for r in data.get("reviews", []) if r.get("text")]
    sentiment = extract_noise_sentiment(reviews_text)
    if sentiment is not None:
        return round((1.0 - sentiment) / 2.0 * 100.0, 1), None

    return None, None


def get_reviews(yelp_business_id: str) -> list[str]:
    if not settings.yelp_api_key:
        return []

    try:
        resp = httpx.get(
            _REVIEWS_URL.format(id=yelp_business_id),
            headers=_headers(),
            params={"limit": 3},
            timeout=10,
        )
        resp.raise_for_status()
        return [r["text"] for r in resp.json().get("reviews", []) if r.get("text")]
    except httpx.HTTPError:
        return []


def extract_noise_sentiment(reviews: list[str]) -> float | None:
    if not reviews:
        return None

    quiet_hits = 0
    loud_hits = 0
    for review in reviews:
        lower = review.lower()
        quiet_hits += sum(1 for kw in _QUIET if kw in lower)
        loud_hits += sum(1 for kw in _LOUD if kw in lower)

    total = quiet_hits + loud_hits
    if total == 0:
        return None

    return (quiet_hits - loud_hits) / total

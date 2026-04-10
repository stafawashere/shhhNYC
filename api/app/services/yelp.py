import httpx
from app.config import settings

_REVIEWS_URL = "https://api.yelp.com/v3/businesses/{id}/reviews"
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


def get_reviews(yelp_business_id: str) -> list[str]:
    if not settings.yelp_api_key:
        return []

    headers = {"Authorization": f"Bearer {settings.yelp_api_key}"}
    url = _REVIEWS_URL.format(id=yelp_business_id)
    try:
        resp = httpx.get(url, headers=headers, params={"limit": 3}, timeout=10)
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

    return (quiet_hits - loud_hits) / total  # -1 (loud) +1 (quiet)

import math
from app.models.venue import Venue

seating_map = {
    "communal": 6,
    "individual": 2,
    "outdoor": 8,
}

music_map = {
    "none": 0,
    "quiet": 2,
    "moderate": 5,
    "loud": 8,
}

sqft_map = [
    (400,  5),
    (800,  3),
    (1500, 1),
    (2500, 0),
]

_CURATED_FIELD_COUNT = 2


def static_completeness(venue: Venue) -> float:
    filled = sum([
        venue.music_policy is not None,
        bool(venue.seating_type),
    ])

    return filled / _CURATED_FIELD_COUNT


def nightlife_cluster_pts(cluster_count: int) -> float:
    """Diminishing-returns contribution from neighboring loud venues."""
    if cluster_count <= 0:
        return 0.0
    return 6.0 * (1.0 - math.exp(-cluster_count / 4.0))


def static_score(venue: Venue, cluster_count: int = 0) -> float:
    score = 0.0
    curated = 0
    if venue.music_policy is not None:
        score += music_map[venue.music_policy]
        curated += 1

    seating = venue.seating_type or []
    if seating:
        curated += 1
        has_indoor = any(s in seating for s in ("communal", "individual", "bar"))
        for s in seating:
            if s == "outdoor" and has_indoor:
                continue
            score += seating_map.get(s, 0)


    if venue.sq_ft is not None:
        sqft_pts = 0
        for threshold, pts in sqft_map:
            if venue.sq_ft < threshold:
                sqft_pts = pts
                break
        score += sqft_pts

    if venue.nearest_subway_m is not None:
        score += 5.0 * math.exp(-venue.nearest_subway_m / 60.0)

    if venue.pedestrian_volume is not None:
        score += 4.0 * (1.0 - math.exp(-venue.pedestrian_volume / 1200.0))

    score += nightlife_cluster_pts(cluster_count)

    return max(0.0, 40.0 * math.tanh(score / 40.0))

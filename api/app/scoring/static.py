from app.models.venue import Venue

ceiling_map = {
    "high_hard": 15,
    "high_soft": 8,
    "low_hard": 10,
    "low_soft": 3,
}

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

espresso_map = {
    "central": 5,
    "back_corner": 2,
    "separate_room": 0,
    "none": 0,
}

sqft_map = [
    (400,  5),
    (800,  3),
    (1500, 1),
    (2500, 0),
]

_YELP_TRAIT_NOISE: dict[str, float] = {
    "quiet":     4.0,
    "average":  12.0,
    "loud":     22.0,
    "very_loud": 30.0,
}

_CURATED_FIELD_COUNT = 4


def static_completeness(venue: Venue) -> float:
    filled = sum([
        venue.ceiling_type is not None,
        venue.music_policy is not None,
        venue.espresso_position is not None,
        bool(venue.seating_type),
    ])
    return filled / _CURATED_FIELD_COUNT


def static_score(venue: Venue) -> float:
    score = 0.0
    curated = 0

    if venue.ceiling_type is not None:
        score += ceiling_map[venue.ceiling_type]
        curated += 1
    if venue.music_policy is not None:
        score += music_map[venue.music_policy]
        curated += 1

    if venue.espresso_position is not None:
        score += espresso_map[venue.espresso_position]
        curated += 1
    seating = venue.seating_type or []
    if seating:
        curated += 1
        has_indoor = any(s in seating for s in ("communal", "individual", "bar"))
        for s in seating:
            if s == "outdoor" and has_indoor:
                continue
            score += seating_map.get(s, 0)

    if curated < _CURATED_FIELD_COUNT and venue.noise_level_yelp:
        yelp_pts = _YELP_TRAIT_NOISE.get(venue.noise_level_yelp)
        if yelp_pts is not None:
            missing_fraction = (_CURATED_FIELD_COUNT - curated) / _CURATED_FIELD_COUNT
            score += yelp_pts * missing_fraction

    if venue.sq_ft is not None:
        sqft_pts = 0
        for threshold, pts in sqft_map:
            if venue.sq_ft < threshold:
                sqft_pts = pts
                break
        score += sqft_pts

    if venue.nearest_subway_m is not None:
        if venue.nearest_subway_m < 30:
            score += 5
        elif venue.nearest_subway_m < 100:
            score += 2

    if venue.pedestrian_volume is not None:
        if venue.pedestrian_volume >= 2000:
            score += 4.0
        elif venue.pedestrian_volume >= 1000:
            score += 2.5
        elif venue.pedestrian_volume >= 400:
            score += 1.5

    return max(0.0, min(40.0, score))

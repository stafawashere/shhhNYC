from app.models.venue import Venue


ceiling_map = {
    "high_hard": 15,    # exposed brick loft = echo chamber
    "high_soft": 8,     # high ceilings but carpeted/panels
    "low_hard": 10,     # tile floor, low ceiling
    "low_soft": 3,      # cozy, carpeted, soft furnishings
}

seating_map = {
    "communal": 6,      # groups form, cross-table talking
    "individual": 2,
    "outdoor": 8,       # street noise bleeds in
}

music_map = {
    "none": 0,
    "quiet": 2,
    "moderate": 5,
    "loud": 8,
}

espresso_map = {
    "central": 5,       # grinder + steamer right next to you
    "back_corner": 2,
    "separate_room": 0,
    "none": 0,
}


def static_score(venue: Venue, score: float = 0.0) -> float:
    score += ceiling_map.get(venue.ceiling_type, 8)
    score += music_map.get(venue.music_policy, 3)
    score += espresso_map.get(venue.espresso_position, 3)

    seating = venue.seating_type or []
    has_indoor = any(s in seating for s in ("communal", "individual", "bar"))

    for s in seating:
        if s == "outdoor" and has_indoor:
            continue
        score += seating_map.get(s, 0)

    return max(0.0, min(40.0, score))
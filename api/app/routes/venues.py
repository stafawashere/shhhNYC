from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from app.services import nyc_opendata, google_places
from sqlalchemy.orm import Session

_NYC_TZ = ZoneInfo("America/New_York")
from sqlalchemy import cast
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_MakePoint, ST_Distance
from geoalchemy2.shape import to_shape
from app.db.session import get_db
from app.models.venue import Venue
from app.models.hourly_profile import VenueHourlyProfile
from app.models.signal_event import SIGNAL_TTLS, SIGNAL_CONFIDENCE
from app.scoring.composite import quiet_score, quiet_score_from_data, _get_complaint_baseline, _review_count_factor
from app.db.queries import bulk_load_scoring_data, get_latest_signals
from app.scoring.static import static_completeness
from app.schemas.venue import VenueWithScore, ScoreResponse

router = APIRouter(prefix="/venues", tags=["venues"])


def venue_to_dict(v: Venue) -> dict:
    point = to_shape(v.location)
    return {
        "id": v.id, "name": v.name, "address": v.address,
        "neighborhood": v.neighborhood, "borough": v.borough,
        "sq_ft": v.sq_ft,
        "seating_type": v.seating_type, "music_policy": v.music_policy,
        "serves_food": v.serves_food, "serves_alcohol": v.serves_alcohol,
        "price_tier": v.price_tier,
        "nearest_subway_m": v.nearest_subway_m,
        "google_noise_estimate": v.google_noise_estimate,
        "google_place_id": v.google_place_id,
        "photos": v.photos or [],
        "opening_hours": v.opening_hours,
        "phone_number": v.phone_number,
        "website_url": v.website_url,
        "venue_types": v.venue_types or [],
        "subway_lines_served": v.subway_lines_served or [],
        "pedestrian_volume": v.pedestrian_volume,
        "google_review_count": v.google_review_count,
        "has_outdoor_seating": v.has_outdoor_seating,
        "is_cabaret": v.is_cabaret,
        "liquor_license_type": v.liquor_license_type,
        "health_grade": v.health_grade,
        "lat": point.y, "lng": point.x,
    }


@router.get("/nearby", response_model=list[VenueWithScore])
def get_nearby_venues(lat: float, lng: float, radius: float = 0.5, limit: int = 20, db: Session = Depends(get_db)):
    dt = datetime.now(_NYC_TZ)

    point = cast(ST_MakePoint(lng, lat), Geography)
    venues = (
        db.query(Venue)
        .filter(ST_DWithin(Venue.location, point, radius * 1000))
        .order_by(ST_Distance(Venue.location, point))
        .limit(limit)
        .all()
    )

    if not venues:
        return []

    venue_ids = [v.id for v in venues]
    bulk = bulk_load_scoring_data(db, venue_ids, dt)

    results = []
    for v in venues:
        vid = str(v.id)
        score = quiet_score_from_data(
            venue=v,
            dt=dt,
            profile=bulk.profile_map.get(vid),
            signals=bulk.signals_map.get(vid, {}),
            slot_count=bulk.slot_count_map.get(vid, 0),
            recent_signals=[],
            dow_signals=[],
            complaint_baseline=bulk.complaint_map.get(vid, 0.0),
        )
        results.append({"venue": venue_to_dict(v), "score": score})

    return results


@router.get("/search", response_model=list[VenueWithScore])
def search_venues(q: str, neighborhood: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Venue).filter(Venue.name.ilike(f"%{q}%"))
    if neighborhood:
        query = query.filter(Venue.neighborhood == neighborhood)

    venues = query.limit(20).all()
    return [{"venue": venue_to_dict(v), "score": quiet_score(db, v)} for v in venues]


@router.get("/{venue_id}", response_model=VenueWithScore)
def get_venue(venue_id: str, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()

    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    return {"venue": venue_to_dict(venue), "score": quiet_score(db, venue)}


@router.get("/{venue_id}/photo/{index}")
def get_venue_photo(venue_id: str, index: int, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue or not venue.photos or index >= len(venue.photos):
        raise HTTPException(status_code=404, detail="Photo not found")

    data = google_places.fetch_photo(venue.photos[index])
    if not data:
        raise HTTPException(status_code=502, detail="Could not fetch photo")

    return Response(content=data, media_type="image/jpeg")


@router.get("/{venue_id}/predict", response_model=ScoreResponse)
def predict_venue(venue_id: str, hour: int, day: int | None = None, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    now = datetime.now(_NYC_TZ)
    target_day = day if day is not None else now.weekday()
    days_ahead = (target_day - now.weekday()) % 7
    dt = (now + timedelta(days=days_ahead)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return quiet_score(db, venue, dt, include_realtime=False)


@router.get("/{venue_id}/hourly")
def get_hourly(venue_id: str, day: int | None = None, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    target_day = day if day is not None else datetime.now(_NYC_TZ).weekday()
    profiles = (
        db.query(VenueHourlyProfile)
        .filter(
            VenueHourlyProfile.venue_id == venue_id,
            VenueHourlyProfile.day_of_week == target_day,
        )
        .order_by(VenueHourlyProfile.hour)
        .all()
    )
    return {
        "day_of_week": target_day,
        "current_hour": datetime.now(_NYC_TZ).hour,
        "slots": [{"hour": p.hour, "busyness": p.busyness_avg or 0} for p in profiles],
    }


@router.get("/{venue_id}/debug")
def debug_venue(venue_id: str, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    now = datetime.now(_NYC_TZ)
    signals = get_latest_signals(db, venue_id)

    profile = (
        db.query(VenueHourlyProfile)
        .filter(
            VenueHourlyProfile.venue_id == venue_id,
            VenueHourlyProfile.day_of_week == now.weekday(),
            VenueHourlyProfile.hour == now.hour,
        )
        .first()
    )

    all_profiles = (
        db.query(VenueHourlyProfile)
        .filter(VenueHourlyProfile.venue_id == venue_id)
        .order_by(VenueHourlyProfile.day_of_week, VenueHourlyProfile.hour)
        .all()
    )

    computed       = quiet_score(db, venue)
    bd             = computed["breakdown"]
    noise_raw      = bd["venue_traits"] + bd["time_pattern"] + bd["live_adjustment"] + bd["traffic_penalty"]
    slot_count     = len(all_profiles)
    complaint_base = _get_complaint_baseline(venue_id)
    completeness   = static_completeness(venue)
    conf_profile_base  = round((0.05 + 0.25 * min(1.0, slot_count / 112)) if slot_count > 0 else 0.0, 4)
    conf_profile_hit   = round(0.05 if (profile and profile.busyness_avg is not None) else 0.0, 4)
    conf_google_nlp    = round(0.07 * _review_count_factor(venue.google_review_count) if venue.google_noise_estimate is not None else 0.0, 4)
    conf_signals: dict[str, float] = {}

    for sig_type, max_contrib in SIGNAL_CONFIDENCE.items():
        entry = signals.get(sig_type)
        if entry is None:
            conf_signals[f"sig_{sig_type}"] = 0.0
            continue
        _, captured_at = entry
        age_min = (now - captured_at.astimezone(_NYC_TZ)).total_seconds() / 60
        conf_signals[f"sig_{sig_type}"] = round(max_contrib if age_min <= SIGNAL_TTLS[sig_type] else 0.0, 4)

    conf_total = round(min(1.0, sum([
        conf_profile_base, conf_profile_hit, conf_google_nlp,
        *conf_signals.values(),
    ])), 4)

    def _signal_entry(sig_type: str) -> dict:
        entry = signals.get(sig_type)
        if entry is None:
            return {"active": False, "ttl_minutes": SIGNAL_TTLS[sig_type]}
        val, captured_at = entry
        age_min = (now - captured_at.astimezone(_NYC_TZ)).total_seconds() / 60
        ttl_min = SIGNAL_TTLS[sig_type]
        return {
            "captured_at": captured_at.isoformat(),
            "age_minutes":  round(age_min),
            "ttl_minutes":  ttl_min,
            "active":       age_min <= ttl_min,
            "value":        val,
        }

    def _mta_label(s: float | None) -> str | None:
        if s is None: return None
        if s < 0.5:   return "Good service"
        if s < 1.5:   return "Minor delays"
        if s < 2.5:   return "Significant delays"
        if s < 3.5:   return "Severe disruption"
        return "Service suspended"

    def _tc_label(tc: float | None) -> str | None:
        if tc is None:  return None
        if tc >= 0.8:   return "Free flow"
        if tc >= 0.5:   return "Moderate"
        if tc >= 0.3:   return "Heavy"
        return "Severe"

    live_signals: dict[str, dict] = {}
    for sig_type in SIGNAL_TTLS:
        entry = _signal_entry(sig_type)
        if entry.get("active"):
            val = entry["value"]
            if sig_type == "tomtom":
                tc = val.get("congestion")
                entry["congestion_label"] = _tc_label(tc)
                entry["traffic_penalty"]  = round(bd["traffic_penalty"], 2)
            elif sig_type == "mta":
                sev = val.get("severity")
                entry["severity_label"] = _mta_label(sev)
                entry["score_impact"]   = round(min(3.2, sev * 0.8), 2) if sev is not None else None
            elif sig_type == "dep_noise":
                dep = val.get("level")
                entry["score_impact"] = round(max(-2.0, min(3.5, (dep - 45) / 35 * 3.5)), 2) if dep is not None else None
        live_signals[sig_type] = entry

    return {
        "evaluated_at": now.isoformat(),
        "day_of_week":  now.weekday(),
        "hour":         now.hour,

        "venue_static": {
            "sq_ft":                venue.sq_ft,
            "music_policy":         venue.music_policy,
            "seating_type":         venue.seating_type,
            "serves_food":          venue.serves_food,
            "serves_alcohol":       venue.serves_alcohol,
            "google_noise_estimate": venue.google_noise_estimate,
            "google_review_count":  venue.google_review_count,
            "google_review_signal": venue.google_review_signal,
            "nearest_subway_m":     venue.nearest_subway_m,
            "pedestrian_volume":    venue.pedestrian_volume,
        },

        "computed_score": {
            "quiet_score":         computed["quiet_score"],
            "label":               computed["label"],
            "confidence":          round(computed["confidence"], 4),
            "noise_raw":           round(noise_raw, 2),
            "formula":             "100 - (noise_raw / 115 × 100)",
            "breakdown": {
                "venue_traits":    round(bd["venue_traits"], 2),
                "time_pattern":    round(bd["time_pattern"], 2),
                "live_adjustment": round(bd["live_adjustment"], 2),
                "traffic_penalty": round(bd["traffic_penalty"], 2),
            },
            "static_completeness": round(completeness, 2),
            "temporal_source":     "profile" if profile else "fallback",
            "confidence_breakdown": {
                "total":                 conf_total,
                "profile_coverage":      conf_profile_base,
                "profile_current_hour":  conf_profile_hit,
                "google_nlp":            conf_google_nlp,
                **conf_signals,
            },
        },

        "google_places": {
            "place_id":              venue.google_place_id,
            "review_count":          venue.google_review_count,
            "review_signal":         venue.google_review_signal,
            "noise_estimate_nlp":    venue.google_noise_estimate,
            "popular_times_current_hour": {
                "day":          profile.day_of_week if profile else None,
                "hour":         profile.hour if profile else None,
                "busyness_avg": profile.busyness_avg if profile else None,
                "noise_estimate": profile.noise_estimate if profile else None,
            },
            "popular_times_coverage": {
                "total_slots":  len(all_profiles),
                "days_covered": sorted(set(p.day_of_week for p in all_profiles)),
                "hours_per_day": {
                    str(day): sorted(p.hour for p in all_profiles if p.day_of_week == day)
                    for day in set(p.day_of_week for p in all_profiles)
                },
            },
        },

        "live_signals": live_signals,
        "complaint_baseline_weekly": round(complaint_base, 3),
    }


@router.get("/{venue_id}/warnings")
def get_warnings(venue_id: str, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    pt = to_shape(venue.location)
    lat, lng = pt.y, pt.x
    warnings = []
    permits = nyc_opendata.get_active_construction(lat, lng, radius_m=150)
    if permits:
        job_types = list(dict.fromkeys(
            p.get("job_type", "").replace("_", " ").title()
            for p in permits if p.get("job_type")
        ))
        label = ", ".join(job_types[:2]) if job_types else "street work"
        warnings.append({
            "type": "construction",
            "severity": "high",
            "title": "Active construction nearby",
            "detail": f"{len(permits)} active permit{'s' if len(permits) > 1 else ''} · {label}",
        })

    complaints = nyc_opendata.get_nearby_noise_complaints(lat, lng, radius_m=300)
    if complaints:
        descriptors = list(dict.fromkeys(
            c.get("descriptor", "") for c in complaints if c.get("descriptor")
        ))
        detail = descriptors[0] if descriptors else "Recent noise activity reported"
        warnings.append({
            "type": "noise_complaints",
            "severity": "medium",
            "title": f"{len(complaints)} noise complaint{'s' if len(complaints) > 1 else ''} this week",
            "detail": detail,
        })

    events = nyc_opendata.get_street_events(date.today())
    if events:
        name = events[0].get("event_name") or events[0].get("event_type") or "street event"
        warnings.append({
            "type": "event",
            "severity": "low",
            "title": "Street event today",
            "detail": name,
        })

    return {"warnings": warnings}

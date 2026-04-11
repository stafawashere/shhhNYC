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
from app.models.realtime_modifier import RealtimeModifier
from app.models.user_signal import UserSignal
from app.scoring.composite import quiet_score, _get_complaint_baseline
from app.db.queries import count_recent_signals, signal_confidence, get_user_signal_avg
from app.scoring.static import static_completeness
from app.schemas.venue import VenueWithScore, ScoreResponse
from app.schemas.requests import SubmitSignalRequest

router = APIRouter(prefix="/venues", tags=["venues"])


def venue_to_dict(v: Venue) -> dict:
    point = to_shape(v.location)
    return {
        "id": v.id, "name": v.name, "address": v.address,
        "neighborhood": v.neighborhood, "borough": v.borough,
        "sq_ft": v.sq_ft, "ceiling_type": v.ceiling_type,
        "seating_type": v.seating_type, "music_policy": v.music_policy,
        "espresso_position": v.espresso_position, "has_outlets": v.has_outlets,
        "wifi_quality": v.wifi_quality, "wifi_policy": v.wifi_policy,
        "serves_food": v.serves_food, "serves_alcohol": v.serves_alcohol,
        "kid_friendly": v.kid_friendly, "price_tier": v.price_tier,
        "noise_level_yelp": v.noise_level_yelp,
        "nearest_subway_m": v.nearest_subway_m,
        "google_place_id": v.google_place_id,
        "photos": v.photos or [],
        "lat": point.y, "lng": point.x,
    }


@router.get("/nearby", response_model=list[VenueWithScore])
def get_nearby_venues(lat: float, lng: float, radius: float = 0.5, limit: int = 20, db: Session = Depends(get_db)):
    point = cast(ST_MakePoint(lng, lat), Geography)
    venues = (
        db.query(Venue)
        .filter(ST_DWithin(Venue.location, point, radius * 1000))
        .order_by(ST_Distance(Venue.location, point))
        .limit(limit)
        .all()
    )
    return [{"venue": venue_to_dict(v), "score": quiet_score(db, v)} for v in venues]


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

    rt = (
        db.query(RealtimeModifier)
        .filter(RealtimeModifier.venue_id == venue_id)
        .order_by(RealtimeModifier.timestamp.desc())
        .first()
    )

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

    recent_signals = (
        db.query(UserSignal)
        .filter(UserSignal.venue_id == venue_id)
        .order_by(UserSignal.timestamp.desc())
        .limit(5)
        .all()
    )

    computed = quiet_score(db, venue)
    bd = computed["breakdown"]
    noise_raw = bd["venue_traits"] + bd["time_pattern"] + bd["live_adjustment"] + bd["traffic_penalty"]

    slot_count    = len(all_profiles)
    signal_count  = count_recent_signals(db, venue_id)
    sig_score_val = signal_confidence(db, venue_id, dt=now)
    user_avg_val  = get_user_signal_avg(db, venue_id, dt=now)
    complaint_base = _get_complaint_baseline(venue_id)
    completeness  = static_completeness(venue)

    from app.scoring.composite import _review_count_factor, _consensus_bonus, _to_category, _user_avg_to_category
    import math as _math

    _conf_profile_base   = round((0.05 + 0.25 * min(1.0, slot_count / 112)) if slot_count > 0 else 0.0, 4)
    _conf_profile_hit    = round(0.05 if (profile and profile.busyness_avg is not None) else 0.0, 4)
    _conf_yelp           = round(0.08 if venue.noise_level_yelp is not None else 0.0, 4)
    _conf_google_nlp     = round(0.07 * _review_count_factor(venue.google_review_count) if venue.google_noise_estimate is not None else 0.0, 4)
    _rt_age_min          = round((now - rt.timestamp.astimezone(_NYC_TZ)).total_seconds() / 60) if rt else None
    _conf_rt_freshness   = round((0.18 if _rt_age_min < 30 else 0.10 if _rt_age_min < 90 else 0.03 if _rt_age_min < 360 else 0.0) if _rt_age_min is not None else 0.0, 4)
    _conf_tomtom         = round(0.07 if (rt and rt.tomtom_traffic_congestion is not None) else 0.0, 4)
    _conf_live_busyness  = round(0.04 if (rt and rt.google_live_busyness is not None) else 0.0, 4)
    _conf_dep            = round(0.10 if (rt and rt.dep_noise_level is not None) else 0.0, 4)
    _conf_signals        = round(sig_score_val, 4)
    _conf_consensus      = round(_consensus_bonus(venue, user_avg_val), 4)
    _conf_total          = round(min(1.0, sum([
        _conf_profile_base, _conf_profile_hit, _conf_yelp, _conf_google_nlp,
        _conf_rt_freshness, _conf_tomtom, _conf_live_busyness, _conf_dep,
        _conf_signals, _conf_consensus,
    ])), 4)

    mta_sev = (rt.mta_disruption_severity or 0.0) if rt else None
    dep_lvl = rt.dep_noise_level if rt else None

    def mta_label(s: float | None) -> str | None:
        if s is None:
            return None
        if s < 0.5:
            return "Good service"
        if s < 1.5:
            return "Minor delays"
        if s < 2.5:
            return "Significant delays"
        if s < 3.5:
            return "Severe disruption"
        return "Service suspended"

    def tc_label(tc: float | None) -> str | None:
        if tc is None:
            return None
        if tc >= 0.8:
            return "Free flow"
        if tc >= 0.5:
            return "Moderate"
        if tc >= 0.3:
            return "Heavy"
        return "Severe"

    return {
        "evaluated_at": now.isoformat(),
        "day_of_week": now.weekday(),
        "hour": now.hour,

        "venue_static": {
            "sq_ft": venue.sq_ft,
            "ceiling_type": venue.ceiling_type,
            "music_policy": venue.music_policy,
            "seating_type": venue.seating_type,
            "espresso_position": venue.espresso_position,
            "serves_food": venue.serves_food,
            "serves_alcohol": venue.serves_alcohol,
            "noise_level_yelp": venue.noise_level_yelp,
            "google_noise_estimate": venue.google_noise_estimate,
            "google_review_count": venue.google_review_count,
            "nearest_subway_m": venue.nearest_subway_m,
            "pedestrian_volume": venue.pedestrian_volume,
        },

        "computed_score": {
            "quiet_score": computed["quiet_score"],
            "label": computed["label"],
            "confidence": round(computed["confidence"], 4),
            "noise_raw": round(noise_raw, 2),
            "formula": "100 - (noise_raw / 115 × 100)",
            "breakdown": {
                "venue_traits": round(bd["venue_traits"], 2),
                "time_pattern": round(bd["time_pattern"], 2),
                "live_adjustment": round(bd["live_adjustment"], 2),
                "traffic_penalty": round(bd["traffic_penalty"], 2),
            },
            "static_completeness": round(completeness, 2),
            "temporal_source": "profile" if profile else "fallback",
            "confidence_breakdown": {
                "total": _conf_total,
                "profile_coverage": _conf_profile_base,
                "profile_current_hour": _conf_profile_hit,
                "yelp_noise": _conf_yelp,
                "google_nlp": _conf_google_nlp,
                "rt_freshness": _conf_rt_freshness,
                "tomtom": _conf_tomtom,
                "live_busyness": _conf_live_busyness,
                "dep_noise": _conf_dep,
                "user_signals": _conf_signals,
                "consensus_bonus": _conf_consensus,
            },
        },

        "user_signals_computed": {
            "signal_count_72h": signal_count,
            "user_avg_weighted": round(user_avg_val, 3) if user_avg_val is not None else None,
            "sig_score": round(sig_score_val, 4),
        },

        "google_places": {
            "place_id": venue.google_place_id,
            "review_count": venue.google_review_count,
            "noise_estimate_nlp": venue.google_noise_estimate,
            "live_busyness": rt.google_live_busyness if rt else None,
            "popular_times_current_hour": {
                "day": profile.day_of_week if profile else None,
                "hour": profile.hour if profile else None,
                "busyness_avg": profile.busyness_avg if profile else None,
                "noise_estimate": profile.noise_estimate if profile else None,
            },
            "popular_times_coverage": {
                "total_slots": len(all_profiles),
                "days_covered": sorted(set(p.day_of_week for p in all_profiles)),
                "hours_per_day": {
                    str(day): sorted(p.hour for p in all_profiles if p.day_of_week == day)
                    for day in set(p.day_of_week for p in all_profiles)
                },
            },
        },

        "openweather": {
            "weather_modifier": rt.weather_modifier if rt else None,
            "modifier_recorded_at": rt.timestamp.isoformat() if rt else None,
        },

        "nyc_open_data": {
            "event_count": rt.event_count if rt else None,
            "event_description": rt.event_description if rt else None,
            "noise_complaint_count": rt.noise_complaint_count if rt else None,
            "construction_nearby": rt.construction_nearby if rt else None,
            "complaint_baseline_weekly": round(complaint_base, 3),
        },

        "mta": {
            "disruption_severity": mta_sev,
            "severity_label": mta_label(mta_sev),
            "score_impact": round(min(3.2, mta_sev * 0.8), 2) if mta_sev is not None else None,
        },

        "dep_noise": {
            "ambient_level": dep_lvl,
            "score_impact": round(max(-2.0, min(3.5, (dep_lvl - 45) / 35 * 3.5)), 2) if dep_lvl is not None else None,
        },

        "tomtom": {
            "traffic_congestion": rt.tomtom_traffic_congestion if rt else None,
            "congestion_label": tc_label(rt.tomtom_traffic_congestion if rt else None),
            "incidents_nearby": rt.tomtom_incidents_nearby if rt else None,
            "traffic_penalty": round(bd["traffic_penalty"], 2),
        },

        "realtime_snapshot": {
            "modifier_id": rt.id if rt else None,
            "timestamp": rt.timestamp.isoformat() if rt else None,
            "age_minutes": round((now - rt.timestamp.astimezone(_NYC_TZ)).total_seconds() / 60) if rt else None,
            "google_live_busyness": rt.google_live_busyness if rt else None,
            "weather_modifier": rt.weather_modifier if rt else None,
            "event_count": rt.event_count if rt else None,
            "event_description": rt.event_description if rt else None,
            "noise_complaint_count": rt.noise_complaint_count if rt else None,
            "construction_nearby": rt.construction_nearby if rt else None,
            "tomtom_traffic_congestion": rt.tomtom_traffic_congestion if rt else None,
            "tomtom_incidents_nearby": rt.tomtom_incidents_nearby if rt else None,
            "mta_disruption_severity": rt.mta_disruption_severity if rt else None,
            "dep_noise_level": rt.dep_noise_level if rt else None,
        },

        "user_signals": [
            {
                "timestamp": s.timestamp.isoformat(),
                "noise_rating": s.noise_rating,
                "headcount_est": s.headcount_est,
                "notes": s.notes,
            }
            for s in recent_signals
        ],
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
            "title": f"Active construction nearby",
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


@router.post("/{venue_id}/signal")
def submit_signal(venue_id: str, body: SubmitSignalRequest, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if not 1 <= body.noise_rating <= 5:
        raise HTTPException(status_code=422, detail="noise_rating must be between 1 and 5")
    signal = UserSignal(
        venue_id=venue_id,
        noise_rating=body.noise_rating,
        headcount_est=body.headcount_est,
        notes=body.notes,
    )
    db.add(signal)
    db.commit()
    return {"status": "ok"}

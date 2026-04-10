from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from app.services import nyc_opendata
from sqlalchemy.orm import Session
from sqlalchemy import cast
from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_MakePoint, ST_Distance
from geoalchemy2.shape import to_shape
from app.db.session import get_db
from app.models.venue import Venue
from app.models.hourly_profile import VenueHourlyProfile
from app.models.realtime_modifier import RealtimeModifier
from app.models.user_signal import UserSignal
from app.scoring.composite import quiet_score
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
        "google_place_id": v.google_place_id,
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


@router.get("/{venue_id}/predict", response_model=ScoreResponse)
def predict_venue(venue_id: str, hour: int, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    dt = datetime.now().replace(hour=hour)
    return quiet_score(db, venue, dt)


@router.get("/{venue_id}/hourly")
def get_hourly(venue_id: str, day: int | None = None, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    target_day = day if day is not None else datetime.now().weekday()
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
        "current_hour": datetime.now().hour,
        "slots": [{"hour": p.hour, "busyness": p.busyness_avg or 0} for p in profiles],
    }


@router.get("/{venue_id}/debug")
def debug_venue(venue_id: str, db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    now = datetime.now()  # local time — matches what scoring engine uses

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

    return {
        "evaluated_at": now.isoformat(),
        "day_of_week": now.weekday(),
        "hour": now.hour,

        "google_places": {
            "place_id": venue.google_place_id,
            "live_busyness": rt.google_live_busyness if rt else None,
            "popular_times_current_hour": {
                "day": profile.day_of_week if profile else None,
                "hour": profile.hour if profile else None,
                "busyness_avg": profile.busyness_avg if profile else None,
                "noise_estimate": profile.noise_estimate if profile else None,
                "confidence": profile.confidence if profile else None,
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
            "nearby_event": rt.nearby_event if rt else None,
            "event_description": rt.event_description if rt else None,
            "construction_nearby": rt.construction_nearby if rt else None,
        },

        "realtime_snapshot": {
            "modifier_id": rt.id if rt else None,
            "timestamp": rt.timestamp.isoformat() if rt else None,
            "computed_modifier": rt.computed_modifier if rt else None,
            "google_live_busyness": rt.google_live_busyness if rt else None,
            "weather_modifier": rt.weather_modifier if rt else None,
            "nearby_event": rt.nearby_event if rt else None,
            "construction_nearby": rt.construction_nearby if rt else None,
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

from celery import Celery
from datetime import date
from app.config import settings
from app.db.session import SessionLocal
from app.models.venue import Venue
from app.models.realtime_modifier import RealtimeModifier
from app.models.hourly_profile import VenueHourlyProfile
from app.services import google_places, openweather, nyc_opendata, besttime
from geoalchemy2.shape import to_shape

celery = Celery("shhhnyc", broker=settings.redis_url, backend=settings.redis_url)


def _all_venues(db):
    return db.query(Venue).filter(Venue.google_place_id.isnot(None)).all()


def _coords(venue: Venue) -> tuple[float, float]:
    pt = to_shape(venue.location)
    return pt.y, pt.x


def _latest_modifier(db, venue_id):
    return (
        db.query(RealtimeModifier)
        .filter(RealtimeModifier.venue_id == venue_id)
        .order_by(RealtimeModifier.timestamp.desc())
        .first()
    )


def _upsert_hourly_profile(db, venue_id, day: int, hour: int, busyness: float) -> None:
    profile = db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id,
        VenueHourlyProfile.day_of_week == day,
        VenueHourlyProfile.hour == hour,
    ).first()
    if profile:
        profile.busyness_avg = busyness
    else:
        db.add(VenueHourlyProfile(
            venue_id=venue_id,
            day_of_week=day,
            hour=hour,
            busyness_avg=busyness,
        ))


@celery.task
def refresh_weather():
    weather = openweather.get_current_weather()
    if not weather:
        return
    modifier = openweather.weather_to_modifier(weather)
    celery.backend.set("nyc_weather", str(modifier), ex=1800)


@celery.task
def refresh_live_busyness():
    cached = celery.backend.get("nyc_weather")
    weather_modifier = float(cached) if cached else 0.0

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            vid = besttime._cached_venue_id(venue.google_place_id)
            live = besttime.get_live_busyness(vid) if vid else None

            db.add(RealtimeModifier(
                venue_id=venue.id,
                google_live_busyness=live,
                weather_modifier=weather_modifier,
            ))
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_events():
    events = nyc_opendata.get_street_events(date.today())
    has_events = bool(events)
    first_event_name = events[0].get("event_name", "") if events else ""

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            if venue.borough and venue.borough.lower() != "manhattan":
                continue
            lat, lng = _coords(venue)

            complaints = nyc_opendata.get_nearby_noise_complaints(lat, lng)
            nearby_noise = bool(complaints)
            noise_desc = complaints[0].get("complaint_type", "") if complaints else ""

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.nearby_event = has_events or nearby_noise
                existing.event_description = noise_desc or first_event_name or None
            else:
                db.add(RealtimeModifier(
                    venue_id=venue.id,
                    nearby_event=has_events or nearby_noise,
                    event_description=noise_desc or first_event_name or None,
                ))
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_construction():
    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            permits = nyc_opendata.get_active_construction(lat, lng)

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.construction_nearby = bool(permits)
            else:
                db.add(RealtimeModifier(
                    venue_id=venue.id,
                    construction_nearby=bool(permits),
                ))
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_popular_times():
    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            matrix = None

            vid = besttime.ensure_venue_id(venue.name, venue.address, venue.google_place_id)
            if vid:
                analysis = besttime.get_week_forecast(vid)
                if analysis:
                    matrix = besttime.week_to_hourly_matrix(analysis)

            # fallback to google places
            if not matrix:
                matrix = google_places.get_popular_times(venue.google_place_id)

            if not matrix:
                continue

            for day, hours in matrix.items():
                for hour, busyness in hours.items():
                    _upsert_hourly_profile(db, venue.id, day, hour, busyness)

        db.commit()
    finally:
        db.close()

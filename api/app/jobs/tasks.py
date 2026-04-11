from celery import Celery
from datetime import date
from app.config import settings
from app.db.session import SessionLocal
from app.models.venue import Venue
from app.models.realtime_modifier import RealtimeModifier
from app.models.hourly_profile import VenueHourlyProfile
from app.services import google_places, openweather, nyc_opendata, besttime, tomtom
from geoalchemy2.shape import to_shape
from celery.signals import worker_process_init
from app.db.session import engine

celery = Celery("shhhnyc", broker=settings.redis_url, backend=settings.redis_url)

@worker_process_init.connect
def dispose_engine_on_fork(**kwargs):
    engine.dispose(close=False)

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


def _throttle(task_name: str, cooldown_seconds: int = 600) -> bool:
    try:
        key = f"throttle_{task_name}"
        if hasattr(celery.backend, 'client'):
            if celery.backend.client.get(key):
                return False
            celery.backend.client.set(key, "1", ex=cooldown_seconds)
        else:
            if celery.backend.get(key):
                return False
            celery.backend.set(key, "1")
        return True
    except Exception:
        return True


@celery.task
def refresh_weather():
    if not _throttle("weather"): return

    weather = openweather.get_current_weather()
    if not weather:
        return
    modifier = openweather.weather_to_modifier(weather)
    if hasattr(celery.backend, 'client'):
        celery.backend.client.set("nyc_weather", str(modifier), ex=1800)
    else:
        celery.backend.set("nyc_weather", str(modifier))


@celery.task
def refresh_live_busyness():
    if not _throttle("live_busyness"): return

    cached = celery.backend.get("nyc_weather")
    weather_modifier = float(cached) if cached else 0.0

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            vid = besttime._cached_venue_id(venue.google_place_id)
            live = besttime.get_live_busyness(vid) if vid else None

            existing = _latest_modifier(db, venue.id)
            
            if existing:
                db.add(RealtimeModifier(
                    venue_id=venue.id,
                    google_live_busyness=live,
                    weather_modifier=weather_modifier,
                    nearby_event=existing.nearby_event,
                    event_description=existing.event_description,
                    construction_nearby=existing.construction_nearby,
                    tomtom_traffic_congestion=existing.tomtom_traffic_congestion,
                    tomtom_incidents_nearby=existing.tomtom_incidents_nearby,
                ))
            else:
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
    if not _throttle("events"): return

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
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_construction():
    if not _throttle("construction"): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            permits = nyc_opendata.get_active_construction(lat, lng)

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.construction_nearby = bool(permits)
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_tomtom_data():
    if not _throttle("tomtom"): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            flow = tomtom.get_traffic_flow(lat, lng)
            incidents = tomtom.get_traffic_incidents(lat, lng)
            congestion_ratio, has_incidents = tomtom.compute_noise_penalty(flow, incidents)

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.tomtom_traffic_congestion = congestion_ratio
                existing.tomtom_incidents_nearby = has_incidents
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_popular_times():
    if not _throttle("popular_times", cooldown_seconds=3600): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            matrix = None

            vid = besttime.ensure_venue_id(venue.name, venue.address, venue.google_place_id)
            if vid:
                analysis = besttime.get_week_forecast(vid)
                if analysis:
                    matrix = besttime.week_to_hourly_matrix(analysis)

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

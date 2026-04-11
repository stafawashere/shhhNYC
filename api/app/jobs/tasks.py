from celery import Celery
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from app.config import settings
from app.db.session import SessionLocal
from app.models.venue import Venue
from app.models.realtime_modifier import RealtimeModifier
from app.models.hourly_profile import VenueHourlyProfile
from app.services import google_places, openweather, nyc_opendata, besttime, tomtom, yelp, mta, mta_realtime, nyc_dep
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
                existing.google_live_busyness = live
                existing.weather_modifier = weather_modifier
                existing.timestamp = datetime.now(timezone.utc)
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
    borough_event_count = len(events)

    hotspots = nyc_opendata.get_citywide_noise_hotspots()

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            if venue.borough and venue.borough.lower() != "manhattan":
                continue
            lat, lng = _coords(venue)

            neighborhood = (venue.neighborhood or "").lower().strip()
            local_events = (
                [e for e in events
                 if neighborhood and neighborhood in (e.get("event_location") or "").lower()]
                if neighborhood else []
            )
            if local_events:
                proximity_event_count = len(local_events)
                event_description = local_events[0].get("event_name", "") or None
            else:
                proximity_event_count = borough_event_count // 4
                first_borough_event = events[0].get("event_name", "") if events else ""
                event_description = first_borough_event or None

            complaint_count = sum(
                1 for h in hotspots
                if h.get("latitude") and h.get("longitude")
                and nyc_opendata._dist_m(lat, lng, float(h["latitude"]), float(h["longitude"])) <= 300
            )

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.event_count = proximity_event_count
                existing.event_description = event_description
                existing.noise_complaint_count = complaint_count
                existing.timestamp = datetime.now(timezone.utc)
            else:
                db.add(RealtimeModifier(
                    venue_id=venue.id,
                    event_count=proximity_event_count,
                    event_description=event_description,
                    noise_complaint_count=complaint_count,
                ))
        db.commit()
    finally:
        db.close()


@celery.task
def prune_realtime_modifiers():
    db = SessionLocal()
    try:
        cutoff = datetime.now(ZoneInfo("America/New_York")) - timedelta(days=7)
        db.query(RealtimeModifier).filter(RealtimeModifier.timestamp < cutoff).delete()
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_construction():
    if not _throttle("construction"): return

    all_permits = nyc_opendata.get_citywide_construction()

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)

            has_construction = any(
                nyc_opendata._dist_m(lat, lng, float(p["latitude"]), float(p["longitude"])) <= 150
                for p in all_permits
                if p.get("latitude") and p.get("longitude")
            )

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.construction_nearby = has_construction
                existing.timestamp = datetime.now(timezone.utc)
            else:
                db.add(RealtimeModifier(
                    venue_id=venue.id,
                    construction_nearby=has_construction,
                ))
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
            congestion_ratio, incident_severity = tomtom.compute_noise_penalty(flow, incidents)

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.tomtom_traffic_congestion = congestion_ratio
                existing.tomtom_incidents_nearby = incident_severity
                existing.timestamp = datetime.now(timezone.utc)
            else:
                db.add(RealtimeModifier(
                    venue_id=venue.id,
                    tomtom_traffic_congestion=congestion_ratio,
                    tomtom_incidents_nearby=incident_severity,
                ))
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_yelp_noise():
    if not _throttle("yelp_noise", cooldown_seconds=86400): return  # once a day max

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            yelp_id = yelp.find_business_id(venue.name, lat, lng, venue.google_place_id)
            if not yelp_id:
                continue

            noise_estimate, raw_level = yelp.get_noise_level(yelp_id)
            if noise_estimate is None:
                continue

            if raw_level is not None:
                venue.noise_level_yelp = raw_level

            db.query(VenueHourlyProfile).filter(
                VenueHourlyProfile.venue_id == venue.id
            ).update({"noise_estimate": noise_estimate})

        db.commit()
    finally:
        db.close()


@celery.task
def refresh_subway_proximity():
    if not _throttle("subway_proximity", cooldown_seconds=86400 * 7): return  # weekly

    entrances = mta.fetch_subway_entrances()
    if not entrances:
        return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            nearest = min(
                nyc_opendata._dist_m(lat, lng, e_lat, e_lng)
                for e_lat, e_lng in entrances
            )
            venue.nearest_subway_m = round(nearest)
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_google_review_noise():
    if not _throttle("google_review_noise", cooldown_seconds=86400 * 7): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            reviews, review_count = google_places.get_review_data(venue.google_place_id)

            if review_count is not None:
                venue.google_review_count = review_count

            if not reviews:
                continue

            sentiment = yelp.extract_noise_sentiment(reviews)
            if sentiment is None:
                continue

            if sentiment > 0.2:
                category = "quiet"
            elif sentiment < -0.2:
                category = "loud"
            else:
                category = "moderate"

            venue.google_noise_estimate = category

            if venue.noise_level_yelp is None:
                noise_estimate = round((1.0 - sentiment) / 2.0 * 100.0, 1)
                db.query(VenueHourlyProfile).filter(
                    VenueHourlyProfile.venue_id == venue.id
                ).update({"noise_estimate": noise_estimate})

        db.commit()
    finally:
        db.close()


@celery.task
def refresh_noise_complaint_baseline():
    if not _throttle("complaint_baseline", cooldown_seconds=86400 * 7): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            complaints_60d = nyc_opendata.get_nearby_noise_complaints(
                lat, lng, radius_m=300, days=60
            )
            weekly_avg = len(complaints_60d) / (60 / 7)
            key = f"complaint_baseline:{venue.id}"
            val = str(round(weekly_avg, 3))
            if hasattr(celery.backend, 'client'):
                celery.backend.client.set(key, val, ex=86400 * 7)
            else:
                celery.backend.set(key, val)
    finally:
        db.close()


@celery.task
def refresh_mta_alerts():
    if not _throttle("mta_alerts"): return

    status = mta_realtime.get_service_status()
    if not status:
        return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            severity = mta_realtime.get_venue_disruption_severity(
                venue.neighborhood, venue.borough, status
            )
            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.mta_disruption_severity = severity
                existing.timestamp = datetime.now(timezone.utc)
            else:
                db.add(RealtimeModifier(
                    venue_id=venue.id,
                    mta_disruption_severity=severity,
                ))
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_dep_noise():
    if not _throttle("dep_noise", cooldown_seconds=86400 * 7): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            complaints = nyc_dep.get_dep_noise_complaints(lat, lng, radius_m=300, days=90)
            noise_level = nyc_dep.estimate_noise_level(complaints)
            if noise_level is None:
                continue

            existing = _latest_modifier(db, venue.id)
            if existing:
                existing.dep_noise_level = noise_level
            else:
                db.add(RealtimeModifier(venue_id=venue.id, dep_noise_level=noise_level))
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_nta_baseline():
    if not _throttle("nta_baseline", cooldown_seconds=86400 * 7): return

    boroughs = ["manhattan", "brooklyn", "queens", "bronx", "staten island"]
    for borough in boroughs:
        baseline = nyc_opendata.get_nta_noise_baseline(borough, days=90)
        for community_board, weekly_avg in baseline.items():
            key = f"nta_baseline:{borough}:{community_board}"
            val = str(round(weekly_avg, 3))
            if hasattr(celery.backend, 'client'):
                celery.backend.client.set(key, val, ex=86400 * 7)
            else:
                celery.backend.set(key, val)


@celery.task
def refresh_pedestrian_counts():
    if not _throttle("pedestrian_counts", cooldown_seconds=86400 * 7): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            count = nyc_opendata.get_pedestrian_count_near(lat, lng, radius_m=400)
            if count is not None:
                venue.pedestrian_volume = count
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

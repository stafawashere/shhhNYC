from celery import Celery
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from app.config import settings
from app.db.session import SessionLocal
from app.models.venue import Venue
from app.models.signal_event import SignalEvent
from app.models.hourly_profile import VenueHourlyProfile
from app.services import google_places, openweather, nyc_opendata, besttime, tomtom, review_nlp, mta, mta_realtime, nyc_dep, nyc_civic
from geoalchemy2.shape import to_shape
from celery.signals import worker_process_init
from app.db.session import engine

logger = logging.getLogger(__name__)
celery = Celery("shhhnyc", broker=settings.redis_url, backend=settings.redis_url)


@worker_process_init.connect
def dispose_engine_on_fork(**kwargs):
    engine.dispose(close=False)


def _all_venues(db):
    return db.query(Venue).filter(Venue.google_place_id.isnot(None)).all()


def _coords(venue: Venue) -> tuple[float, float]:
    pt = to_shape(venue.location)
    return pt.y, pt.x

def _insert_signal(db, venue_id, signal_type: str, value: dict) -> None:
    db.add(SignalEvent(venue_id=venue_id, signal_type=signal_type, value=value))

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
    try:
        if hasattr(celery.backend, 'client'):
            celery.backend.client.set("nyc_weather", str(modifier), ex=1800)
        else:
            celery.backend.set("nyc_weather", str(modifier))
    except Exception:
        pass

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            _insert_signal(db, venue.id, "weather", {"modifier": modifier})
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_events():
    if not _throttle("events"): return

    events   = nyc_opendata.get_street_events(date.today())
    hotspots = nyc_opendata.get_citywide_noise_hotspots()
    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            if venue.borough and venue.borough.lower() != "manhattan":
                continue

            lat, lng = _coords(venue)
            local_events = [
                e for e in events
                if e.get("latitude") and e.get("longitude")
                and nyc_opendata._dist_m(lat, lng, float(e["latitude"]), float(e["longitude"])) <= 2000
            ]

            if not local_events:
                neighborhood = (venue.neighborhood or "").lower().strip()
                local_events = [
                    e for e in events
                    if not (e.get("latitude") and e.get("longitude"))
                    and neighborhood and neighborhood in (e.get("event_location") or "").lower()
                ]

            event_count = len(local_events)
            event_description = local_events[0].get("event_name") or None if local_events else None
            complaint_count = sum(
                1 for h in hotspots
                if h.get("latitude") and h.get("longitude")
                and nyc_opendata._dist_m(lat, lng, float(h["latitude"]), float(h["longitude"])) <= 300
            )

            _insert_signal(db, venue.id, "events", {
                "count":       event_count,
                "description": event_description,
            })

            _insert_signal(db, venue.id, "noise_complaints", {
                "count": complaint_count,
            })

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

            _insert_signal(db, venue.id, "construction", {"nearby": has_construction})
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
            flow      = tomtom.get_traffic_flow(lat, lng)
            incidents = tomtom.get_traffic_incidents(lat, lng)

            if flow is None and not incidents:
                logger.warning(f"failed to retrieve TomTom data for venue {venue.id} ({venue.name})")
                continue

            congestion_ratio, incident_severity = tomtom.compute_noise_penalty(flow, incidents)
            _insert_signal(db, venue.id, "tomtom", {
                "congestion": congestion_ratio,
                "incidents":  incident_severity,
            })
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_mta_alerts():
    if not _throttle("mta_alerts"): return

    status = mta_realtime.get_service_status()
    db = SessionLocal()

    try:
        for venue in _all_venues(db):
            severity = mta_realtime.get_venue_disruption_severity(
                venue.neighborhood, venue.borough, status
            )
            _insert_signal(db, venue.id, "mta", {"severity": severity})
        db.commit()
    finally:
        db.close()


@celery.task
def refresh_dep_noise():
    if not _throttle("dep_noise", cooldown_seconds=86400 * 7): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng   = _coords(venue)
            complaints = nyc_dep.get_dep_noise_complaints(lat, lng, radius_m=300, days=30)
            analysis   = nyc_dep.analyze_complaints(complaints)
            if analysis["level"] is None:
                continue
            _insert_signal(db, venue.id, "dep_noise", {
                "level":         analysis["level"],
                "complaint_count": analysis["count"],
                "severe_count":  analysis["severe_count"],
            })

        db.commit()
    finally:
        db.close()


@celery.task
def prune_signal_events():
    db = SessionLocal()
    try:
        now = datetime.now(ZoneInfo("America/New_York"))
        cutoff_normal = now - timedelta(days=7)
        cutoff_dep    = now - timedelta(days=30)

        db.query(SignalEvent).filter(
            SignalEvent.signal_type != "dep_noise",
            SignalEvent.captured_at  < cutoff_normal,
        ).delete(synchronize_session=False)

        db.query(SignalEvent).filter(
            SignalEvent.signal_type == "dep_noise",
            SignalEvent.captured_at  < cutoff_dep,
        ).delete(synchronize_session=False)

        db.commit()
    finally:
        db.close()


@celery.task
def refresh_subway_proximity():
    if not _throttle("subway_proximity", cooldown_seconds=86400 * 7): return

    stations = mta.fetch_subway_stations()
    if not stations:
        entrances = mta.fetch_subway_entrances()
        if not entrances:
            return
        db = SessionLocal()
        try:
            for venue in _all_venues(db):
                lat, lng = _coords(venue)
                nearest = min(nyc_opendata._dist_m(lat, lng, e_lat, e_lng) for e_lat, e_lng in entrances)
                venue.nearest_subway_m = round(nearest)
            db.commit()
        finally:
            db.close()
        return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            best_dist = None
            best_lines: list[str] = []
            for station in stations:
                d = nyc_opendata._dist_m(lat, lng, station["lat"], station["lng"])
                if best_dist is None or d < best_dist:
                    best_dist = d
                    best_lines = station.get("lines") or []
            if best_dist is not None:
                venue.nearest_subway_m = round(best_dist)
            if best_lines:
                venue.subway_lines_served = sorted(best_lines)
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

            sentiment, net_signal = review_nlp.score_reviews(reviews)
            if sentiment is None:
                continue

            if sentiment > 0.2:
                category = "quiet"
            elif sentiment < -0.2:
                category = "loud"
            else:
                category = "moderate"

            venue.google_noise_estimate = category
            venue.google_review_signal  = net_signal

            if True:
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

    from app.models.complaint_baseline import ComplaintBaseline
    from app.scoring.composite import _bayesian_shrink, _BOROUGH_COMPLAINT_PRIOR

    db = SessionLocal()
    try:
        # Compute borough priors in one pass: median weekly_avg per borough.
        per_borough: dict[str, list[float]] = {}
        observations: list[tuple[Venue, float]] = []
        for venue in _all_venues(db):
            lat, lng = _coords(venue)
            complaints_60d = nyc_opendata.get_nearby_noise_complaints(lat, lng, radius_m=300, days=60)
            weekly = len(complaints_60d) / (60 / 7)
            observations.append((venue, weekly))
            per_borough.setdefault(venue.borough or "_", []).append(weekly)

        borough_prior = {b: (sorted(v)[len(v)//2] if v else _BOROUGH_COMPLAINT_PRIOR) for b, v in per_borough.items()}
        n_weeks = 60 / 7  # window length in weeks

        for venue, weekly in observations:
            prior = borough_prior.get(venue.borough or "_", _BOROUGH_COMPLAINT_PRIOR)
            posterior = _bayesian_shrink(weekly, n_weeks, prior)

            row = db.get(ComplaintBaseline, venue.id)
            if row is None:
                row = ComplaintBaseline(venue_id=venue.id, weekly_observed=weekly, n_weeks=n_weeks, borough_prior=prior, posterior=posterior)
                db.add(row)
            else:
                row.weekly_observed = weekly
                row.n_weeks = n_weeks
                row.borough_prior = prior
                row.posterior = posterior
                row.updated_at = datetime.now()

            key = f"complaint_baseline:{venue.id}"
            val = str(round(posterior, 3))
            if hasattr(celery.backend, 'client'):
                celery.backend.client.set(key, val, ex=86400 * 7)
            else:
                celery.backend.set(key, val)
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
def refresh_civic_data():
    if not _throttle("civic_data", cooldown_seconds=86400 * 30): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            enrichment = nyc_civic.enrich_venue(venue.name, venue.address, venue.borough)
            if not enrichment:
                continue
            if "has_outdoor_seating" in enrichment and venue.has_outdoor_seating is None:
                venue.has_outdoor_seating = enrichment["has_outdoor_seating"]
            if "is_cabaret" in enrichment and venue.is_cabaret is None:
                venue.is_cabaret = enrichment["is_cabaret"]
            if "liquor_license_type" in enrichment and not venue.liquor_license_type:
                venue.liquor_license_type = enrichment["liquor_license_type"]
            if "health_grade" in enrichment and not venue.health_grade:
                venue.health_grade = enrichment["health_grade"]
        db.commit()
    finally:
        db.close()


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
def refresh_venue_photos(force: bool = False):
    if not force and not _throttle("venue_photos", cooldown_seconds=86400 * 7):
        return

    db = SessionLocal()
    try:
        updated_count = 0
        for venue in _all_venues(db):
            if not venue.google_place_id:
                continue

            refs = google_places.get_photo_references(venue.google_place_id, max_photos=3)
            if refs:
                venue.photos = refs
                updated_count += 1

        if updated_count > 0:
            db.commit()
    finally:
        db.close()


_FOOD_TYPES = {"cafe", "restaurant", "food", "bakery", "meal_takeaway", "meal_delivery", "coffee_shop"}
_ALCOHOL_TYPES = {"bar", "beer_bar", "wine_bar", "liquor_store", "night_club", "cocktail_bar"}


@celery.task
def refresh_venue_details():
    if not _throttle("venue_details", cooldown_seconds=86400 * 7): return

    db = SessionLocal()
    try:
        for venue in _all_venues(db):
            if not venue.google_place_id:
                continue
            details = google_places.get_venue_extra_details(venue.google_place_id)
            if not details:
                continue
            if details.get("phone_number"):
                venue.phone_number = details["phone_number"]
            if details.get("website_url"):
                venue.website_url = details["website_url"]
            if details.get("venue_types"):
                venue.venue_types = details["venue_types"]
                type_set = set(details["venue_types"])
                if venue.serves_food is None:
                    venue.serves_food = bool(type_set & _FOOD_TYPES)
                if venue.serves_alcohol is None:
                    venue.serves_alcohol = bool(type_set & _ALCOHOL_TYPES)
            if details.get("price_tier") is not None and venue.price_tier is None:
                venue.price_tier = details["price_tier"]
            if details.get("neighborhood") and not venue.neighborhood:
                venue.neighborhood = details["neighborhood"]
            if details.get("borough") and not venue.borough:
                venue.borough = details["borough"]
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

            if venue.google_place_id:
                details = google_places.get_place_details(venue.google_place_id)
                if details:
                    if not matrix:
                        matrix = google_places.extract_popular_times_matrix(details)
                    hours_data = google_places.extract_opening_hours(details)
                    if hours_data:
                        venue.opening_hours = hours_data

            if not matrix:
                continue

            for day, hours in matrix.items():
                for hour, busyness in hours.items():
                    _upsert_hourly_profile(db, venue.id, day, hour, busyness)

        db.commit()
    finally:
        db.close()

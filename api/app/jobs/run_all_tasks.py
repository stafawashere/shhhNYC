import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.jobs.tasks import (
    refresh_weather,
    refresh_live_busyness,
    refresh_events,
    refresh_construction,
    refresh_tomtom_data,
    refresh_yelp_noise,
    refresh_subway_proximity,
    refresh_google_review_noise,
    refresh_noise_complaint_baseline,
    refresh_mta_alerts,
    refresh_dep_noise,
    refresh_nta_baseline,
    refresh_pedestrian_counts,
    refresh_popular_times,
    refresh_venue_photos,
    prune_realtime_modifiers
)


def run_all():
    print("Triggering all tasks")

    refresh_weather.delay()
    refresh_live_busyness.delay()
    refresh_events.delay()
    refresh_construction.delay()
    refresh_tomtom_data.delay()
    refresh_mta_alerts.delay()

    refresh_yelp_noise.delay()
    refresh_subway_proximity.delay()
    refresh_google_review_noise.delay()
    refresh_noise_complaint_baseline.delay()
    refresh_dep_noise.delay()
    refresh_nta_baseline.delay()
    refresh_pedestrian_counts.delay()
    refresh_popular_times.delay()
    refresh_venue_photos.delay()

    prune_realtime_modifiers.delay()

    print("All tasks sent to Celery")

if __name__ == "__main__":
    run_all()

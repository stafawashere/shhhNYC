from celery.schedules import crontab
from app.jobs.tasks import celery

celery.conf.beat_schedule = {
    "live-busyness": {
        "task": "app.jobs.tasks.refresh_live_busyness",
        "schedule": crontab(minute="*/20"),
    },
    "weather": {
        "task": "app.jobs.tasks.refresh_weather",
        "schedule": crontab(minute="*/30"),
    },
    "events": {
        "task": "app.jobs.tasks.refresh_events",
        "schedule": crontab(minute="*/30"),
    },
    "construction": {
        "task": "app.jobs.tasks.refresh_construction",
        "schedule": crontab(minute="*/30"),
    },
    "tomtom-traffic": {
        "task": "app.jobs.tasks.refresh_tomtom_data",
        "schedule": crontab(minute="*/15"),
    },
    "mta-alerts": {
        "task": "app.jobs.tasks.refresh_mta_alerts",
        "schedule": crontab(minute="*/10"),
    },

    "prune-modifiers": {
        "task": "app.jobs.tasks.prune_realtime_modifiers",
        "schedule": crontab(hour=3, minute=0),
    },

    "popular-times": {
        "task": "app.jobs.tasks.refresh_popular_times",
        "schedule": crontab(hour=2, minute=0, day_of_week=1),
    },
    "yelp-noise": {
        "task": "app.jobs.tasks.refresh_yelp_noise",
        "schedule": crontab(hour=4, minute=0, day_of_week=1),
    },
    "subway-proximity": {
        "task": "app.jobs.tasks.refresh_subway_proximity",
        "schedule": crontab(hour=5, minute=0, day_of_week=1),
    },
    "google-review-noise": {
        "task": "app.jobs.tasks.refresh_google_review_noise",
        "schedule": crontab(hour=5, minute=30, day_of_week=1),
    },
    "dep-noise": {
        "task": "app.jobs.tasks.refresh_dep_noise",
        "schedule": crontab(hour=6, minute=0, day_of_week=1),
    },
    "nta-baseline": {
        "task": "app.jobs.tasks.refresh_nta_baseline",
        "schedule": crontab(hour=6, minute=30, day_of_week=1),
    },
    "complaint-baseline": {
        "task": "app.jobs.tasks.refresh_noise_complaint_baseline",
        "schedule": crontab(hour=7, minute=0, day_of_week=1),
    },
    "pedestrian-counts": {
        "task": "app.jobs.tasks.refresh_pedestrian_counts",
        "schedule": crontab(hour=7, minute=30, day_of_week=1),
    },

}

celery.conf.timezone = "America/New_York"

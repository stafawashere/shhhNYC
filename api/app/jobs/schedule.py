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
    "popular-times": {
        "task": "app.jobs.tasks.refresh_popular_times",
        "schedule": crontab(hour=2, minute=0, day_of_week=0),
    },
    "tomtom-traffic": {
        "task": "app.jobs.tasks.refresh_tomtom_data",
        "schedule": crontab(minute="*/15"),
    },
}

celery.conf.timezone = "America/New_York"

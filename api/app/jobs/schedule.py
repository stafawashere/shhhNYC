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
        "schedule": crontab(hour=6, minute=0),
    },
    "construction": {
        "task": "app.jobs.tasks.refresh_construction",
        "schedule": crontab(hour=3, minute=0, day_of_week=1),  # Monday 3am
    },
    "popular-times": {
        "task": "app.jobs.tasks.refresh_popular_times",
        "schedule": crontab(hour=2, minute=0, day_of_week=0),  # Sunday 2am
    },
}

celery.conf.timezone = "America/New_York"

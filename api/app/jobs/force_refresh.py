import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import redis as redis_lib
from app.config import settings
from app.jobs import tasks


def _clear_throttles() -> None:
    r = redis_lib.from_url(settings.redis_url, decode_responses=True)
    keys = list(r.scan_iter("throttle_*"))
    for key in keys:
        r.delete(key)
    if keys:
        print(f"Cleared throttle keys: {', '.join(keys)}")
    else:
        print("No throttle keys found.")


def _run(label: str, task_fn) -> None:
    print(f"  {label}...", end=" ", flush=True)
    try:
        task_fn.apply()
        print("ok")
    except Exception as exc:
        print(f"FAILED — {exc}")


if __name__ == "__main__":
    print("=== force refresh ===\n")

    _clear_throttles()
    print()

    print("[ weekly / static ]")
    _run("Google review count + NLP", tasks.refresh_google_review_noise)
    _run("Yelp noise level",          tasks.refresh_yelp_noise)
    _run("Pedestrian volume",         tasks.refresh_pedestrian_counts)
    _run("Subway proximity",          tasks.refresh_subway_proximity)
    _run("DEP ambient noise",         tasks.refresh_dep_noise)
    _run("NTA baseline",              tasks.refresh_nta_baseline)
    _run("Complaint baseline",        tasks.refresh_noise_complaint_baseline)
    print()

    print("[ realtime ]")
    _run("OpenWeather",               tasks.refresh_weather)
    _run("NYC events + 311",          tasks.refresh_events)
    _run("Construction permits",      tasks.refresh_construction)
    _run("TomTom traffic",            tasks.refresh_tomtom_data)
    _run("MTA service status",        tasks.refresh_mta_alerts)
    _run("Popular times / busyness",  tasks.refresh_popular_times)
    print()

    print("Done — reload the debug panel.")

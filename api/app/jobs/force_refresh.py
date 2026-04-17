import sys
import os
import inspect
import redis as redis_lib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.config import settings
from app.jobs import tasks

_RATE_LIMITED_TASKS = {"refresh_tomtom_data"}


def clear_throttles() -> None:
    r = redis_lib.from_url(settings.redis_url, decode_responses=True)
    protected = {"throttle_tomtom"}
    keys = [k for k in r.scan_iter("throttle_*") if k not in protected]
    if keys:
        for key in keys:
            r.delete(key)
        print(f"cleared {len(keys)} throttle keys (protected: {", ".join(protected)})")
    else:
        print("no throttle keys found")

def run(label: str, task_fn) -> None:
    if hasattr(task_fn, "apply"):
        print(f"  {label}...", end=" ", flush=True)
        try:
            task_fn.apply()
            print("ok")
        except Exception as exc:
            print(f"err — {exc}")

if __name__ == "__main__":
    print("force Refresh")
    clear_throttles()
    print()

    all_tasks = [
        (name, obj)
        for name, obj in inspect.getmembers(tasks)
        if name.startswith("refresh_") and name not in _RATE_LIMITED_TASKS
    ]

    if not all_tasks:
        print("tasks missing refresh_?")
    else:
        print(f"{len(all_tasks)} tasks (rate-limited: {", ".join(_RATE_LIMITED_TASKS)})")
        for name, t_obj in all_tasks:
            clean_label = name.replace("refresh_", "").replace("_", " ").title()
            run(clean_label, t_obj)
    print("complete")
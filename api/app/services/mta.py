import io
import csv
import time
import zipfile
import httpx

_GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip"
_TIMEOUT = 30
_STATIONS_TTL = 86_400
_stations_cache: list[dict] | None = None
_stations_cache_ts: float = 0.0

def fetch_subway_entrances() -> list[tuple[float, float]]:
    try:
        resp = httpx.get(_GTFS_URL, timeout=_TIMEOUT, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError:
        return []

    try:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
            with z.open("stops.txt") as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
                entrances = []
                for row in reader:
                    if row.get("location_type") not in ("1", "2"):
                        continue
                    try:
                        lat = float(row["stop_lat"])
                        lng = float(row["stop_lon"])
                        entrances.append((lat, lng))
                    except (KeyError, ValueError):
                        continue
        return entrances
    except Exception:
        return []


def fetch_subway_stations() -> list[dict]:
    global _stations_cache, _stations_cache_ts

    if _stations_cache is not None and (time.time() - _stations_cache_ts) < _STATIONS_TTL:
        return _stations_cache

    try:
        resp = httpx.get(_GTFS_URL, timeout=_TIMEOUT, follow_redirects=True)
        resp.raise_for_status()
        zip_bytes = resp.content
    except Exception:
        return _stations_cache or []

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            parent_stations: dict[str, dict] = {}
            child_to_parent: dict[str, str] = {}
            with z.open("stops.txt") as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                    sid = row.get("stop_id", "").strip()
                    if row.get("location_type") == "1":
                        try:
                            parent_stations[sid] = {
                                "name": row["stop_name"].strip(),
                                "lat": float(row["stop_lat"]),
                                "lng": float(row["stop_lon"]),
                                "lines": set(),
                            }
                        except (KeyError, ValueError):
                            continue
                    elif row.get("parent_station"):
                        child_to_parent[sid] = row["parent_station"].strip()

            trip_route: dict[str, str] = {}
            with z.open("trips.txt") as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                    trip_route[row["trip_id"].strip()] = row["route_id"].strip()

            with z.open("stop_times.txt") as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                    stop_id = row.get("stop_id", "").strip()
                    trip_id = row.get("trip_id", "").strip()
                    route_id = trip_route.get(trip_id)
                    if not route_id:
                        continue
                    parent = child_to_parent.get(stop_id, stop_id)
                    if parent in parent_stations:
                        parent_stations[parent]["lines"].add(route_id)

    except Exception:
        return _stations_cache or []

    result = [
        {
            "name": s["name"],
            "lat": s["lat"],
            "lng": s["lng"],
            "lines": sorted(s["lines"]),
        }
        for s in parent_stations.values()
    ]

    _stations_cache = result
    _stations_cache_ts = time.time()
    return result

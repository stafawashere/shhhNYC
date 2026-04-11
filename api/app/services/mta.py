import io
import csv
import zipfile
import httpx

_GTFS_URL = "http://web.mta.info/developers/data/nyct/subway/google_transit.zip"
_TIMEOUT = 30


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

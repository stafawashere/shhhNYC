import requests
from app.config import settings

_FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
_INCIDENTS_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails"
_LAT_OFFSET = 0.0027
_LNG_OFFSET = 0.0033


def get_traffic_flow(lat: float, lng: float) -> dict | None:
    try:
        resp = requests.get(
            _FLOW_URL,
            params={"point": f"{lat},{lng}", "unit": "KMPH", "key": settings.tomtom_api_key},
            timeout=8,
        )
        resp.raise_for_status()
        return resp.json().get("flowSegmentData")
    except Exception:
        return None


def get_traffic_incidents(lat: float, lng: float) -> list[dict]:
    bbox = f"{lng - _LNG_OFFSET},{lat - _LAT_OFFSET},{lng + _LNG_OFFSET},{lat + _LAT_OFFSET}"
    try:
        resp = requests.get(
            _INCIDENTS_URL,
            params={
                "bbox": bbox,
                "fields": "{incidents{type,properties{iconCategory}}}",
                "language": "en-GB",
                "timeValidityFilter": "present",
                "key": settings.tomtom_api_key,
            },
            timeout=8,
        )
        resp.raise_for_status()
        return resp.json().get("incidents", [])
    except Exception:
        return []


def compute_noise_penalty(flow_data: dict | None, incidents: list[dict]) -> tuple[float | None, bool]:
    congestion_ratio: float | None = None
    if flow_data:
        current = flow_data.get("currentSpeed")
        free_flow = flow_data.get("freeFlowSpeed")
        if current is not None and free_flow and free_flow > 0:
            congestion_ratio = current / free_flow

    has_incidents = bool(incidents)
    return congestion_ratio, has_incidents

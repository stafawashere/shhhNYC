import requests
from app.config import settings

_FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
_INCIDENTS_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails"
_LAT_OFFSET = 0.0027
_LNG_OFFSET = 0.0033
_DEFAULT_SEVERITY = 1.5
_INCIDENT_SEVERITY: dict[int, float] = {
    1:  5.0,  # Accident
    8:  4.5,  # Road Closed
    9:  3.5,  # Road Works
    3:  3.0,  # Dangerous Conditions
    6:  2.5,  # Traffic Jam
    7:  2.0,  # Lane Closed
    14: 1.5,  # Broken Down Vehicle
    11: 1.5,  # Flooding
    2:  1.0,  # Fog
    4:  1.0,  # Rain
    5:  1.0,  # Ice
    10: 1.0,  # Wind
}


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


def compute_noise_penalty(flow_data: dict | None, incidents: list[dict]) -> tuple[float | None, float]:
    congestion_ratio: float | None = None
    if flow_data:
        current = flow_data.get("currentSpeed")
        free_flow = flow_data.get("freeFlowSpeed")
        if current is not None and free_flow and free_flow > 0:
            congestion_ratio = current / free_flow

    if not incidents:
        return congestion_ratio, 0.0

    max_severity = 0.0
    for inc in incidents:
        cat = inc.get("properties", {}).get("iconCategory", 0)
        sev = _INCIDENT_SEVERITY.get(int(cat), _DEFAULT_SEVERITY)
        if sev > max_severity:
            max_severity = sev

    return congestion_ratio, max_severity

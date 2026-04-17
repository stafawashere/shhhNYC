import httpx
from google.transit import gtfs_realtime_pb2

_FEEDS = [
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",      # 1 2 3 4 5 6 7 S
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",  # A C E
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm", # B D F M
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",    # G
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",   # J Z
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw", # N Q R W
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",    # L
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si",   # SIR
]
_TIMEOUT = 10

_EFFECT_SEVERITY: dict[int, float] = {
    1: 4.0,  # NO_SERVICE
    2: 2.0,  # REDUCED_SERVICE
    3: 2.5,  # SIGNIFICANT_DELAYS
    4: 1.0,  # DETOUR
    5: 0.0,  # ADDITIONAL_SERVICE
    6: 1.0,  # MODIFIED_SERVICE
    7: 0.5,  # OTHER_EFFECT
    8: 0.5,  # UNKNOWN_EFFECT
    9: 0.0,  # NO_EFFECT
    10: 0.0, # ACCESSIBILITY_ISSUE
}
_DEFAULT_SEVERITY = 0.5

_LINE_COVERAGE: dict[str, list[str]] = {
    "1": ["upper west side", "chelsea", "greenwich village", "tribeca", "financial district"],
    "2": ["harlem", "upper west side", "midtown", "brooklyn"],
    "3": ["harlem", "upper west side", "midtown", "brooklyn"],
    "4": ["bronx", "upper east side", "midtown", "lower manhattan", "brooklyn"],
    "5": ["bronx", "harlem", "midtown", "lower manhattan", "brooklyn"],
    "6": ["bronx", "harlem", "upper east side", "midtown", "lower east side"],
    "7": ["flushing", "long island city", "midtown", "queensboro"],
    "A": ["washington heights", "harlem", "midtown", "chelsea", "brooklyn", "far rockaway"],
    "B": ["bronx", "upper west side", "midtown"],
    "C": ["washington heights", "upper west side", "midtown", "chelsea"],
    "D": ["bronx", "upper west side", "midtown", "brooklyn"],
    "E": ["midtown", "queens", "financial district"],
    "F": ["queens", "midtown", "brooklyn", "lower east side"],
    "G": ["queens", "brooklyn", "greenpoint", "williamsburg"],
    "J": ["brooklyn", "lower manhattan", "financial district"],
    "L": ["lower east side", "east village", "chelsea", "brooklyn", "williamsburg"],
    "M": ["queens", "midtown", "brooklyn", "williamsburg"],
    "N": ["queens", "midtown", "brooklyn", "astoria"],
    "Q": ["upper east side", "midtown", "brooklyn"],
    "R": ["queens", "midtown", "brooklyn", "bay ridge"],
    "S": ["midtown", "times square", "grand central"],
    "W": ["queens", "midtown"],
    "Z": ["brooklyn", "lower manhattan"],
}


def get_service_status() -> dict[str, dict]:
    line_severity: dict[str, float] = {}

    for url in _FEEDS:
        try:
            resp = httpx.get(url, timeout=_TIMEOUT)
            resp.raise_for_status()
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(resp.content)
            for entity in feed.entity:
                if not entity.HasField("alert"):
                    continue
                effect = entity.alert.effect
                severity = _EFFECT_SEVERITY.get(effect, _DEFAULT_SEVERITY)
                if severity == 0.0:
                    continue
                for informed in entity.alert.informed_entity:
                    route = (informed.route_id or informed.trip.route_id).upper().strip()
                    if route and severity > line_severity.get(route, 0.0):
                        line_severity[route] = severity
        except Exception:
            continue

    return {route: {"severity": sev} for route, sev in line_severity.items()}


def get_venue_disruption_severity(neighborhood: str | None, borough: str | None, service_status: dict[str, dict]) -> float:
    if not service_status:
        return 0.0

    neighborhood_lower = (neighborhood or "").lower().strip()
    borough_lower = (borough or "").lower().strip()

    max_severity = 0.0
    for line, coverage in _LINE_COVERAGE.items():
        matched = False

        if neighborhood_lower:
            matched = any(
                area in neighborhood_lower or neighborhood_lower in area
                for area in coverage
            )

        if not matched and borough_lower:
            matched = any(borough_lower in area for area in coverage)

        if matched and line in service_status:
            sev = service_status[line]["severity"]
            if sev > max_severity:
                max_severity = sev

    return max_severity

import httpx
import xml.etree.ElementTree as ET

_STATUS_URL = "http://web.mta.info/status/serviceStatus.txt"
_TIMEOUT = 10

_STATUS_SEVERITY: dict[str, float] = {
    "good service":   0.0,
    "planned work":   0.5,
    "service change": 1.0,
    "delays":         2.5,
    "suspended":      4.0,
}
_DEFAULT_SEVERITY = 1.0

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
    try:
        resp = httpx.get(_STATUS_URL, timeout=_TIMEOUT)
        resp.raise_for_status()
        return _parse_xml(resp.text)
    except Exception:
        return {}


def _parse_xml(xml_text: str) -> dict[str, dict]:
    results: dict[str, dict] = {}
    try:
        root = ET.fromstring(xml_text)
        for line_el in root.findall(".//subway/line"):
            name = (line_el.findtext("name") or "").strip()
            status_text = (line_el.findtext("status") or "").strip()
            severity = _STATUS_SEVERITY.get(status_text.lower(), _DEFAULT_SEVERITY)
            for token in name.split():
                results[token.upper()] = {"status": status_text, "severity": severity}
    except ET.ParseError:
        pass
    return results


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

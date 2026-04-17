import httpx
import re
from difflib import SequenceMatcher

_SIDEWALK_CAFE_URL = "https://data.cityofnewyork.us/resource/fpeh-f7ci.json"
_DCWP_LICENSES_URL = "https://data.cityofnewyork.us/resource/w7w3-xahh.json"
_SLA_URL = "https://data.ny.gov/resource/9s3h-dpkz.json"
_DOHMH_URL = "https://data.cityofnewyork.us/resource/43nn-pn8j.json"
_TIMEOUT = 15
_BOROUGH_TO_COUNTY = {
    "manhattan": "New York",
    "brooklyn": "Kings",
    "queens": "Queens",
    "bronx": "Bronx",
    "staten island": "Richmond",
}

_STREET_WORD_SUBS = {
    "st": "street", "str": "street", "ave": "avenue", "av": "avenue",
    "blvd": "boulevard", "pl": "place", "pkwy": "parkway", "rd": "road",
    "ln": "lane", "dr": "drive", "ct": "court", "ter": "terrace",
    "hwy": "highway", "e": "east", "w": "west", "n": "north", "s": "south",
}

def _name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()

def _normalize_address(addr: str) -> str:
    addr = addr.upper().strip()
    addr = re.sub(r"\s+(APT|UNIT|STE|FL|FLOOR|#)\s*\S+", "", addr)
    addr = re.sub(r",.*", "", addr)
    return addr.strip()

def _street_number(addr: str) -> str | None:
    m = re.match(r"^\s*(\d+)", addr)
    return m.group(1) if m else None


def get_sidewalk_cafe(name: str, address: str) -> bool | None:
    street_num = _street_number(address)
    if not street_num:
        return None

    addr_street = re.sub(r"^\s*\d+\s*", "", _normalize_address(address))

    try:
        params = {
            "$where": "license_status='Issued'",
            "$limit": "5000",
            "$select": "business_legal_name,assumed_name_s,street",
        }
        resp = httpx.get(_SIDEWALK_CAFE_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        records = resp.json()
    except Exception:
        return None

    for r in records:
        rec_street_full = (r.get("street") or "").strip()
        m = re.match(r"^\s*(\d+)\s*(.*)$", rec_street_full)
        if not m or m.group(1) != street_num:
            continue
        rec_street_name = m.group(2)
        if not _same_street(addr_street, rec_street_name):
            continue
        for key in ("assumed_name_s", "business_legal_name"):
            rec_name = r.get(key) or ""
            if rec_name and _name_similarity(name, rec_name) >= 0.55:
                return True
    return False


def get_is_cabaret(name: str, address: str) -> bool | None:
    street_num = _street_number(address)
    if not street_num:
        return None
    try:
        params = {
            "$where": "business_category='Cabaret' AND license_status='Active'",
            "$limit": "500",
            "$select": "business_name,address_street_name,address_building",
        }
        resp = httpx.get(_DCWP_LICENSES_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        records = resp.json()
    except Exception:
        return None

    for r in records:
        rec_num = r.get("address_building") or ""
        if rec_num.strip() != street_num:
            continue
        rec_name = r.get("business_name") or ""
        if _name_similarity(name, rec_name) >= 0.6:
            return True
    return False


def get_liquor_license_type(name: str, address: str, borough: str | None = None) -> str | None:
    street_num = _street_number(address)
    if not street_num:
        return None

    today = __import__("datetime").date.today().isoformat()
    where = f"expirationdate > '{today}'"
    if borough:
        county = _BOROUGH_TO_COUNTY.get(borough.lower())
        if county:
            where += f" AND premisescounty='{county}'"

    try:
        params = {
            "$where": where,
            "$limit": "5000",
            "$select": "legalname,actualaddressofpremises,description,premisescounty,expirationdate",
        }
        resp = httpx.get(_SLA_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        records = resp.json()
    except Exception:
        return None

    best_score = 0.0
    best_desc: str | None = None

    for r in records:
        rec_addr = r.get("actualaddressofpremises") or ""
        if _street_number(rec_addr) != street_num:
            continue
        rec_name = r.get("legalname") or ""
        score = _name_similarity(name, rec_name)
        if score > best_score and score >= 0.55:
            best_score = score
            best_desc = r.get("description")

    return best_desc


def _street_tokens(s: str) -> list[str]:
    s = re.sub(r"[^\w\s]", " ", s.lower())
    out: list[str] = []
    for tok in s.split():
        if tok in {"new", "york", "ny"}:
            continue
        out.append(_STREET_WORD_SUBS.get(tok, tok))
    return out


def _same_street(a: str, b: str) -> bool:
    ta = set(_street_tokens(a))
    tb = set(_street_tokens(b))
    if not ta or not tb:
        return False
    overlap = ta & tb
    if len(overlap) >= min(2, min(len(ta), len(tb))):
        return True
    joined_a = "".join(_street_tokens(a))
    joined_b = "".join(_street_tokens(b))
    return bool(joined_a) and bool(joined_b) and _name_similarity(joined_a, joined_b) >= 0.85


def get_health_grade(name: str, address: str, borough: str | None = None) -> str | None:
    street_num = _street_number(address)
    if not street_num:
        return None

    boro_filter = ""
    if borough:
        boro_filter = f" AND boro='{borough.title()}'"

    try:
        params = {
            "$where": f"grade IS NOT NULL{boro_filter} AND building='{street_num}'",
            "$order": "grade_date DESC",
            "$limit": "2000",
            "$select": "dba,building,street,grade,grade_date,boro",
        }
        resp = httpx.get(_DOHMH_URL, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        records = resp.json()
    except Exception:
        return None

    addr_no_num = re.sub(r"^\s*\d+\s*", "", _normalize_address(address))
    best_score = 0.0
    best_grade: str | None = None

    for r in records:
        rec_street = r.get("street") or ""
        if not _same_street(addr_no_num, rec_street):
            continue
        rec_name = r.get("dba") or ""
        score = _name_similarity(name, rec_name)
        if score > best_score and score >= 0.55:
            best_score = score
            best_grade = r.get("grade")

    return best_grade


def enrich_venue(name: str, address: str, borough: str | None = None) -> dict:
    out: dict = {}

    outdoor = get_sidewalk_cafe(name, address)
    if outdoor is not None:
        out["has_outdoor_seating"] = outdoor

    cabaret = get_is_cabaret(name, address)
    if cabaret is not None:
        out["is_cabaret"] = cabaret

    license_type = get_liquor_license_type(name, address, borough)
    if license_type:
        out["liquor_license_type"] = license_type

    grade = get_health_grade(name, address, borough)
    if grade:
        out["health_grade"] = grade

    return out

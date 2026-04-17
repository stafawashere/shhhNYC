import hashlib
import json
import math
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from app.models.venue import Venue
from app.models.signal_event import SIGNAL_TTLS, SIGNAL_CONFIDENCE
from app.models.scoring_prediction import ScoringPrediction
from app.db.queries import (
    get_hourly_profile,
    get_latest_signals,
    count_profile_slots,
    count_profile_slots_near,
    get_profile_neighbors,
    venue_busyness_std,
    nightlife_cluster_count,
)
from app.scoring.static import static_score
from app.scoring.temporal import temporal_score, temporal_score_from_data
from app.scoring.realtime import realtime_score, Signals
import logging

_log = logging.getLogger(__name__)
_NYC_TZ = ZoneInfo("America/New_York")


def _hhmm_to_minutes(t: str | None) -> int | None:
    if not t or len(t) != 4 or not t.isdigit():
        return None
    return int(t[:2]) * 60 + int(t[2:])


def is_venue_open(venue: Venue, dt: datetime) -> bool | None:
    oh = getattr(venue, "opening_hours", None)
    if not oh:
        return None
    periods = oh.get("periods") or []
    if not periods:
        return None

    py_to_google = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}
    today_g = py_to_google[dt.weekday()]
    yesterday_g = py_to_google[(dt.weekday() - 1) % 7]
    now_m = dt.hour * 60 + dt.minute

    for p in periods:
        o = p.get("open") or {}
        c = p.get("close") or {}
        o_day, c_day = o.get("day"), c.get("day")
        o_m = _hhmm_to_minutes(o.get("time"))
        c_m = _hhmm_to_minutes(c.get("time"))
        if o_m is None:
            continue
        if c_m is None:
            if o_day == today_g:
                return True
            continue
        if o_day == today_g and c_day == today_g and o_m <= now_m < c_m:
            return True
        if o_day == yesterday_g and c_day == today_g and now_m < c_m:
            return True
        if o_day == today_g and c_day != today_g and now_m >= o_m:
            return True
    return False


def _closed_score_dict(venue: Venue, s: float) -> dict:
    return {
        "quiet_score": None,
        "label": "Closed",
        "model": MODEL_INFO,
        "confidence": 0.0,
        "breakdown": {
            "venue_traits":    s,
            "time_pattern":    0.0,
            "live_adjustment": 0.0,
            "traffic_penalty": 0.0,
        },
        "traffic_congestion": None,
        "closed": True,
    }
def _load_weights_file() -> dict:
    import os
    path = os.path.join(os.path.dirname(__file__), "scoring_weights.json")
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


_WEIGHTS_FILE = _load_weights_file()
_PROD = _WEIGHTS_FILE.get("production", {})
_MAX_NOISE = float(_PROD.get("max_noise", 60.0))
_W = _PROD.get("weights", {"s": 1.0, "t": 1.0, "r": 1.0, "tp": 1.0})

MODEL_INFO = {
    "version": _WEIGHTS_FILE.get("version"),
    "max_noise": _MAX_NOISE,
    "calibrated": bool(_WEIGHTS_FILE),
    "n_train": _WEIGHTS_FILE.get("n_train"),
}


def score_to_label(score: float) -> str:
    if score >= 80: return "Very Quiet"
    if score >= 60: return "Quiet"
    if score >= 40: return "Moderate"
    if score >= 20: return "Loud"
    return "Very Loud"


def _review_count_factor(review_count: int | None) -> float:
    if not review_count or review_count < 1:
        return 0.0
    return min(1.0, math.log10(review_count) / 3.0)


def _to_category(level: str | None) -> str | None:
    if level in ("quiet",):               return "quiet"
    if level in ("average", "moderate"):  return "moderate"
    if level in ("loud", "very_loud"):    return "loud"
    return None


def _component_disagreement(s: float, t: float, r: float, tp: float) -> float:
    parts = [s / 40.0, t / 50.0, max(0.0, (r + 15.0) / 30.0), tp / 10.0]
    mean = sum(parts) / len(parts)
    var = sum((p - mean) ** 2 for p in parts) / len(parts)
    return min(1.0, var * 4.0)


def _volatility_dampener(busy_std: float | None) -> float:
    """Map busyness std-dev (0-50 typical range) to a [0.7, 1.0] confidence multiplier.

    A perfectly steady venue (std=0) keeps full confidence; very volatile
    venues (std≥30) lose 30%.
    """
    if busy_std is None:
        return 1.0
    return max(0.7, 1.0 - min(0.3, busy_std / 100.0))


def compute_confidence(venue: Venue, profile, signals: Signals, slot_count: int, local_slot_count: int | None = None, components: tuple[float, float, float, float] | None = None, busy_std: float | None = None,) -> float:
    now = datetime.now(_NYC_TZ)
    score = 0.0

    cells = local_slot_count if local_slot_count is not None else slot_count
    cell_target = 3.0 if local_slot_count is not None else 112.0
    if cells > 0:
        score += 0.05 + 0.25 * min(1.0, cells / cell_target)

    if profile is not None and profile.busyness_avg is not None:
        score += 0.05

    if venue.google_noise_estimate is not None:
        score += 0.07 * _review_count_factor(venue.google_review_count)

    for sig_type, max_contrib in SIGNAL_CONFIDENCE.items():
        entry = signals.get(sig_type)
        if entry is None:
            continue
        _, captured_at = entry
        ttl_min = SIGNAL_TTLS[sig_type]
        age_min = (now - captured_at.astimezone(_NYC_TZ)).total_seconds() / 60
        if age_min <= ttl_min:
            score += max_contrib * max(0.2, 1.0 - age_min / ttl_min)

    if components is not None:
        score *= 1.0 - 0.35 * _component_disagreement(*components)

    score *= _volatility_dampener(busy_std)

    return round(min(1.0, score), 2)


_BOROUGH_COMPLAINT_PRIOR = 1.2
_SHRINKAGE_ALPHA = 4.0  # equivalent weeks of prior; weak prior, dominated once n_weeks >> 4


def _bayesian_shrink(weekly_observed: float, n_weeks: float, prior: float, alpha: float = _SHRINKAGE_ALPHA) -> float:
    """Posterior weekly complaint rate under a Gamma-Poisson conjugate prior.

    posterior = (n_weeks * weekly_observed + alpha * prior) / (n_weeks + alpha)
    """
    return (n_weeks * weekly_observed + alpha * prior) / max(1e-6, n_weeks + alpha)


def _get_complaint_baseline(venue_id, db: Session | None = None) -> float:
    # 1) Redis cache
    try:
        from app.config import settings
        import redis as _redis
        r = _redis.from_url(settings.redis_url, decode_responses=True)
        val = r.get(f"complaint_baseline:{venue_id}")
        if val is not None:
            return float(val)
    except Exception as exc:
        _log.warning("complaint_baseline redis miss for %s: %s", venue_id, exc)

    # 2) Postgres source-of-truth — apply shrinkage on read
    if db is not None:
        try:
            from app.models.complaint_baseline import ComplaintBaseline
            row = db.get(ComplaintBaseline, venue_id)
            if row is not None:
                return float(row.posterior)
        except Exception as exc:
            _log.warning("complaint_baseline postgres miss for %s: %s", venue_id, exc)

    # 3) Borough prior fallback (still better than 0.0)
    return _BOROUGH_COMPLAINT_PRIOR


def _build_score_dict(
    venue: Venue,
    profile,
    signals: Signals,
    slot_count: int,
    s: float,
    t: float,
    r: float,
    tp: float,
    local_slot_count: int | None = None,
    busy_std: float | None = None,
) -> dict:
    noise_raw = max(0.0, _W["s"] * s + _W["t"] * t + _W["r"] * r + _W["tp"] * tp)
    score = max(0.0, min(100.0, 100.0 - (noise_raw / _MAX_NOISE) * 100.0))
    tomtom_entry = signals.get("tomtom")
    traffic_congestion = tomtom_entry[0].get("congestion") if tomtom_entry else None

    return {
        "quiet_score": round(score),
        "label": score_to_label(score),
        "model": MODEL_INFO,
        "confidence": compute_confidence(
            venue=venue,
            profile=profile,
            signals=signals,
            slot_count=slot_count,
            local_slot_count=local_slot_count,
            components=(s, t, r, tp),
            busy_std=busy_std,
        ),
        "breakdown": {
            "venue_traits":    s,
            "time_pattern":    t,
            "live_adjustment": r,
            "traffic_penalty": tp,
        },
        "traffic_congestion": traffic_congestion,
    }


def _smoothed_profile(profile, neighbors):
    if profile is None or not neighbors:
        return profile

    class _P:
        pass

    smoothed = _P()
    vals = [profile.busyness_avg] + [n.busyness_avg for n in neighbors if n.busyness_avg is not None]
    smoothed.busyness_avg = sum(vals) / len(vals) if vals else profile.busyness_avg

    n_vals = [profile.noise_estimate] + [n.noise_estimate for n in neighbors if n.noise_estimate is not None]
    n_vals = [v for v in n_vals if v is not None]
    smoothed.noise_estimate = sum(n_vals) / len(n_vals) if n_vals else None
    return smoothed


def _signal_hash(signals: Signals) -> str | None:
    if not signals:
        return None
    keys = sorted(signals.keys())
    h = hashlib.blake2s(digest_size=8)
    h.update(json.dumps(keys, separators=(",", ":")).encode())
    return h.hexdigest()


def _log_prediction(venue_id, dt: datetime, s: float, t: float, r: float, tp: float, score: float, confidence: float, signals: Signals) -> None:
    from app.db.session import SessionLocal
    sess = SessionLocal()
    try:
        sess.add(ScoringPrediction(
            venue_id=venue_id, scored_at=dt,
            hour=dt.hour, dow=dt.weekday(),
            static=s, temporal=t, realtime=r, traffic=tp,
            score=score, confidence=confidence,
            signal_hash=_signal_hash(signals),
        ))
        sess.commit()
    except Exception as exc:
        _log.warning("scoring telemetry insert failed for %s: %s", venue_id, exc)
        sess.rollback()
    finally:
        sess.close()


def quiet_score(db: Session, venue: Venue, dt: datetime = None, include_realtime: bool = True) -> dict:
    dt = dt or datetime.now(_NYC_TZ)

    if is_venue_open(venue, dt) is False:
        return _closed_score_dict(venue, static_score(venue))

    profile    = get_hourly_profile(db, venue.id, dt.hour, dt.weekday())
    neighbors  = get_profile_neighbors(db, venue.id, dt.hour, dt.weekday())
    profile    = _smoothed_profile(profile, neighbors)
    signals    = get_latest_signals(db, venue.id) if include_realtime else {}
    slot_count = count_profile_slots(db, venue.id)
    local_slot_count = count_profile_slots_near(db, venue.id, dt.hour, dt.weekday(), window=1)
    complaint_baseline = _get_complaint_baseline(venue.id, db) if include_realtime else 0.0
    cluster_count = nightlife_cluster_count(db, venue.id)
    busy_std = venue_busyness_std(db, venue.id)
    s = static_score(venue, cluster_count=cluster_count)
    t = temporal_score(db, profile, venue, dt)
    r, tp = realtime_score(venue, signals, complaint_baseline) if include_realtime else (0.0, 0.0)

    result = _build_score_dict(venue, profile, signals, slot_count, s, t, r, tp, local_slot_count, busy_std=busy_std)
    if include_realtime and result.get("quiet_score") is not None:
        _log_prediction(venue.id, dt, s, t, r, tp, float(result["quiet_score"]), float(result["confidence"]), signals)
    return result


def quiet_score_from_data(venue: Venue, dt: datetime, profile, signals: Signals, slot_count: int, recent_signals: list, dow_signals: list, complaint_baseline: float, local_slot_count: int | None = None, cluster_count: int = 0, busy_std: float | None = None) -> dict:
    s  = static_score(venue, cluster_count=cluster_count)
    if is_venue_open(venue, dt) is False:
        return _closed_score_dict(venue, s)
    t  = temporal_score_from_data(profile, venue, dt, recent_signals, dow_signals)
    r, tp = realtime_score(venue, signals, complaint_baseline)

    return _build_score_dict(venue, profile, signals, slot_count, s, t, r, tp, local_slot_count, busy_std=busy_std)

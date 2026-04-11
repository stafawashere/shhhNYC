from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.hourly_profile import VenueHourlyProfile
from app.models.realtime_modifier import RealtimeModifier
from app.models.user_signal import UserSignal
import math

_NYC_TZ = ZoneInfo("America/New_York")


def get_hourly_profile(db: Session, venue_id, hour: int, day_of_week: int):
    return db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id,
        VenueHourlyProfile.hour == hour,
        VenueHourlyProfile.day_of_week == day_of_week,
    ).first()


def get_latest_realtime(db: Session, venue_id):
    return (
        db.query(RealtimeModifier)
        .filter(RealtimeModifier.venue_id == venue_id)
        .order_by(RealtimeModifier.timestamp.desc())
        .first()
    )


def count_recent_signals(db: Session, venue_id, hours: int = 72) -> int:
    cutoff = datetime.now(_NYC_TZ) - timedelta(hours=hours)
    return (
        db.query(UserSignal)
        .filter(UserSignal.venue_id == venue_id, UserSignal.timestamp >= cutoff)
        .count()
    )


def count_profile_slots(db: Session, venue_id) -> int:
    return db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id
    ).count()


def _compute_user_avg(recent: list, dow_signals: list, now: datetime) -> float | None:
    if not recent and not dow_signals:
        return None
    total_w, weighted_sum = 0.0, 0.0
    for s in recent:
        age_h = (now - s.timestamp.astimezone(_NYC_TZ)).total_seconds() / 3600
        w = math.exp(-age_h / 24)
        total_w += w
        weighted_sum += w * s.noise_rating
    for s in dow_signals:
        age_h = (now - s.timestamp.astimezone(_NYC_TZ)).total_seconds() / 3600
        w = math.exp(-age_h / 24) * 0.5
        total_w += w
        weighted_sum += w * s.noise_rating
    return weighted_sum / total_w if total_w > 0 else None


def _compute_signal_confidence(recent: list, dow_signals: list, now: datetime) -> float:
    score = 0.0
    for s in recent:
        age_h = (now - s.timestamp.astimezone(_NYC_TZ)).total_seconds() / 3600
        if age_h < 1:    score += 0.10
        elif age_h < 6:  score += 0.07
        elif age_h < 24: score += 0.04
        else:            score += 0.02
    for s in dow_signals:
        age_h = (now - s.timestamp.astimezone(_NYC_TZ)).total_seconds() / 3600
        score += 0.01 if age_h < 24 * 8 else 0.005
    return min(0.15, score)


def _filter_dow_signals(candidates: list, dt: datetime) -> list:
    return [
        s for s in candidates
        if (
            s.timestamp.astimezone(_NYC_TZ).weekday() == dt.weekday()
            and abs(s.timestamp.astimezone(_NYC_TZ).hour - dt.hour) <= 2
        )
    ]


def get_signal_metrics(db: Session, venue_id, dt: datetime | None = None) -> tuple[float, float | None]:
    now = datetime.now(_NYC_TZ)
    cutoff_recent = now - timedelta(hours=72)

    recent = (
        db.query(UserSignal)
        .filter(UserSignal.venue_id == venue_id, UserSignal.timestamp >= cutoff_recent)
        .order_by(UserSignal.timestamp.desc())
        .limit(10)
        .all()
    )

    dow_signals: list = []
    if dt is not None:
        cutoff_dow = now - timedelta(days=14)
        candidates = (
            db.query(UserSignal)
            .filter(
                UserSignal.venue_id == venue_id,
                UserSignal.timestamp >= cutoff_dow,
                UserSignal.timestamp < cutoff_recent,
            )
            .order_by(UserSignal.timestamp.desc())
            .limit(20)
            .all()
        )
        dow_signals = _filter_dow_signals(candidates, dt)

    sig_score = _compute_signal_confidence(recent, dow_signals, now)
    user_avg  = _compute_user_avg(recent, dow_signals, now)
    return sig_score, user_avg


def signal_confidence(db: Session, venue_id, dt: datetime | None = None) -> float:
    sig_score, _ = get_signal_metrics(db, venue_id, dt)
    return sig_score


def get_user_signal_avg(db: Session, venue_id, dt: datetime | None = None) -> float | None:
    _, user_avg = get_signal_metrics(db, venue_id, dt)
    return user_avg


class BulkScoringData:
    def __init__(self, profile_map: dict, slot_count_map: dict, rt_map: dict, signal_count_map: dict, recent_signals_map: dict, dow_signals_map: dict, complaint_map: dict):
        self.profile_map       = profile_map
        self.slot_count_map    = slot_count_map
        self.rt_map            = rt_map
        self.signal_count_map  = signal_count_map
        self.recent_signals_map = recent_signals_map
        self.dow_signals_map   = dow_signals_map
        self.complaint_map     = complaint_map


def bulk_load_scoring_data(db: Session, venue_ids: list, dt: datetime) -> BulkScoringData:
    if not venue_ids:
        empty: dict = {}
        return BulkScoringData(empty, empty, empty, empty, empty, empty, empty)

    now = dt
    cutoff_recent = now - timedelta(hours=72)
    cutoff_dow    = now - timedelta(days=14)

    profiles = db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id.in_(venue_ids),
        VenueHourlyProfile.hour == dt.hour,
        VenueHourlyProfile.day_of_week == dt.weekday(),
    ).all()
    profile_map = {str(p.venue_id): p for p in profiles}

    slot_rows = db.query(
        VenueHourlyProfile.venue_id,
        func.count().label("cnt"),
    ).filter(
        VenueHourlyProfile.venue_id.in_(venue_ids)
    ).group_by(VenueHourlyProfile.venue_id).all()
    slot_count_map = {str(r.venue_id): r.cnt for r in slot_rows}

    subq = db.query(
        RealtimeModifier.venue_id,
        func.max(RealtimeModifier.timestamp).label("max_ts"),
    ).filter(
        RealtimeModifier.venue_id.in_(venue_ids)
    ).group_by(RealtimeModifier.venue_id).subquery()

    rt_rows = db.query(RealtimeModifier).join(
        subq,
        (RealtimeModifier.venue_id == subq.c.venue_id)
        & (RealtimeModifier.timestamp == subq.c.max_ts),
    ).all()
    rt_map = {str(r.venue_id): r for r in rt_rows}

    recent_all = db.query(UserSignal).filter(
        UserSignal.venue_id.in_(venue_ids),
        UserSignal.timestamp >= cutoff_recent,
    ).order_by(UserSignal.timestamp.desc()).all()

    recent_signals_map: dict = defaultdict(list)
    for s in recent_all:
        recent_signals_map[str(s.venue_id)].append(s)

    signal_count_map = {vid: len(sigs) for vid, sigs in recent_signals_map.items()}

    dow_all = db.query(UserSignal).filter(
        UserSignal.venue_id.in_(venue_ids),
        UserSignal.timestamp >= cutoff_dow,
        UserSignal.timestamp < cutoff_recent,
    ).order_by(UserSignal.timestamp.desc()).all()

    dow_signals_map: dict = defaultdict(list)
    for s in dow_all:
        ts = s.timestamp.astimezone(_NYC_TZ)
        if ts.weekday() == dt.weekday() and abs(ts.hour - dt.hour) <= 2:
            dow_signals_map[str(s.venue_id)].append(s)

    complaint_map: dict = {str(vid): 0.0 for vid in venue_ids}
    try:
        from app.config import settings
        import redis as _redis
        r = _redis.from_url(settings.redis_url, decode_responses=True)
        pipe = r.pipeline()
        for vid in venue_ids:
            pipe.get(f"complaint_baseline:{vid}")
        results = pipe.execute()
        for vid, val in zip(venue_ids, results):
            complaint_map[str(vid)] = float(val) if val else 0.0
    except Exception:
        pass

    return BulkScoringData(
        profile_map=dict(profile_map),
        slot_count_map=slot_count_map,
        rt_map=rt_map,
        signal_count_map=dict(signal_count_map),
        recent_signals_map=dict(recent_signals_map),
        dow_signals_map=dict(dow_signals_map),
        complaint_map=complaint_map,
    )

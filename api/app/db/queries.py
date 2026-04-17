from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.hourly_profile import VenueHourlyProfile
from app.models.signal_event import SignalEvent
from app.scoring.realtime import Signals

_NYC_TZ = ZoneInfo("America/New_York")


def get_hourly_profile(db: Session, venue_id, hour: int, day_of_week: int):
    return db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id,
        VenueHourlyProfile.hour == hour,
        VenueHourlyProfile.day_of_week == day_of_week,
    ).first()


def count_profile_slots(db: Session, venue_id) -> int:
    return db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id
    ).count()


def count_profile_slots_near(db: Session, venue_id, hour: int, day_of_week: int, window: int = 1) -> int:
    hours = [(hour + d) % 24 for d in range(-window, window + 1)]
    return db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id,
        VenueHourlyProfile.day_of_week == day_of_week,
        VenueHourlyProfile.hour.in_(hours),
    ).count()


def get_profile_neighbors(db: Session, venue_id, hour: int, day_of_week: int):
    hours = [(hour - 1) % 24, (hour + 1) % 24]
    return db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id == venue_id,
        VenueHourlyProfile.day_of_week == day_of_week,
        VenueHourlyProfile.hour.in_(hours),
    ).all()


def venue_busyness_std(db: Session, venue_id) -> float | None:
    """Std dev of busyness across all known (hour, dow) cells for a venue.

    Higher std => more volatile day-to-day pattern => predictions at any
    given cell are less trustworthy. Used to dampen confidence.
    """
    val = db.query(func.stddev_samp(VenueHourlyProfile.busyness_avg)).filter(
        VenueHourlyProfile.venue_id == venue_id,
        VenueHourlyProfile.busyness_avg.isnot(None),
    ).scalar()
    return float(val) if val is not None else None


def nightlife_cluster_count(db: Session, venue_id, radius_m: int = 150) -> int:
    """Count of nearby venues that contribute to nighttime acoustic load.

    A venue counts if it has loud-leaning music_policy or any liquor license.
    Self-excluded. Uses PostGIS ST_DWithin on the geography column.
    """
    from sqlalchemy import text
    sql = text("""
        SELECT count(*)
        FROM venues other
        JOIN venues self ON self.id = :venue_id
        WHERE other.id <> self.id
          AND ST_DWithin(other.location, self.location, :radius)
          AND (
            other.music_policy IN ('moderate', 'loud')
            OR other.liquor_license_type IS NOT NULL
          )
    """)
    return int(db.execute(sql, {"venue_id": str(venue_id), "radius": radius_m}).scalar() or 0)


def _rows_to_signals(rows: list[SignalEvent]) -> Signals:
    return {row.signal_type: (row.value, row.captured_at) for row in rows}


def get_latest_signals(db: Session, venue_id) -> Signals:
    subq = (
        db.query(
            SignalEvent.signal_type,
            func.max(SignalEvent.captured_at).label("max_ts"),
        )
        .filter(SignalEvent.venue_id == venue_id)
        .group_by(SignalEvent.signal_type)
        .subquery()
    )

    rows = (
        db.query(SignalEvent)
        .join(
            subq,
            (SignalEvent.signal_type == subq.c.signal_type)
            & (SignalEvent.captured_at == subq.c.max_ts),
        )
        .filter(SignalEvent.venue_id == venue_id)
        .all()
    )

    return _rows_to_signals(rows)


class BulkScoringData:
    def __init__(self, profile_map: dict, slot_count_map: dict, signals_map: dict[str, Signals], complaint_map: dict, cluster_map: dict | None = None, busy_std_map: dict | None = None):
        self.profile_map = profile_map
        self.slot_count_map = slot_count_map
        self.signals_map = signals_map
        self.complaint_map = complaint_map
        self.cluster_map = cluster_map or {}
        self.busy_std_map = busy_std_map or {}


def bulk_load_scoring_data(db: Session, venue_ids: list, dt: datetime) -> BulkScoringData:
    if not venue_ids:
        empty: dict = {}
        return BulkScoringData(empty, empty, empty, empty)

    profiles = db.query(VenueHourlyProfile).filter(
        VenueHourlyProfile.venue_id.in_(venue_ids),
        VenueHourlyProfile.hour == dt.hour,
        VenueHourlyProfile.day_of_week == dt.weekday(),
    ).all()

    profile_map = {str(p.venue_id): p for p in profiles}

    slot_rows = (
        db.query(VenueHourlyProfile.venue_id, func.count().label("cnt"))
        .filter(VenueHourlyProfile.venue_id.in_(venue_ids))
        .group_by(VenueHourlyProfile.venue_id)
        .all()
    )

    slot_count_map = {str(r.venue_id): r.cnt for r in slot_rows}

    subq = (
        db.query(
            SignalEvent.venue_id,
            SignalEvent.signal_type,
            func.max(SignalEvent.captured_at).label("max_ts"),
        )
        .filter(SignalEvent.venue_id.in_(venue_ids))
        .group_by(SignalEvent.venue_id, SignalEvent.signal_type)
        .subquery()
    )

    signal_rows = (
        db.query(SignalEvent)
        .join(
            subq,
            (SignalEvent.venue_id    == subq.c.venue_id)
            & (SignalEvent.signal_type == subq.c.signal_type)
            & (SignalEvent.captured_at == subq.c.max_ts),
        )
        .all()
    )

    signals_map: dict[str, Signals] = {str(vid): {} for vid in venue_ids}
    for row in signal_rows:
        vid = str(row.venue_id)
        signals_map[vid][row.signal_type] = (row.value, row.captured_at)

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

    busy_std_rows = (
        db.query(VenueHourlyProfile.venue_id, func.stddev_samp(VenueHourlyProfile.busyness_avg))
        .filter(
            VenueHourlyProfile.venue_id.in_(venue_ids),
            VenueHourlyProfile.busyness_avg.isnot(None),
        )
        .group_by(VenueHourlyProfile.venue_id)
        .all()
    )
    busy_std_map = {str(vid): float(s) for vid, s in busy_std_rows if s is not None}

    from sqlalchemy import text as _text
    cluster_rows = db.execute(_text("""
        SELECT self.id::text AS vid, count(other.id) AS c
        FROM venues self
        LEFT JOIN venues other
          ON other.id <> self.id
         AND ST_DWithin(other.location, self.location, 150)
         AND (other.music_policy IN ('moderate','loud') OR other.liquor_license_type IS NOT NULL)
        WHERE self.id = ANY(CAST(:ids AS uuid[]))
        GROUP BY self.id
    """), {"ids": [str(v) for v in venue_ids]}).all()
    cluster_map = {row.vid: int(row.c) for row in cluster_rows}

    return BulkScoringData(
        profile_map=profile_map,
        slot_count_map=slot_count_map,
        signals_map=signals_map,
        complaint_map=complaint_map,
        cluster_map=cluster_map,
        busy_std_map=busy_std_map,
    )

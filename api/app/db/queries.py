from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
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


def get_user_signal_avg(db: Session, venue_id, dt: datetime | None = None) -> float | None:
    now = datetime.now(_NYC_TZ)
    cutoff_recent = now - timedelta(hours=72)

    recent = (
        db.query(UserSignal)
        .filter(UserSignal.venue_id == venue_id, UserSignal.timestamp >= cutoff_recent)
        .order_by(UserSignal.timestamp.desc())
        .limit(10)
        .all()
    )

    dow_signals: list[UserSignal] = []
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
        current_dow = dt.weekday()
        current_hour = dt.hour
        dow_signals = [
            s for s in candidates
            if (
                s.timestamp.astimezone(_NYC_TZ).weekday() == current_dow
                and abs(s.timestamp.astimezone(_NYC_TZ).hour - current_hour) <= 2
            )
        ]

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


def signal_confidence(db: Session, venue_id, dt: datetime | None = None) -> float:
    now = datetime.now(_NYC_TZ)
    cutoff_recent = now - timedelta(hours=72)

    recent = (
        db.query(UserSignal)
        .filter(UserSignal.venue_id == venue_id, UserSignal.timestamp >= cutoff_recent)
        .order_by(UserSignal.timestamp.desc())
        .limit(10)
        .all()
    )

    dow_signals: list[UserSignal] = []
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
        current_dow = dt.weekday()
        current_hour = dt.hour
        dow_signals = [
            s for s in candidates
            if (
                s.timestamp.astimezone(_NYC_TZ).weekday() == current_dow
                and abs(s.timestamp.astimezone(_NYC_TZ).hour - current_hour) <= 2
            )
        ]

    score = 0.0
    for s in recent:
        age_h = (now - s.timestamp.astimezone(_NYC_TZ)).total_seconds() / 3600
        if age_h < 1:
            score += 0.10
        elif age_h < 6:
            score += 0.07
        elif age_h < 24:
            score += 0.04
        else:
            score += 0.02

    for s in dow_signals:
        age_h = (now - s.timestamp.astimezone(_NYC_TZ)).total_seconds() / 3600
        if age_h < 24 * 8:
            score += 0.01
        else:
            score += 0.005

    return min(0.15, score)

"""Fit non-negative ridge weights mapping (s, t, r, tp) -> DEP level (dB).

Output: api/app/scoring/scoring_weights.json with structure:
{
  "version": ISO8601 timestamp,
  "n_train": int,
  "weights": {"s": w, "t": w, "r": w, "tp": w},
  "intercept_db": float,
  "noise_raw_p99": float,        # learned _MAX_NOISE replacement
  "calibration": {"r2": float, "spearman": float}
}
"""
import json, os, sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import nnls
from sklearn.linear_model import Ridge
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.scoring.composite import quiet_score
from app.models.venue import Venue

DB_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg2://")
NYC = ZoneInfo("America/New_York")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "scoring", "scoring_weights.json")

engine = create_engine(DB_URL)

# Generate synthetic scoring snapshots: per venue, average over Tue+Sat × 24h.
sample_dows = [1, 5]
ref = datetime(2026, 4, 14, tzinfo=NYC)

with Session(engine) as db:
    venues = db.query(Venue).all()
    rows = []
    for v in venues:
        for dow in sample_dows:
            base = ref + timedelta(days=(dow - ref.weekday()) % 7)
            for h in range(24):
                dt = base.replace(hour=h, minute=0, second=0, microsecond=0)
                try:
                    res = quiet_score(db, v, dt=dt, include_realtime=True)
                except Exception:
                    continue
                if res.get("closed"):
                    continue
                br = res["breakdown"]
                rows.append(dict(
                    venue_id=str(v.id),
                    s=br["venue_traits"], t=br["time_pattern"],
                    r=br["live_adjustment"], tp=br["traffic_penalty"],
                ))

df = pd.DataFrame(rows)
agg = df.groupby("venue_id").agg(s=("s","mean"), t=("t","mean"), r=("r","mean"), tp=("tp","mean")).reset_index()

with engine.connect() as c:
    dep = pd.read_sql(text("""
        SELECT venue_id::text AS venue_id,
               avg((value->>'level')::float) AS dep_level
        FROM signal_events WHERE signal_type='dep_noise' GROUP BY venue_id
    """), c)

m = agg.merge(dep, on="venue_id", how="inner")
print(f"Training set: n={len(m)} venues")

X = m[["s","t","r","tp"]].values
y = m.dep_level.values

# Center r so the always-positive intercept absorbs its baseline (r ranges through negatives).
# For NNLS we constrain coefficients >= 0; r's sign mostly correct (positive r => louder).
# Shift X so all features are nonneg-friendly: r' = r - r.min().
r_shift = float(X[:,2].min())
X_shifted = X.copy()
X_shifted[:,2] = X_shifted[:,2] - r_shift
# Augment with intercept column for NNLS
X_aug = np.hstack([X_shifted, np.ones((len(X_shifted), 1))])
coefs_aug, _ = nnls(X_aug, y)
w = coefs_aug[:4]
intercept = float(coefs_aug[4]) - float(w[2]) * r_shift  # absorb the shift into intercept

pred = X @ w + intercept
ss_tot = ((y - y.mean())**2).sum()
r2 = 1 - ((y - pred)**2).sum()/ss_tot
rho, _ = stats.spearmanr(pred, y)
print(f"NNLS R²={r2:.3f}  Spearman ρ={rho:+.3f}")
print(f"Coefs: s={w[0]:.4f}  t={w[1]:.4f}  r={w[2]:.4f}  tp={w[3]:.4f}  intercept_dB={intercept:.2f}")

# Compute noise_raw distribution under the new weighted formula on the FULL cell-level data
df["noise_raw_w"] = w[0]*df.s + w[1]*df.t + w[2]*df.r + w[3]*df.tp
p99 = float(df.noise_raw_w.quantile(.99))
p50 = float(df.noise_raw_w.quantile(.5))
p_min = float(df.noise_raw_w.min())
print(f"weighted noise_raw: min={p_min:.2f}  p50={p50:.2f}  p99={p99:.2f}")

# Empirical p99 of *current* (unit-weight) noise_raw — drives _MAX_NOISE in production.
df["noise_raw_unit"] = df.s + df.t + df.r + df.tp
unit_p99 = float(df.noise_raw_unit.quantile(.99))

out = {
    "version": datetime.now(NYC).isoformat(),
    "n_train": int(len(m)),
    # Production scoring uses unit weights for now; we only override _MAX_NOISE
    # from the empirical p99 to fix B11 histogram compression.
    "production": {
        "weights": {"s": 1.0, "t": 1.0, "r": 1.0, "tp": 1.0},
        "max_noise": unit_p99,
    },
    # NNLS fit kept as research output — do NOT load into the scorer until n grows.
    "research": {
        "method": "nnls(dep_level ~ w_s*s + w_t*t + w_r*r + w_tp*tp + intercept)",
        "n_train": int(len(m)),
        "weights": {"s": float(w[0]), "t": float(w[1]), "r": float(w[2]), "tp": float(w[3])},
        "intercept_db": float(intercept),
        "weighted_noise_raw_p99": p99,
        "calibration": {"r2": float(r2), "spearman": float(rho)},
        "caveat": "Per-venue DEP averages collapse within-venue variance; s/t/tp coefs hit 0. Refit once scoring_predictions has cell-level data.",
    },
}
with open(OUT, "w") as f:
    json.dump(out, f, indent=2)
print(f"Wrote {OUT}")

"""Section 3.3 statistical assessment: histogram, residuals vs DEP, partial R2, confidence calibration."""
import os, sys, json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LinearRegression
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.scoring.composite import quiet_score, _MAX_NOISE
from app.models.venue import Venue

DB_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg2://")
NYC = ZoneInfo("America/New_York")

engine = create_engine(DB_URL)

# 1) Score every (venue, hour, dow) cell — sample dows={Tue,Sat}, all 24 hours
sample_dows = [1, 5]  # Tue, Sat
hours = list(range(24))
ref_date = datetime(2026, 4, 14, tzinfo=NYC)  # Tue

with Session(engine) as db:
    venues = db.query(Venue).all()
    rows = []
    for v in venues:
        for dow in sample_dows:
            base = ref_date + timedelta(days=(dow - ref_date.weekday()) % 7)
            for h in hours:
                dt = base.replace(hour=h, minute=0, second=0, microsecond=0)
                try:
                    res = quiet_score(db, v, dt=dt, include_realtime=True)
                except Exception as e:
                    continue
                if res.get("closed"):
                    continue
                br = res["breakdown"]
                rows.append(dict(
                    venue_id=str(v.id), dow=dow, hour=h,
                    score=res["quiet_score"], confidence=res["confidence"],
                    s=br["venue_traits"], t=br["time_pattern"],
                    r=br["live_adjustment"], tp=br["traffic_penalty"],
                ))

df = pd.DataFrame(rows)
print(f"\n=== n = {len(df)} venue-hour cells across {df.venue_id.nunique()} venues ===\n")

# (1) Score histogram
print("--- (1) Score histogram ---")
print(df.score.describe(percentiles=[.05,.1,.25,.5,.75,.9,.95]).to_string())
bins = [0,20,40,60,80,100]
labels = ["VeryLoud","Loud","Moderate","Quiet","VeryQuiet"]
hist = pd.cut(df.score, bins=bins, labels=labels, include_lowest=True).value_counts().sort_index()
print("\nLabel distribution:")
print(hist.to_string())
share_outside_40_70 = ((df.score < 40) | (df.score > 70)).mean()
print(f"\nShare outside [40,70]: {share_outside_40_70:.1%}  (DoD target: >10%)")

# Pull DEP per-venue mean level
with engine.connect() as c:
    dep = pd.read_sql(text("""
        SELECT venue_id::text AS venue_id,
               avg((value->>'level')::float) AS dep_level,
               count(*) AS dep_n
        FROM signal_events WHERE signal_type='dep_noise'
        GROUP BY venue_id
    """), c)
print(f"\n--- DEP coverage: {len(dep)} venues, avg {dep.dep_n.mean():.1f} readings each ---")

# Per-venue average score (across cells) for join
agg = df.groupby("venue_id").agg(
    score_mean=("score","mean"), s=("s","mean"), t=("t","mean"),
    r=("r","mean"), tp=("tp","mean"), conf=("confidence","mean"),
).reset_index()
m = agg.merge(dep, on="venue_id", how="inner")
print(f"Joined venues: {len(m)}")

# (2) Residuals vs DEP (DEP higher = louder => score should be lower)
print("\n--- (2) score_mean vs dep_level ---")
rho, p = stats.spearmanr(m.score_mean, m.dep_level)
pear = stats.pearsonr(m.score_mean, m.dep_level)
print(f"Spearman ρ = {rho:+.3f} (p={p:.3f})   expected: negative")
print(f"Pearson  r = {pear.statistic:+.3f} (p={pear.pvalue:.3f})")

# (3) Per-component partial R^2: fit dep ~ s + t + r + tp
print("\n--- (3) Partial R² (regress dep_level on each component) ---")
X = m[["s","t","r","tp"]].values
y = m.dep_level.values
full = LinearRegression().fit(X, y)
ss_tot = ((y - y.mean())**2).sum()
ss_res_full = ((y - full.predict(X))**2).sum()
r2_full = 1 - ss_res_full/ss_tot
print(f"Full model R² = {r2_full:.3f}")
print(f"Coefs: s={full.coef_[0]:+.3f}  t={full.coef_[1]:+.3f}  r={full.coef_[2]:+.3f}  tp={full.coef_[3]:+.3f}  int={full.intercept_:+.2f}")
for i, name in enumerate(["s","t","r","tp"]):
    Xr = np.delete(X, i, axis=1)
    fit = LinearRegression().fit(Xr, y)
    ss_res = ((y - fit.predict(Xr))**2).sum()
    r2_red = 1 - ss_res/ss_tot
    partial = r2_full - r2_red
    print(f"  drop {name}: ΔR² = {partial:+.4f}")

# Also: combined noise_raw vs DEP
m["noise_raw"] = m.s + m.t + m.r + m.tp
rho2, _ = stats.spearmanr(m.noise_raw, m.dep_level)
print(f"\nSpearman(noise_raw, dep_level) = {rho2:+.3f}  (expected: positive)")

# (4) Confidence calibration: |residual| binned by confidence quartile
print("\n--- (4) Confidence vs |residual| (calibration) ---")
# Build per-cell residual: predicted dep from full model
pred = full.predict(X)
m["abs_resid"] = np.abs(y - pred)
m["conf_bin"] = pd.qcut(m.conf, q=min(4, m.conf.nunique()), duplicates="drop")
calib = m.groupby("conf_bin", observed=True).agg(n=("abs_resid","size"), mean_abs_resid=("abs_resid","mean"), mean_conf=("conf","mean"))
print(calib.to_string())
rho_c, p_c = stats.spearmanr(m.conf, m.abs_resid)
print(f"\nSpearman(conf, |resid|) = {rho_c:+.3f} (p={p_c:.3f})  expected NEGATIVE if calibrated")

# B11 reality check
print(f"\n--- B11 reality check: _MAX_NOISE = {_MAX_NOISE} ---")
df["noise_raw"] = df.s + df.t + df.r + df.tp
print(f"noise_raw percentiles: p50={df.noise_raw.quantile(.5):.1f}  p90={df.noise_raw.quantile(.9):.1f}  p99={df.noise_raw.quantile(.99):.1f}  max={df.noise_raw.max():.1f}")
print(f"Suggested _MAX_NOISE (p99): {df.noise_raw.quantile(.99):.1f}")

out = "/tmp/section3_results.csv"
df.to_csv(out, index=False)
print(f"\nWrote per-cell scores to {out}")

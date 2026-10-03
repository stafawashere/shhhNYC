# shhhNYC - Quiet Workspace Map

A map of NYC cafes and workspaces that predicts how loud each one will be at a given hour. I got tired of walking into a cafe with my laptop and finding out it was packed and blasting music, so this pulls in city data, transit feeds, foot traffic, and reviews and turns them into one quiet score per venue.

Built with **Next.js 16**, **FastAPI**, **PostgreSQL + PostGIS**, and **Celery**.

---

## How the score works

Every venue gets a quiet score built from four parts:

- **Static** - things about the place itself that don't change much. Seating layout, music policy, food vs bar, and how many loud nightlife spots are clustered around it.
- **Temporal** - how busy it usually is at that hour and day, from BestTime foot traffic forecasts. Sparse hours get smoothed with neighboring hours so one missing slot doesn't throw the score off.
- **Realtime** - what's happening around it right now. MTA service alerts, TomTom traffic and incidents, active construction permits, permitted street events, and the weather.
- **Complaints** - 311 noise complaints near the venue, run through a Bayesian shrink toward the borough median so a venue with two weeks of data doesn't look worse than one with a year.

Closed venues are detected from Google opening hours and skipped. Each score also comes with a confidence value based on how much data backs it.

Review text gets its own signal. Reviews are embedded with sentence-transformers and compared against a set of reference sentences for "quiet" and "loud" places, so a cafe where people keep saying they take Zoom calls there ranks quieter.

I also tried fitting the weights against DEP noise readings (`scripts/fit_scoring_weights.py`). With only 21 venues the fit wasn't good enough to trust (R² around 0.28), so production still uses equal weights. The script and the results are in `app/scoring/scoring_weights.json` for when there's more data.

---

## Features

**Map**
- Mapbox map with venue markers colored by quiet score
- Live incident and construction markers with hover details
- Filters for the venue list

**Venue pages**
- Quiet score with a breakdown of each part
- Hourly busyness chart
- Warnings for nearby construction, events, and noise complaints
- Photo carousel and opening hours from Google Places

**Data pipeline**
- Celery Beat jobs on a schedule (MTA every 10 min, traffic every 20 min, weather/events/construction every 30 min, heavier civic data weekly)
- Redis-backed throttling so rate-limited APIs like TomTom don't get hammered
- Every prediction gets logged so the weights can be refit later

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Map | Mapbox GL, react-map-gl |
| Charts | Recharts |
| Styling | Tailwind CSS 4 |
| API | FastAPI, Pydantic |
| Database | PostgreSQL + PostGIS, SQLAlchemy, GeoAlchemy2, Alembic |
| Jobs | Celery + Redis |
| NLP | sentence-transformers |

### Data sources

- **NYC Open Data** - 311 noise complaints, DOB construction filings, permitted events, DOT pedestrian counts, sidewalk cafe and business licenses, health inspections
- **NY State** - liquor licenses
- **NYC DEP** - noise readings
- **MTA** - GTFS realtime feeds and service alerts
- **TomTom** - traffic flow and incidents
- **BestTime** - hourly foot traffic forecasts
- **Google Places** - venue details, photos, hours, reviews
- **OpenWeather** - current weather

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL with PostGIS
- Redis

### API

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Create api/.env (see below), then run migrations
alembic upgrade head

uvicorn app.main:app --reload
```

The background jobs run as two extra processes:

```bash
celery -A app.jobs.schedule worker --loglevel=info
celery -A app.jobs.schedule beat --loglevel=info
```

To refresh everything at once instead of waiting on the schedule:

```bash
python app/jobs/force_refresh.py
```

### Web

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000.

### Environment Variables

`api/.env`

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://localhost:6379/0"
GOOGLE_PLACES_API_KEY=""
OPENWEATHER_API_KEY=""
BESTTIME_API_KEY_PRIVATE=""
BESTTIME_API_KEY_PUBLIC=""
TOMTOM_API_KEY=""
```

`web/.env.local`

```env
NEXT_PUBLIC_API_URL="http://localhost:8000/api"
NEXT_PUBLIC_MAPBOX_TOKEN=""
```

---

## API

| Route | Description |
|-------|-------------|
| `GET /api/venues/nearby` | Venues near a lat/lng, with scores |
| `GET /api/venues/search` | Search by name, optionally by neighborhood |
| `GET /api/venues/{id}` | One venue with its current score |
| `GET /api/venues/{id}/predict` | Score for a specific hour and day |
| `GET /api/venues/{id}/hourly` | Hourly busyness for a day |
| `GET /api/venues/{id}/warnings` | Nearby construction, events, complaints |
| `GET /api/venues/{id}/debug` | Every raw input behind the score |
| `GET /api/incidents` | Live traffic incidents |
| `GET /api/subway-stations` | Subway station locations |
| `GET /api/meta/neighborhoods` | Neighborhood list |
| `POST /api/admin/venues` | Add a venue |

---

## Project Structure

```
api/
  app/
    routes/          # FastAPI routes
    models/          # SQLAlchemy models
    scoring/         # static, temporal, realtime, composite scoring
    services/        # one client per data source
    jobs/            # Celery tasks and schedule
    db/              # session and queries
  alembic/           # migrations
  scripts/           # weight fitting and score assessment
web/
  app/               # pages (map, venue detail)
  components/
    Map/             # map and markers
    Venue/           # venue card, detail page, hourly chart
    Controls/        # filters
  hooks/
  lib/               # API client, opening hours, theme
```

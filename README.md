# shhhNYC

A map of NYC cafes and workspaces that predicts how loud each one is. I got tired of walking into a cafe with my laptop and finding out it was packed and blasting music, so this pulls in city data, transit and traffic feeds, foot traffic forecasts and reviews, and turns them into one quiet score per venue.

The backend is FastAPI on PostgreSQL with PostGIS, with Celery and Redis running the data jobs. The frontend is Next.js 16 with a Mapbox map.

## How the score works

Each venue gets a noise estimate built from four parts. That estimate gets flipped into a quiet score from 0 to 100, where higher is quieter, along with a label like Quiet or Loud.

The first part is the venue itself. Music policy, seating type and square footage count, and so do how close the nearest subway entrance is, the DOT pedestrian count near it, and how many places with a liquor license or loud music sit within 150 meters.

The second part is the time. It uses how busy the place usually is at that hour and day, from BestTime's foot traffic forecasts, with Google's popular times as a fallback. Each hour gets averaged with the hours on either side so one odd slot doesn't throw it off. If a venue has no forecast at all, it falls back to a rough daily curve based on whether it serves food, alcohol or both.

The third part is what's going on around it right now. That covers recent 311 noise complaints, active DOB construction filings within 150 meters, permitted street events, MTA service alerts on the lines that serve the area (weighted by how far the venue is from the subway), TomTom traffic incidents, a DEP noise level, and the weather. Rain and snow make indoor seating louder because people pile inside, and they make outdoor seating quieter. When several disruptions stack up, each extra one counts for less, so five things going wrong at once doesn't count as five times worse.

The fourth part is traffic on the street outside, from TomTom's congestion reading. It fades out as the reading gets older.

Complaints get compared to a baseline instead of counted raw, because some blocks are always noisy. Once a week a job counts each venue's 311 noise complaints within 300 meters over the last 60 days and pulls that weekly rate toward the median for its borough, with the borough prior counting as four weeks of data (a Gamma-Poisson posterior). The live part only reacts to complaints above that baseline.

The DEP noise level also comes from 311. It looks at noise complaints near the venue from the last 30 days and uses the decibel readings written in the complaints' resolution notes when there are any. When there aren't, it falls back to the number of complaints and how many were the more serious kinds.

Review text is scored with sentence-transformers (`all-MiniLM-L6-v2`). Each Google review is compared to the average embedding of 34 "quiet" reference sentences and 34 "loud" ones, mixed with a keyword count, and weighted by length. The result goes into the venue's hourly profile next to the busyness data.

Closed venues are detected from Google opening hours and marked Closed instead of scored. Every score also comes with a confidence value. It goes up with how much forecast data and how many fresh live signals back the score, and it goes down when the four parts disagree with each other or when the venue's busyness swings a lot from hour to hour.

## What didn't work

I tried fitting the four weights against the DEP level with non-negative least squares (`api/scripts/fit_scoring_weights.py`). With only 21 venues the fit came out at R² 0.28 (Spearman 0.55), and it put all the weight on the live part and zero on the other three. That says more about averaging each venue down to one number than about cafes, so production still uses equal weights. The fit is saved under `research` in `api/app/scoring/scoring_weights.json` and the scorer ignores it. Every live score gets logged to a `scoring_predictions` table so I can refit later on hour-level data.

## Data sources

| Source | What it's used for |
|---|---|
| NYC Open Data | 311 noise complaints, DOB NOW job filings, permitted events, DOT pedestrian counts, sidewalk cafe licenses, DCWP licenses (cabaret check), restaurant inspection grades |
| NY State Open Data | SLA liquor licenses |
| MTA | Static GTFS for subway stations and entrances, GTFS-realtime alerts from the subway feeds |
| TomTom | Traffic flow and incidents |
| BestTime | Weekly foot traffic forecasts |
| Google Places | Place details, opening hours, photos, reviews |
| OpenWeather | Current weather |

Celery Beat runs the jobs on a schedule in New York time. MTA alerts refresh every 10 minutes, TomTom every 20 minutes between 7am and 10pm, and weather, events and construction every 30 minutes. The heavier jobs (forecasts, reviews, the complaint baseline, pedestrian counts, venue details, civic data) are scheduled for Monday mornings. Almost every job sets a cooldown key in Redis before it runs, so restarting a worker doesn't hammer rate-limited APIs like TomTom, and the civic data job's cooldown keeps it to once a month.

## The map

The web app shows venues on a Mapbox map, colored by quiet score, with toggles for traffic halos, subway stations and construction near the venues. You can filter by neighborhood, price, minimum score, open now, food and outdoor seating. Clicking a venue opens a card with its photos and hours, and its full page shows the score broken into its four parts, an hourly busyness chart, and the status of each data feed behind it. The venue list refreshes every two minutes.

## Running it locally

You need Python 3.12+, Node 20.9+, PostgreSQL with PostGIS, and Redis. Google Places, OpenWeather, BestTime and TomTom each need an API key, and NYC Open Data and the MTA feeds don't.

### API

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Two things to know before that works. `requirements.txt` still has a `tripadvisor` line from an earlier version, and that package isn't on PyPI, so take the line out before installing. `shapely` isn't in the file yet but the geometry code imports it, so run `pip install shapely` too. The scripts in `api/scripts/` also need `pandas`.

The migrations use PostGIS geography columns but don't create the extension, so run `CREATE EXTENSION postgis;` on your database first. The app connects with `sslmode=require` (set in `app/db/session.py`) because I ran it against a hosted Postgres, so a local database needs SSL on, or you can change that line.

Create `api/.env` with these values.

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://localhost:6379/0"
GOOGLE_PLACES_API_KEY=""
OPENWEATHER_API_KEY=""
BESTTIME_API_KEY_PRIVATE=""
BESTTIME_API_KEY_PUBLIC=""
TOMTOM_API_KEY=""
```

Then run the migrations and start the server.

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

The jobs run as two more processes from the same folder.

```bash
celery -A app.jobs.schedule worker --loglevel=info
celery -A app.jobs.schedule beat --loglevel=info
```

To run every job once right now instead of waiting for the schedule, use `python app/jobs/force_refresh.py`. It clears the cooldown keys first, except TomTom's.

There's no seed data. Venues get added with `POST /api/admin/venues` (name, address, lat and lng, plus optional traits like music policy, seating and a Google place id), and the jobs fill in the rest.

### Web

```bash
cd web
npm install
npm run dev
```

Create `web/.env.local` with your Mapbox token. The API URL already defaults to `http://localhost:8000/api`, and the API only allows requests from `http://localhost:3000`.

```env
NEXT_PUBLIC_API_URL="http://localhost:8000/api"
NEXT_PUBLIC_MAPBOX_TOKEN=""
```

## API

| Route | What it returns |
|---|---|
| `GET /api/venues/nearby` | Venues near a lat/lng with their current scores |
| `GET /api/venues/search` | Venues by name, optionally in one neighborhood |
| `GET /api/venues/{id}` | One venue and its current score |
| `GET /api/venues/{id}/predict` | The score for a given hour and day, without live signals |
| `GET /api/venues/{id}/hourly` | Hourly busyness for one day |
| `GET /api/venues/{id}/warnings` | Nearby construction, events and complaints |
| `GET /api/venues/{id}/photo/{index}` | One of the venue's Google photos |
| `GET /api/venues/{id}/debug` | Every raw input behind the score |
| `GET /api/incidents` | Citywide construction filings, recent 311 noise complaints and today's permitted events |
| `GET /api/subway-stations` | Subway station locations |
| `GET /api/meta/neighborhoods` | The neighborhood list |
| `POST /api/admin/venues` | Adds a venue |

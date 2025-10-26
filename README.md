# ScoutHouse Monorepo

Milestone **M0** delivers the initial foundations for the ScoutHouse platform. The
repository contains a React + TypeScript frontend and a FastAPI backend wired to a
PostgreSQL database, Docker tooling, and CI pipelines.

## Project layout

```
/
├── backend          # FastAPI application with SQLAlchemy models and Alembic migrations
├── frontend         # Vite + React TypeScript single-page application
├── scripts          # Helper utilities for local development
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

Key service names:

- Frontend: **web**
- Backend API: **api**
- PostgreSQL: **db**
- Redis (future use): **cache**
- Adminer (optional SQL UI): **adminer**

## Getting started

### Prerequisites

- Node.js 20.x with npm (ships with Node 20)
- Python 3.12
- Docker + Docker Compose v2 (for container orchestration)

### Environment variables

Create the following files from the provided examples:

```
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The backend `.env` exposes `DATABASE_URL`, `APP_ENV`, and the optional
`DEFAULT_BASE_LAT`/`DEFAULT_BASE_LON` coordinates used for distance
calculations. The frontend `.env` exposes the `VITE_API_URL` used to talk to the
API and `VITE_BASE_COORDS` for the default map reference point.

### Local development (without Docker)

#### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install .[dev]
uvicorn app.main:app --reload
```

Useful backend commands:

- Run migrations: `alembic upgrade head`
- Run the test suite: `pytest -q`
- Static analysis: `ruff check .` and `mypy app`
- Security scan: `bandit -r app -ll`

#### Seed data

A CSV dataset with 20+ sample structures lives in `data/structures_seed.csv`.
Seasonal availability and cost data live in
`data/structures_availability_seed.csv` and `data/structures_costs_seed.csv`.
Event fixtures live in `data/events_seed.csv` and `data/event_candidates_seed.csv`.
Sample quote snapshots can be provided via `data/quotes_seed.csv` (optional).
Load or refresh the catalog with:

```bash
python scripts/seed.py
```

The script is idempotent and updates existing rows by slug. Customize the input
files via `--file`, `--availability-file`, `--cost-file`, `--events-file`,
`--event-candidates-file`, and `--quotes-file` to seed other datasets.

The API exposes:

- `GET /api/v1/health` → `{ "status": "ok" }`
- `GET /api/v1/structures/search` → filtered, paginated catalog with optional
  full-text and distance filters
- `GET /api/v1/structures/by-slug/{slug}` → retrieve a single structure by its
  slug
- `GET /api/v1/structures/` → legacy list of all structures
- `POST /api/v1/structures/` → create a new structure record
- `GET /api/v1/events` → list events with pagination, search, and status filters
- `POST /api/v1/events` → create an event with automatic slug generation
- `GET /api/v1/events/{id}?include=candidates,tasks` → fetch details, candidates, and tasks
- `POST /api/v1/events/{id}/candidates` / `PATCH` → manage event candidates
- `GET /api/v1/events/{id}/summary` and `/suggest` → status totals and structure suggestions
- `POST /api/v1/quotes/calc` → calcola un preventivo deterministico senza salvarlo
- `POST /api/v1/events/{id}/quotes` → salva una versione del preventivo per l'evento
- `GET /api/v1/events/{id}/quotes` → elenca le versioni salvate
- `GET /api/v1/quotes/{id}` → recupera i dettagli completi (totali, breakdown, scenari)
- `GET /api/v1/quotes/{id}/export?format=xlsx|html` → esporta in XLSX o HTML stampabile

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit the application at http://localhost:5173. The `/structures` page now
provides search filters (including season, unit, and cost band),
distance-aware sorting, and pagination backed by the `/structures/search` API,
with badges summarising availability and estimated costs plus links to the
detail view for each entry. The `/events` area introduces a creation wizard
(determine details, participants/budget, suggestions) and an event dashboard
with candidate management, conflict indicators, and polling-powered summaries.

### Calcolare e salvare un preventivo

1. Apri la pagina di dettaglio di un evento e seleziona la scheda **Preventivi**.
2. Scegli una struttura candidata dall'elenco (le informazioni provengono dalle candidature dell'evento).
3. Verifica o modifica i parametri: i partecipanti di default sono quelli dell'evento; le notti sono calcolate come differenza di calendario tra fine e inizio (`nights = end_date - start_date`), mentre i giorni corrispondono a `nights + 1`.
4. Se servono valori differenti, inserisci le sovrascritture locali (partecipanti, giorni, notti) e premi **Calcola** per generare il breakdown.
5. Seleziona lo scenario desiderato (`best`, `realistic`, `worst`) e usa **Salva versione** per memorizzare il preventivo. Le versioni salvate appaiono nell'elenco, da cui è possibile confrontarne due alla volta.
6. Per l'export scegli **Esporta XLSX** (file Excel pronto per la condivisione) oppure **Stampa (HTML)** e usa la stampa del browser per generare un PDF.

You can lint and test the frontend with:

```bash
npm run lint
npm test -- --run
npm run build
```

#### Combined helper

`scripts/dev_server.py` spawns both `uvicorn` and the Vite dev server in parallel
(assumes the Python virtualenv and npm dependencies are already installed):

```bash
python scripts/dev_server.py
```

### Docker workflow

Build and launch the full stack with a single command:

```bash
docker compose up --build
```

The compose configuration wires the services as follows:

- Frontend available on http://localhost:5173
- Backend API available on http://localhost:8000
- PostgreSQL running on port 5432 (user/password: `scout`/`scout`)
- Redis available on port 6379 (reserved for future milestones)
- Adminer on http://localhost:8080 for inspecting the database

Hot reload is enabled through bind mounts for both the frontend and backend
services. The backend container automatically applies Alembic migrations before
starting Uvicorn.

### Continuous integration

GitHub Actions workflow [`ci.yml`](.github/workflows/ci.yml) executes:

- Frontend: `npm ci`, lint (`npm run lint`), tests (`npm test -- --run`), and
  production build (`npm run build`).
- Backend: installs dependencies via `pip install .[dev]`, runs `ruff`, `mypy`,
  `bandit -r app -ll`, and `pytest -q`.
- Docker: builds the `api` and `web` images to verify Dockerfiles stay healthy.

### Database migrations

Alembic migrations live under `backend/migrations/`. The initial revision
creates the `structures` table matching the SQLAlchemy model. Apply migrations
with:

```bash
cd backend
alembic upgrade head
```

### OpenAPI schema

The FastAPI application ships with the generated schema at
[`backend/openapi.json`](backend/openapi.json). To regenerate it after changing
routes run:

```bash
cd backend
python - <<'PY'
from pathlib import Path
from app.main import app
import json

schema = app.openapi()
Path("openapi.json").write_text(json.dumps(schema, indent=2))
PY
```

### Additional resources

- Frontend code structure is grouped by feature (`src/pages`) and shared modules
  (`src/shared`).
- React Query handles API data fetching with caching and loading states.
- Backend tests rely on SQLite for fast execution while production uses Postgres
  via SQLAlchemy and Alembic migrations.

## License

All rights reserved © ScoutHouse 2024.

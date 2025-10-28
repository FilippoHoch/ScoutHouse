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
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The root `.env` is used by the backup service defined in `docker-compose.yml`
and currently only contains the credentials needed to connect to the local
PostgreSQL instance. The backend `.env` exposes `DATABASE_URL`, `APP_ENV`, and
the optional
`DEFAULT_BASE_LAT`/`DEFAULT_BASE_LON` coordinates used for distance
calculations. Authentication adds `JWT_SECRET`, `ACCESS_TTL_MIN`,
`REFRESH_TTL_DAYS`, `ALLOW_REGISTRATION` (disabled by default),
`CORS_ALLOWED_ORIGINS`, and `SECURE_COOKIES`. The frontend `.env` exposes the
`VITE_API_URL` used to talk to the API and `VITE_BASE_COORDS` for the default
map reference point.

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

User registration is disabled unless you explicitly opt-in. For local testing,
set `ALLOW_REGISTRATION=true` in `backend/.env`, restart the API, and use
`POST /api/v1/auth/register` to create an account.

#### Testing password reset in development

1. Avvia il backend (`uvicorn app.main:app --reload`).
2. Chiama `POST /api/v1/auth/forgot-password` indicando l'email dell'utente.
3. Nel log del backend comparirà l'URL di reset contenente il token monouso.
4. Apri l'URL nel browser o invia `POST /api/v1/auth/reset-password` con `token`
   e la nuova password per completare l'operazione.
5. I token scadono dopo `PASSWORD_RESET_TTL_MINUTES` (60 minuti per default) e
   non possono essere riutilizzati.

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

### Import strutture (CSV/XLSX)

Gli amministratori possono caricare nuove strutture o aggiornare quelle esistenti
tramite l'endpoint `POST /api/v1/import/structures`. Il flusso completo è:

1. Scarica un template aggiornato dagli endpoint `GET /api/v1/templates/structures.xlsx`
   o `GET /api/v1/templates/structures.csv`, oppure dalla pagina web `/import-export`.
2. Compila le colonne richieste (`name`, `slug`, `province`, `address`,
   `latitude`, `longitude`, `type`). Provincia deve essere un codice a due
   lettere maiuscole; tipo ammesso: `house`, `land`, `mixed`.
3. Carica il file dalla pagina `/import-export`: viene eseguita automaticamente
   una validazione (`dry_run`) con anteprima di errori e azioni (`create`/`update`).
4. Se l'anteprima non mostra errori, premi **Importa** per eseguire l'upsert.

L'API accetta file XLSX o CSV (UTF-8, separatore `,`, decimali `.`) fino a 5 MB
e 2 000 righe dati, controlla latitudine e longitudine nei range consentiti e
registra un audit log `import_structures`
con i conteggi dell'operazione.

I template sono generati a runtime dal backend, così da evitare asset binari nel
repository. La pagina `/import-export` espone anche una sezione **Export** che
permette di scaricare strutture (con gli stessi filtri della ricerca) ed eventi
nei formati CSV, XLSX o JSON.

The API exposes:

- `GET /api/v1/health/live` → `{ "status": "ok" }` (liveness)
- `GET /api/v1/health/ready` → verifica connettività al DB e migrazioni
- `GET /api/v1/structures/search` → filtered, paginated catalog with optional
  full-text and distance filters
- `GET /api/v1/structures/by-slug/{slug}` → retrieve a single structure by its
  slug
- `GET /api/v1/structures/` → legacy list of all structures
- `GET/POST/PATCH/DELETE /api/v1/structures/{id}/contacts` → gestisci i contatti
  di riferimento della struttura con canale preferito e flag “primario”
- `POST /api/v1/structures/` → create a new structure record
- `GET /api/v1/templates/structures.xlsx` e `GET /api/v1/templates/structures.csv` → scarica i template generati a runtime
- `POST /api/v1/import/structures?dry_run=true|false` → import strutture da CSV o XLSX con anteprima errori e upsert per slug
- `GET /api/v1/export/structures?format=csv|xlsx|json` → export strutture in streaming con filtri opzionali
- `POST /api/v1/auth/login`, `/refresh`, `/logout` and `GET /api/v1/auth/me` →
  manage authenticated sessions with Argon2-hashed users, short-lived access
  tokens, and HttpOnly refresh cookies. `POST /api/v1/auth/register` is
  available when registration is enabled in configuration.
- `POST /api/v1/auth/forgot-password` / `POST /api/v1/auth/reset-password` →
  workflow di reset con token monouso (link riportato nel log in sviluppo).
- `GET /api/v1/events` → list events with pagination, search, and status filters
- `POST /api/v1/events` → create an event with automatic slug generation
- `GET /api/v1/events/{id}?include=candidates,tasks` → fetch details, candidates, and tasks
- `GET /api/v1/export/events?format=csv|xlsx|json` → export eventi visibili all'utente autenticato
- `GET /api/v1/events/{id}/ical` → scarica il calendario dell'evento in formato iCal
- `GET/POST/PATCH/DELETE /api/v1/events/{id}/members` → gestisci il team e i ruoli dell'evento
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
detail view for each entry. The structure detail screen includes a dedicated
**Contatti** tab where you can add, edit, promote, or remove contact records and
trigger quick email/phone actions. Sign in to access protected areas:
`/events`, `/events/:id`, and `/structures/new` are guarded client-side and
automatically refresh access tokens when the API returns `401`. The `/events`
area introduces a creation wizard (determine details, participants/budget,
suggestions) and an event dashboard with candidate management, conflict
indicators, quick links to contact the selected structure reference, and
polling-powered summaries.

### Live updates (SSE)

The event dashboard now consumes `GET /api/v1/events/{id}/live`, a
Server-Sent Events stream that invalidates TanStack Query caches whenever
candidates, tasks, or the event summary change. The hook automatically falls
back to the legacy 15 second polling if SSE is unavailable. See
[`docs/REALTIME.md`](docs/REALTIME.md) for architecture notes and operational
guidance.

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

### Observability and backups

- Structured JSON logging with per-request `X-Request-ID` correlation is enabled
  by default. Tweak `LOG_LEVEL`/`LOG_JSON` in `backend/.env` as needed.
- Health probes: `GET /api/v1/health/live` for liveness and
  `GET /api/v1/health/ready` for readiness (database connectivity + migrations).
- Prometheus metrics are available at `GET /metrics` and include request
  counters/latency histograms plus the `db_pool_connections_in_use` gauge.
- Sentry integration activates automatically when `SENTRY_DSN` is provided and
  respects `SENTRY_TRACES_SAMPLE_RATE` (default 0.1).
- The `backup` service runs daily `pg_dump` jobs. Configure the schedule via
  `BACKUP_CRON` and optionally set `AWS_*` variables to push dumps to S3/MinIO;
  otherwise they are stored in the `backup_data` volume under `/backups`.

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

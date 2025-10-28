# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.14.0] - 2025-10-27
### Added
- Export `structures` e `events` in CSV/XLSX/JSON con filtri e streaming.
- `GET /events/{id}/ical` per file iCal.
### Security
- Export strutture solo admin; export eventi limitato a visibilità utente.

## [0.13.2] - 2025-10-27
### Changed
- Init Postgres: rimosso `CREATE DATABASE` dagli script `.sql`; affidamento a `POSTGRES_DB` e guardia condizionale in `10-init.sh`.
### Security
- Nessuna.

## [0.13.1] - 2025-10-27
### Changed
- Rimosso asset binario del template dal repository; template generati a runtime via API.
- Endpoint import ora accetta anche CSV oltre a XLSX; documentazione aggiornata.
### Security
- Stesse restrizioni di accesso e limiti upload; audit invariato.

## [0.13.0] - 2025-10-27
### Added
- Endpoint `POST /import/structures` con `dry_run` per anteprima e upsert per `slug`.
- Validazioni schema fisso e limiti upload (5 MB, 2000 righe).
- Frontend `/import-export` con flusso upload → anteprima → conferma.
- Template `structures_import_template.xlsx` pubblico.
### Security
- Accesso riservato admin; audit log dell’operazione.

## [0.12.1] - 2025-10-27
### Fixed
* `docker-compose.yml`: rimossa chiave `version`, healthcheck DB aggiornato, variabili ambiente allineate e init SQL montato.
* Backup image: normalizzati EOL degli script, corretti permessi di esecuzione e impostato entrypoint di base.
* Backend: parser robusto per `CORS_ALLOWED_ORIGINS` con fallback coerente.
* Allineata `DATABASE_URL` e creazione database `scout`.

## [0.12.0] - 2025-10-27
### Added
- Tabella `contacts` con API CRUD e inclusione nei dettagli struttura.
- Estensione candidature con `contact_id` e UI per selezione contatto.
- Azioni rapide: link `mailto:` precompilato e `tel:` da candidature.
- Frontend: tab **Contatti** in pagina struttura con create/edit/delete e gestione “primary”.

### Changed
- `docs/API.md` e README aggiornati con flusso contatti.

### Security
- Validazione formati email/phone; nessun dato sensibile nei log.

## [0.11.0] - 2025-10-27
### Added
- Endpoint SSE `GET /events/{id}/live` per aggiornamenti in tempo reale di candidature, task e summary.
- Pub/Sub in-memory e hook su mutazioni eventi/candidature/task.
- Frontend: `useEventLive` con fallback a polling e indicatori di stato.
- Documentazione `REALTIME.md`.

### Security
- Autorizzazione `event_member` sull’SSE; nota operativa su token in query e masking dei log.

## [0.10.0] - 2025-10-27
### Added
- FE: code-splitting, prefetch TanStack Query, immagini lazy.
- A11y: skip-link, focus management modali, lint `jsx-a11y`, test axe.
- i18n scaffolding con `i18next` e locale `it`; estrazione stringhe pagine principali.
### Changed
- Budget bundle e step CI di analisi.
### Security
- Nessuna.

## [0.9.0] - 2025-10-27
### Added
- Cache HTTP con ETag/304 e header `Cache-Control` su endpoint pubblici.
- GZip lato API.
- Indici DB per ricerche comuni; `selectinload` sul dettaglio struttura.
### Changed
- `docs/PERF.md` ed `.env.example` aggiornati.
### Security
- Nessun dato sensibile in ETag.

## [0.8.0] - 2025-10-27
### Added
- Logging strutturato JSON con request-id e middleware correlato.
- Endpoint `GET /health/live` e `GET /health/ready` più healthcheck Docker.
- Endpoint `/metrics` compatibile Prometheus con metriche HTTP e pool DB.
- Integrazione Sentry opzionale via `SENTRY_DSN` e `SENTRY_TRACES_SAMPLE_RATE`.
- Job di backup `pg_dump` giornaliero con retention e guida al restore.

### Changed
- Documentazione README e `docs/OPS.md`; aggiornati `.env.example` e `docker-compose.yml`.

### Security
- Backup cifrabili lato bucket; sanitizzazione variabili nei log (no secret).

## [0.7.0] - 2025-10-27
### Added
- Ruoli e permessi con membership evento; tabelle `event_members`, `audit_log`, `password_reset_tokens` (migrazione `20240320_0007_roles_audit`).
- Endpoint membership eventi; reset password; assegnazioni tramite `assigned_user_id`.
- Rate limiting su endpoint auth; audit log su azioni strutture/eventi/candidature/quote.
- Frontend: pagine reset password; UI “Team” e selettori assegnatario.

### Changed
- Enforced access control per structures/events/quotes.
- Documentazione `docs/API.md`, `SECURITY.md`, README.

### Security
- Token reset monouso; audit trail; limiti richieste su auth.

## [0.6.0] - 2025-10-27
### Added
- Autenticazione core: JWT access + refresh HttpOnly con rotazione; `/auth/login`, `/auth/refresh`, `/auth/logout`, `/me`; registrazione opzionale.
- Migrazione `20240320_0006_auth_core` con tabelle `users` e `refresh_tokens`.
- Frontend: gestione sessione, interceptor 401→refresh, guard su rotte protette, pagina `/login`.

### Changed
- README e `docs/API.md` per flusso auth core.

### Security
- Argon2 hashing; cookie HttpOnly per refresh; CORS con credenziali.

[0.12.1]: https://github.com/<org>/<repo>/compare/0.12.0...0.12.1
[0.12.0]: https://github.com/<org>/<repo>/compare/0.11.0...0.12.0
[0.13.0]: https://github.com/<org>/<repo>/compare/0.12.0...0.13.0
[0.11.0]: https://github.com/<org>/<repo>/compare/0.10.0...0.11.0
[0.10.0]: https://github.com/<org>/<repo>/compare/0.9.0...0.10.0
[0.9.0]: https://github.com/<org>/<repo>/compare/0.8.0...0.9.0
[0.8.0]: https://github.com/<org>/<repo>/compare/0.7.0...0.8.0
[0.7.0]: https://github.com/<org>/<repo>/compare/0.6.0...0.7.0
[0.6.0]: https://github.com/<org>/<repo>/compare/0.5.0...0.6.0

## [0.5.0] - 2025-10-26
### Added
- Tabella `quotes` con migrazione `20240320_0005_quotes`.
- Servizio calcolo preventivi con breakdown voci e scenari `best/realistic/worst`.
- API: `POST /quotes/calc`, `POST /events/{id}/quotes`, `GET /events/{id}/quotes`, `GET /quotes/{id}`, `GET /quotes/{id}/export?format=xlsx|html`.
- Frontend: tab **Preventivi** in pagina evento, confronto versioni, export XLSX e HTML stampabile.
- Config `SCENARIO_MARGIN_BEST`, `SCENARIO_MARGIN_WORST`.

### Changed
- Documentazione `docs/API.md` e README con definizioni giorni/notti e flusso preventivi.

### Security
- N/A

[0.5.0]: https://github.com/<org>/<repo>/compare/0.4.0...0.5.0

## [0.4.0] - 2025-10-26
### Added
- Tabelle `events`, `event_structure_candidate`, `event_contact_task` con migrazione `20240320_0004_events_contacts`.
- API Eventi: `POST/GET/PATCH /events`, `GET /events/{id}?include=candidates,tasks`, `GET /events/{id}/summary`.
- API Candidature: `POST /events/{id}/candidates`, `PATCH /events/{id}/candidates/{cid}` con blocco su conflitti.
- API Suggerimenti: `GET /events/{id}/suggest`.
- Frontend: pagina `/events`, wizard “Nuovo evento”, pagina evento con tab **Candidature** e **Attività**.
- Polling 15s per summary e candidature.

### Changed
- Seed esteso con eventi e candidature.
- Documentazione README e `docs/API.md`.

### Security
- N/A

[0.4.0]: https://github.com/<org>/<repo>/compare/0.3.0...0.4.0

## [0.3.0] - 2025-10-26
### Added
- Tabelle `structure_season_availability` e `structure_cost_option` con migrazione `20240320_0003_structure_availability_costs`.
- Estensione `GET /api/v1/structures/search` con filtri `season`, `unit`, `cost_band` e campi `estimated_cost`, `cost_band`.
- `GET /api/v1/structures/by-slug/{slug}?include=details` per disponibilità e costi.
- Seed: `structures_availability_seed.csv`, `structures_costs_seed.csv`; esteso `scripts/seed.py`.
- Frontend: nuovi filtri, badge unità/stagione, tab “Disponibilità” e “Costi”.

### Changed
- Config banda costi via env `COST_BAND_*`.
- Documentazione README e `docs/API.md`.

### Security
- N/A

[0.3.0]: https://github.com/<org>/<repo>/compare/0.2.0...0.3.0

## [0.2.0] - 2025-10-26
### Added
- Endpoint `GET /api/v1/structures/search` con filtri `q`, `province`, `type`, `max_km`, paginazione e ordinamenti.
- Endpoint `GET /api/v1/structures/by-slug/{slug}`.
- Migrazione `20240320_0002_structure_geo` con `address`, `latitude`, `longitude` e indici.
- Script `scripts/seed.py` e dataset `data/structures_seed.csv`.
- Frontend: barra filtri e paginazione in `/structures`.
- Frontend: pagina dettaglio `/structures/:slug`.

### Changed
- Validazioni `Structure` e vincolo slug unico.
- Documentazione README e `docs/API.md`.

### Security
- N/A

[0.2.0]: https://github.com/<org>/<repo>/compare/0.1.0...0.2.0

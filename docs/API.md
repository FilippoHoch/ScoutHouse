# Authentication API

The authentication flow issues short-lived JWT access tokens alongside rotating
HttpOnly refresh cookies. Access tokens are sent via the `Authorization: Bearer`
header, while refresh cookies stay in the browser and are rotated on every
refresh call. Passwords are stored using Argon2.

## POST `/api/v1/auth/login`

Authenticate with an email and password. Successful responses return the user
profile and an access token while also setting a `refresh_token` cookie.

```bash
curl -i -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"secret"}'
```

## POST `/api/v1/auth/refresh`

Rotate the refresh cookie and obtain a new access token. Clients should call
this when a request fails with `401` or during bootstrapping to resume a
session.

```bash
curl -i -X POST http://localhost:8000/api/v1/auth/refresh \
  --cookie "refresh_token=..."
```

## POST `/api/v1/auth/logout`

Revoke the current refresh token and clear the cookie. Access tokens remain
valid until they expire.

## GET `/api/v1/auth/me`

Return the profile of the authenticated user. Requires a valid access token in
the `Authorization` header.

## POST `/api/v1/auth/register`

Create a new user when `ALLOW_REGISTRATION=true` in configuration. The endpoint
mirrors the login response: the user is created, issued an access token, and a
refresh cookie is set.

### Rate limits

Authentication endpoints are protected with per-IP quotas:

- `POST /api/v1/auth/login`: 5 requests per minute.
- `POST /api/v1/auth/refresh`: 30 requests per minute.
- `POST /api/v1/auth/forgot-password`: 5 requests per hour.

Clients should surface 429 responses to users or implement exponential backoff.

## POST `/api/v1/auth/forgot-password`

Trigger the password reset flow. The endpoint always returns `202 Accepted`
and, in development environments, logs the reset URL to the backend console.

```bash
curl -i -X POST http://localhost:8000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com"}'
```

## POST `/api/v1/auth/reset-password`

Complete the reset using the token produced by the previous step. Tokens are
single-use and expire after the interval configured via
`PASSWORD_RESET_TTL_MINUTES` (default 60 minutes).

```bash
curl -i -X POST http://localhost:8000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"...","password":"NewSecurePassword!"}'
```

# Structures API

## GET `/api/v1/structures/search`

Search the catalog using text, province, type, and distance filters. Results are
paginated and can be ordered by name, creation date, or distance from the base
coordinates configured via `DEFAULT_BASE_LAT`/`DEFAULT_BASE_LON`.

### Query parameters

| Name | Type | Description |
| --- | --- | --- |
| `q` | string | Optional case-insensitive match on name or address. |
| `province` | string | Optional 2-letter province code (e.g. `BS`). |
| `type` | string | Optional structure type: `house`, `land`, or `mixed`. |
| `max_km` | number | Optional maximum distance (km). Records without coordinates are excluded when provided. |
| `season` | string | Optional seasonal availability filter (`winter`, `spring`, `summer`, `autumn`). |
| `unit` | string | Optional scouting unit filter (`LC`, `EG`, `RS`, `ALL`). |
| `cost_band` | string | Optional estimated cost band: `cheap`, `medium`, `expensive`. |
| `access` | string | Filtra per accessibilità: combina `car`, `coach` o `pt` separati da `|`. |
| `fire` | string | Policy fuochi: `allowed`, `with_permit`, `forbidden`. |
| `min_land_area` | number | Superficie minima dell'area esterna (in m²). |
| `hot_water` | boolean | Richiede strutture con acqua calda disponibile (`1`, `true`, `yes`). |
| `open_in_season` | string | Filtra strutture con almeno un periodo stagionale aperto (`spring`, `summer`, `autumn`, `winter`). |
| `open_on_date` | string (YYYY-MM-DD) | Filtra strutture aperte in un intervallo che include la data indicata. |
| `page` | integer | Page number (default `1`). |
| `page_size` | integer | Page size (default `20`, max `100`). |
| `sort` | string | Sort field: `distance`, `name`, or `created_at`. |
| `order` | string | Sort order: `asc` or `desc`. |

### Response

```json
{
  "items": [
    {
      "id": 1,
      "slug": "casa-alpina",
      "name": "Casa Alpina",
      "province": "BS",
      "type": "house",
      "address": "Via Panoramica 12, Ponte di Legno",
      "latitude": 46.2542,
      "longitude": 10.5071,
      "distance_km": 23.4,
      "estimated_cost": 11.5,
      "cost_band": "medium",
      "seasons": ["summer"],
      "units": ["LC", "EG", "RS"]
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 57,
  "sort": "distance",
  "order": "asc",
  "base_coords": {"lat": 45.5966, "lon": 10.1655}
}
```

Example request:

```bash
curl "http://localhost:8000/api/v1/structures/search?q=alpina&province=BS&max_km=40&sort=distance"
```

## GET `/api/v1/structures/by-slug/{slug}`

Fetch the full record for a structure identified by its slug. Returns a 404 if
no structure is found. Use `include=details` to expand the payload with
seasonal availability, cost options, and the estimated cost band. Supplying
`include=contacts` (or `include=details`, which implies contacts) appends the
structure's contacts ordered with the primary contact first.

```bash
curl "http://localhost:8000/api/v1/structures/by-slug/casa-alpina?include=details"
```

The detailed payload contains:

- `availabilities`: array of objects with `season`, `units`, `capacity_min`,
  `capacity_max`
- `cost_options`: array of pricing models with `amount`, `currency`, optional
  `deposit`, `city_tax_per_night`, and `utilities_flat`
- `estimated_cost` and `cost_band`: the average daily rate calculated from the
  configured cost options
- Logistic metadata such as `indoor_beds`, `indoor_bathrooms`,
  `indoor_showers`, `indoor_activity_rooms`, `has_kitchen`, `hot_water`,
  `land_area_m2`, `fire_policy`, accessibility flags,
  `pit_latrine_allowed`, `notes_logistics`, `website_urls`, and free-form `notes`
- `open_periods`: elenco dei periodi stagionali o degli intervalli di date in cui la struttura è disponibile
- `contacts`: when requested, each contact with `name`, `role`, `email`, `phone`,
  `preferred_channel`, `is_primary`, and timestamps

### Structure contacts

Contacts can be managed through authenticated endpoints. Email addresses are
validated and phone numbers may include digits, spaces, and a leading `+`.

#### GET `/api/v1/structures/{id}/contacts`

List all contacts for a structure, returning the primary contact first.

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/v1/structures/42/contacts"
```

#### POST `/api/v1/structures/{id}/contacts`

Create a new contact. Setting `is_primary=true` automatically demotes any
previous primary contact.

```bash
curl -X POST http://localhost:8000/api/v1/structures/42/contacts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
        "name": "Lucia Bianchi",
        "role": "Amministrazione",
        "email": "lucia@example.com",
        "phone": "+39 02 1234567",
        "preferred_channel": "phone",
        "is_primary": true
      }'
```

#### PATCH `/api/v1/structures/{id}/contacts/{contact_id}`

Update a contact in place. Fields omitted from the payload are left unchanged.
Setting `is_primary=true` reassigns the primary flag to the selected contact.

#### DELETE `/api/v1/structures/{id}/contacts/{contact_id}`

Remove a contact permanently.

## GET `/api/v1/templates/structures.xlsx`

Generate and download the Excel template for structure imports. The workbook is
created at request time, includes the canonical headers, and two sample rows.

## GET `/api/v1/templates/structures.csv`

Generate and download the CSV template for structure imports. The response is
UTF-8 encoded, uses `,` as separator, and mirrors the XLSX headers and sample
rows.

## GET `/api/v1/templates/structure-open-periods.xlsx`

Generate il template XLSX per l'import dei periodi di apertura. Il foglio
contiene le intestazioni canonicali (`structure_slug`, `kind`, `season`,
`date_start`, `date_end`, `notes`) e due righe di esempio per `season` e `range`.

## GET `/api/v1/templates/structure-open-periods.csv`

Controparte CSV del template periodi. Il file è UTF-8, comma separated e riporta
gli stessi esempi del foglio XLSX.

Tutti i template vengono generati on-the-fly, quindi non è necessario versionare
file binari nel repository.

## POST `/api/v1/import/structures`

Bulk import structures from a CSV or XLSX file. The endpoint accepts
`multipart/form-data` uploads under the `file` field and is limited to admin
users. Supported query parameters:

- `dry_run` (default `true`): when `true` the API validates the file and returns
  a summary without persisting changes.

Accepted MIME types are `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`application/csv`, and `text/csv`, up to 5 MB in size and 2 000 data rows. CSV
files must be UTF-8 encoded, comma-separated, and use `.` for decimals. The
file must contain the following headers as the first row: `name`, `slug`,
`province`, `address`, `latitude`, `longitude`, `type`, `indoor_beds`,
`indoor_bathrooms`, `indoor_showers`, `indoor_activity_rooms`, `has_kitchen`,
`hot_water`, `land_area_m2`, `shelter_on_field`,
`water_sources`, `electricity_available`, `fire_policy`,
`access_by_car`, `access_by_coach`, `access_by_public_transport`,
`coach_turning_area`, `nearest_bus_stop`,
`weekend_only`, `has_field_poles`, `pit_latrine_allowed`, `website_urls`, `notes_logistics`, `notes`.

```bash
curl -X POST "http://localhost:8000/api/v1/import/structures?dry_run=true" \
  -H "Authorization: Bearer <token>" \
  -F "file=@./structures_import_template.csv;type=text/csv"
```

Dry runs return validation errors and a preview of the upsert action (create or
update) that would be executed for each valid slug:

```json
{
  "valid_rows": 2,
  "invalid_rows": 0,
  "source_format": "csv",
  "errors": [],
  "preview": [
    { "slug": "casa-alpina", "action": "update" },
    { "slug": "baite-unite", "action": "create" }
  ]
}
```

When `dry_run=false` and the file contains no validation errors the endpoint
performs an upsert based on the slug and returns how many rows were created or
updated. Blank rows are reported as `skipped`:

```json
{
  "created": 5,
  "updated": 12,
  "skipped": 0,
  "errors": [],
  "source_format": "csv"
}
```

Validation rules:

- `slug` must be present and unique within the file.
- `province` must be a two-letter uppercase code.
- `type` must be one of `house`, `land`, `mixed`.
- `latitude`/`longitude`, when provided, must fall within the [-90, 90] and
  [-180, 180] ranges respectively.
- `indoor_beds`, `indoor_bathrooms`, `indoor_showers`, and
  `indoor_activity_rooms` must be integers greater than or equal to zero when
  provided.
- `has_kitchen` accepts boolean-like values (`true`, `false`, `1`, `0`, `yes`,
  `no`).
- `website_urls`, when present, must contain valid HTTP or HTTPS URLs.

Validation errors include the `source_format` attribute so clients can surface
whether the payload originated from a CSV or XLSX file.

The backend logs an `import_structures` audit entry with the counts returned in
the response.

## POST `/api/v1/import/structure-open-periods`

Importa periodi stagionali o intervalli di date per più strutture partendo da un
file CSV/XLSX con le intestazioni `structure_slug`, `kind`, `season`,
`date_start`, `date_end`, `notes`. Il campo `kind` accetta `season` oppure
`range` e determina la validazione degli altri campi (stagione obbligatoria per
`season`, date obbligatorie per `range`).

Durante il `dry_run` la risposta include una preview con l'azione prevista per
ciascuna riga:

- `create` per periodi nuovi che verranno salvati alla conferma.
- `skip` per righe duplicate rispetto ai periodi già presenti in archivio.
- `missing_structure` quando lo `slug` indicato non corrisponde a nessuna
  struttura esistente (in questo caso l'import completo viene bloccato).

Quando `dry_run=false` l'import crea solo i periodi non duplicati. I duplicati e
le righe vuote sono conteggiati in `skipped`. Eventuali errori di validazione
impediscono il commit e vengono restituiti con l'indicazione della sorgente
(`csv` o `xlsx`). L'operazione è tracciata con l'audit
`import_structure_open_periods`.

## POST `/api/v1/structures/`

Create a new structure. Payload must include `name`, `slug`, `type` and may
optionally include `province`, `address`, geographic coordinates, logistic
metadata such as `indoor_beds`, `indoor_bathrooms`, `indoor_showers`,
`indoor_activity_rooms`, `has_kitchen`, `hot_water`, outdoor accessibility flags
(`access_by_car`, `access_by_coach`, `access_by_public_transport`),
`pit_latrine_allowed`, `website_urls`, `notes_logistics`, free-form `notes`, and
an array of `open_periods`. La creazione è riservata agli utenti amministratori
salvo esplicita abilitazione del flag `ALLOW_NON_ADMIN_STRUCTURE_EDIT=true`, che
estende il permesso anche agli altri utenti autenticati.

Validation rules:

- `slug` must be lowercase alphanumeric with hyphens and unique.
- `province`, when provided, must be a two-letter code.
- Latitude and longitude must fall within valid coordinate ranges.
- `type` must be one of `house`, `land`, `mixed`.
- `indoor_beds`, `indoor_bathrooms`, `indoor_showers`, and
  `indoor_activity_rooms`, when provided, must be integers greater than or equal
  to zero.
- `has_kitchen`, `hot_water`, `shelter_on_field`, `electricity_available`,
  accessibility flags and `pit_latrine_allowed` accept truthy values (`true`,
  `false`, `1`, `0`) and default to `false`.
- `open_periods` may include rows of `kind="season"` (richiede `season`) oppure
  `kind="range"` (richiede `date_start` e `date_end`).
- `website_urls`, when provided, must only contain valid HTTP or HTTPS URLs.

```bash
curl -X POST http://localhost:8000/api/v1/structures/ \
  -H "Content-Type: application/json" \
  -d '{
        "name": "Centro Scout del Garda",
        "slug": "centro-scout-del-garda",
        "province": "VR",
        "type": "mixed",
        "address": "Via dei Colli 22, Bardolino",
        "latitude": 45.5603,
        "longitude": 10.7218,
        "indoor_beds": 80,
        "indoor_bathrooms": 8,
        "indoor_showers": 10,
        "indoor_activity_rooms": 5,
        "has_kitchen": true,
        "hot_water": true,
        "access_by_car": true,
        "access_by_public_transport": true,
        "pit_latrine_allowed": false,
        "open_periods": [
          { "kind": "season", "season": "summer", "notes": "Disponibile da giugno a settembre" },
          { "kind": "range", "date_start": "2025-12-27", "date_end": "2026-01-06" }
        ],
        "website_urls": ["https://example.org/centro-garda"]
      }'
```

## Availability and cost management

La gestione di disponibilità stagionali e opzioni di costo richiede un utente
amministratore, a meno che l'istanza non esponga `ALLOW_NON_ADMIN_STRUCTURE_EDIT=true`
per consentire l'editing a tutti gli utenti autenticati. Le richieste devono
includere un bearer token ottenuto tramite il normale flusso di login.

### POST `/api/v1/structures/{id}/availabilities`

Create a seasonal availability row. Seasons must be one of `winter`, `spring`,
`summer`, `autumn`; `units` must contain at least one of `LC`, `EG`, `RS`,
`ALL`.

```bash
curl -X POST http://localhost:8000/api/v1/structures/1/availabilities \
  -H "Content-Type: application/json" \
  -d '{
        "season": "summer",
        "units": ["LC", "EG"],
        "capacity_min": 18,
        "capacity_max": 72
      }'
```

`PUT /api/v1/structures/{id}/availabilities` accepts an array payload and
replaces the entire set in one call.

### POST `/api/v1/structures/{id}/cost-options`

Create a cost option for the structure. Supported models: `per_person_day`,
`per_person_night`, `forfait`. `amount` must be greater than zero.

```bash
curl -X POST http://localhost:8000/api/v1/structures/1/cost-options \
  -H "Content-Type: application/json" \
  -d '{
        "model": "per_person_day",
        "amount": 12.50,
        "currency": "EUR",
        "city_tax_per_night": 1.50,
        "utilities_flat": 10.00
      }'
```

`PUT /api/v1/structures/{id}/cost-options` replaces all existing cost options
with the provided array, making it easy to keep CSV imports idempotent.

## GET `/api/v1/export/structures`

Stream the structures catalog as `csv`, `xlsx`, or `json`. The endpoint is
restricted to administrators and reuses the filters available in the search
endpoint.

| Name | Type | Description |
| --- | --- | --- |
| `format` | string | Required output format: `csv`, `xlsx`, or `json`. |
| `filters` | string | Optional JSON payload with keys `q`, `province`, `type`, `season`, `unit`, `cost_band`, `max_km`, `fire`, `min_land_area`, `open_in_season`, `open_on_date`, `access`, and `hot_water`. |

The response uses `Transfer-Encoding: chunked` and caps exports at 10 000 rows or
10 seconds of processing time. Example:

```bash
curl "http://localhost:8000/api/v1/export/structures?format=csv&filters=%7B%22province%22%3A%20%22MI%22%2C%20%22type%22%3A%20%22house%22%7D" \
  -H "Authorization: Bearer $TOKEN" \
  -o structures.zip
```

Per il formato CSV la risposta è un archivio ZIP contenente `structures.csv` e
`structure_open_periods.csv`. L'export XLSX genera un secondo foglio denominato
`structure_open_periods`, mentre il JSON include l'array `open_periods` annidato
in ogni struttura.

# Events API

### Access control

- Listing events and fetching details require membership: only users assigned to
  the event can access it.
- Creating an event requires authentication; the creator becomes the owner.
- Updating an event, candidate, or task requires a collaborator or owner role.
- Creating quotes requires at least collaborator permissions; viewing quotes
  requires membership.

Event roles are `owner`, `collab`, and `viewer`. Owners can manage memberships.

## GET `/api/v1/events`

List events with pagination, optional text search, and status filtering. Query
parameters:

| Name | Type | Description |
| --- | --- | --- |
| `q` | string | Optional case-insensitive match on title or slug. |
| `status` | string | Optional status filter: `draft`, `planning`, `booked`, `archived`. |
| `page` | integer | Page number (default `1`). |
| `page_size` | integer | Page size (default `20`). |

Response:

```json
{
  "items": [
    {
      "id": 1,
      "slug": "camp-invernale",
      "title": "Camp Invernale",
      "branch": "LC",
      "start_date": "2025-02-10",
      "end_date": "2025-02-13",
      "participants": { "lc": 24, "eg": 0, "rs": 0, "leaders": 6 },
      "budget_total": 4200.0,
      "status": "planning",
      "notes": null,
      "created_at": "2024-10-01T09:00:00Z",
      "updated_at": "2024-10-05T18:22:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

Example:

```bash
curl "http://localhost:8000/api/v1/events?page=1&page_size=10&status=planning"
```

## GET `/api/v1/export/events`

Download the events visible to the authenticated user (based on membership)
as `csv`, `xlsx`, or `json`. Query parameters:

| Name | Type | Description |
| --- | --- | --- |
| `format` | string | Required format: `csv`, `xlsx`, or `json`. |
| `from` | date | Optional ISO date to include events starting on/after the value. |
| `to` | date | Optional ISO date to include events ending on/before the value. |

Exports stream in chunks and are limited to 10 000 rows and 10 seconds per
request. Example:

```bash
curl "http://localhost:8000/api/v1/export/events?format=xlsx&from=2025-01-01&to=2025-03-31" \
  -H "Authorization: Bearer $TOKEN" \
  -o events.xlsx
```

## POST `/api/v1/events`

Create a new event. The slug is generated automatically from the title. Payload:

```json
{
  "title": "Route Estiva",
  "branch": "RS",
  "start_date": "2025-07-12",
  "end_date": "2025-07-20",
  "participants": { "rs": 18, "leaders": 4 },
  "budget_total": 6500,
  "status": "draft",
  "notes": "Allestire campi base a turni"
}
```

Validation rules:

- `start_date` must be on or before `end_date`.
- `participants` counts must be non-negative. Missing keys default to zero.
- `status` must be one of the allowed values.

## GET `/api/v1/events/{id}`

Fetch a single event. Use `?include=candidates,tasks` to expand the response with
candidates (including linked structure contacts) and contact tasks.

```bash
curl "http://localhost:8000/api/v1/events/1?include=candidates,tasks"
```

## GET `/api/v1/events/{id}/ical`

Download a calendar entry for the event. The response returns an `.ics` payload
with all-day start and end dates, summary, branch, status, and total
participants. The endpoint enforces the same membership checks as the JSON
detail API.

### Event membership management

Memberships link users to events with a specific role.

- `GET /api/v1/events/{id}/members`: list members with their role and profile.
- `POST /api/v1/events/{id}/members`: owners can invite a user by email and
  assign a role (`viewer`, `collab`, or `owner`).
- `PATCH /api/v1/events/{id}/members/{member_id}`: owners can change the role of
  an existing member, as long as at least one owner remains.
- `DELETE /api/v1/events/{id}/members/{member_id}`: owners can remove a member,
  again ensuring at least one owner stays assigned.

## PATCH `/api/v1/events/{id}`

Update an event. Send only the fields that should change. Date updates are
validated to avoid inverted ranges.

## POST `/api/v1/events/{id}/candidates`

Add a structure to the event's candidate list. The payload accepts either a
`structure_id` or `structure_slug` plus optional `assigned_user`,
`assigned_user_id`, and `contact_id` fields. When `assigned_user_id` is provided
the user must already be a member of the event; responses expose both
`assigned_user_id` and `assigned_user_name`. When `contact_id` is provided it
must reference a contact belonging to the structure.

```bash
curl -X POST http://localhost:8000/api/v1/events/1/candidates \
  -H "Content-Type: application/json" \
  -d '{ "structure_slug": "casa-inverno", "assigned_user": "Chiara" }'
```

## PATCH `/api/v1/events/{id}/candidates/{candidate_id}`

Update candidate status, assigned user, or associated structure contact. When
setting `status=confirmed`, the API verifies that no other confirmed event
overlaps for the same structure; a 409 is returned when a conflict is detected.

## GET `/api/v1/events/{id}/summary`

Returns the number of candidates per status and a `has_conflicts` boolean flag
indicating whether any confirmed candidate collides with other events.

```json
{
  "status_counts": {
    "to_contact": 2,
    "contacting": 1,
    "confirmed": 1,
    "available": 0,
    "unavailable": 1,
    "followup": 0,
    "option": 0
  },
  "has_conflicts": true
}
```

## GET `/api/v1/events/{id}/suggest`

Suggest structures that match the event's branch and season. Suggestions include
basic metadata and the distance from the configured base coordinates.

```bash
curl "http://localhost:8000/api/v1/events/1/suggest"
```

## Tasks endpoints

- `POST /api/v1/events/{id}/tasks` creates a contact task for the event.
- `PATCH /api/v1/events/{id}/tasks/{task_id}` updates status, outcome, assigned
  user, or notes.

Both endpoints return the updated task with the latest `updated_at` timestamp.

## Quotes API

The quotes endpoints provide deterministic budgeting for an event/structure
pair. By default the system computes the number of nights as the difference in
calendar days between `end_date` and `start_date`, and the number of days as
`nights + 1`.

### POST `/api/v1/quotes/calc`

Temporary calculation for a specific event and structure. Accepts optional
participant, day, or night overrides.

**Request**

```json
{
  "event_id": 12,
  "structure_id": 5,
  "overrides": {
    "participants": {"lc": 18, "leaders": 4},
    "nights": 3
  }
}
```

**Response**

```json
{
  "currency": "EUR",
  "totals": {
    "subtotal": 1520.0,
    "utilities": 60.0,
    "city_tax": 135.0,
    "deposit": 300.0,
    "total": 1715.0
  },
  "breakdown": [
    {
      "option_id": 23,
      "type": "per_person_day",
      "description": "Costo per persona/giorno",
      "currency": "EUR",
      "unit_amount": 20.0,
      "quantity": 180,
      "metadata": {"people": 20, "days": 9},
      "total": 3600.0
    },
    {
      "option_id": 23,
      "type": "deposit",
      "description": "Caparra",
      "currency": "EUR",
      "unit_amount": 300.0,
      "quantity": 1,
      "metadata": {},
      "total": 300.0
    }
  ],
  "scenarios": {
    "best": 1629.25,
    "realistic": 1715.0,
    "worst": 1886.5
  },
  "inputs": {
    "event_id": 12,
    "structure_id": 5,
    "participants": {"lc": 18, "eg": 0, "rs": 0, "leaders": 4},
    "people_total": 22,
    "taxable_people": 20,
    "days": 4,
    "nights": 3,
    "cost_band": "medium",
    "rules": {
      "city_tax_exempt_units": ["leaders"],
      "scenario_margins": {"best": 0.05, "worst": 0.1}
    },
    "overrides": {"participants": {"lc": 18, "leaders": 4}, "nights": 3}
  }
}
```

### POST `/api/v1/events/{event_id}/quotes`

Persists a quote snapshot for an event. The payload matches the calculation
request minus the `event_id` field and includes the scenario to store.

```json
{
  "structure_id": 5,
  "scenario": "realistic",
  "overrides": {"nights": 3}
}
```

The response mirrors the calculation output and adds identifiers and timestamps.

### GET `/api/v1/events/{event_id}/quotes`

Lists saved quotes for the event (newest first).

```json
[
  {
    "id": 42,
    "event_id": 12,
    "structure_id": 5,
    "structure_name": "Casa Alpina",
    "scenario": "realistic",
    "currency": "EUR",
    "total": 1715.0,
    "created_at": "2025-03-02T14:12:00Z"
  }
]
```

### GET `/api/v1/quotes/{quote_id}`

Fetches the full details (totals, breakdown, inputs snapshot and recomputed
scenarios) for a saved quote.

### GET `/api/v1/quotes/{quote_id}/export`

Export a stored quote. Supported formats:

- `format=xlsx` – returns an Excel workbook (`Content-Type:
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
- `format=html` – returns a print-ready HTML page suitable for browser PDF
  export.

Use `format=html` together with the browser “Print to PDF” feature to obtain a
PDF copy.

# Mail API

Administrative endpoints for rendering email templates and triggering test
deliveries. All routes require an authenticated admin user.

## GET `/api/v1/mail/preview`

Render one of the built-in templates with sample data. Only the `sample=true`
mode is supported at the moment.

### Query parameters

| Name | Description |
| --- | --- |
| `template` | Template identifier: `reset_password`, `task_assigned`, `candidate_status_changed`. |
| `sample` | Must be `true` to request the default preview payload. |

```bash
curl "http://localhost:8000/api/v1/mail/preview?template=reset_password&sample=true" \
  -H "Authorization: Bearer <access-token>"
```

### Response

```json
{
  "template": "reset_password",
  "subject": "Reset della password ScoutHouse",
  "html": "<p>…</p>",
  "text": "..."
}
```

## POST `/api/v1/mail/test`

Send a test email using the active provider. In development, the console driver
logs the payload instead of performing any external call. When
`DEV_MAIL_BLOCK_EXTERNAL=true` the response is marked with `"blocked": true`.

### Body

```json
{
  "to": "admin@example.com",
  "template": "task_assigned",
  "sample_data": {"event_title": "Evento Demo"}
}
```

```bash
curl -X POST http://localhost:8000/api/v1/mail/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{"to":"admin@example.com","template":"task_assigned"}'
```

### Response

```json
{
  "provider": "console",
  "blocked": false,
  "subject": "Nuovo task assegnato per Evento Demo",
  "html": "<p>…</p>",
  "text": "..."
}
```

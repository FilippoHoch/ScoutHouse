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
seasonal availability, cost options, and the estimated cost band.

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

## POST `/api/v1/structures/`

Create a new structure. Payload must include `name`, `slug`, `type`, and (optionally)
`province`, `address`, `latitude`, and `longitude`.

Validation rules:

- `slug` must be lowercase alphanumeric with hyphens and unique.
- `province`, when provided, must be a two-letter code.
- Latitude and longitude must fall within valid coordinate ranges.
- `type` must be one of `house`, `land`, `mixed`.

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
        "longitude": 10.7218
      }'
```

## Availability and cost management

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
candidates and contact tasks.

```bash
curl "http://localhost:8000/api/v1/events/1?include=candidates,tasks"
```

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
`structure_id` or `structure_slug` plus optional `assigned_user` and
`assigned_user_id` fields. When `assigned_user_id` is provided the user must
already be a member of the event; responses expose both `assigned_user_id` and
`assigned_user_name`.

```bash
curl -X POST http://localhost:8000/api/v1/events/1/candidates \
  -H "Content-Type: application/json" \
  -d '{ "structure_slug": "casa-inverno", "assigned_user": "Chiara" }'
```

## PATCH `/api/v1/events/{id}/candidates/{candidate_id}`

Update candidate status or assignment. When setting `status=confirmed`, the API
verifies that no other confirmed event overlaps for the same structure; a 409 is
returned when a conflict is detected.

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

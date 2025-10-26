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

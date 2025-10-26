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
      "distance_km": 23.4
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
no structure is found.

```bash
curl http://localhost:8000/api/v1/structures/by-slug/casa-alpina
```

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

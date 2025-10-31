# Data model – ScoutHouse

## `structures`

The `structures` table stores the core registry for huts, bases and campsites. Key fields include:

- `name`, `slug`, `province`, `address`, `latitude`, `longitude`, `type` (`house|land|mixed`).
- Indoor capacity metrics: `indoor_beds`, `indoor_bathrooms`, `indoor_showers`, `indoor_activity_rooms`.
- Utility flags: `has_kitchen`, `hot_water`, `electricity_available`, `shelter_on_field`, `has_field_poles`, `pit_latrine_allowed`.
- Outdoor logistics: `land_area_m2`, `water_sources`, `fire_policy`, `access_by_car`, `access_by_coach`, `access_by_public_transport`, `coach_turning_area`, `nearest_bus_stop`, `weekend_only`.
- Optional metadata: `notes_logistics`, public `website_url`, free-form `notes`.

`slug` is unique and used to reconcile imports as well as public URLs. Booleans default to `false`. Numeric fields accept `NULL` when information is unavailable.

## `structure_open_periods`

Open periods are stored in a dedicated table linked via `structure_id` with `ON DELETE CASCADE`. Each row has:

- `kind`: `season` or `range`.
- `season`: nullable enum (`winter`, `spring`, `summer`, `autumn`). Mandatory when `kind = 'season'`.
- `date_start`, `date_end`: nullable ISO dates. Mandatory (and inclusive) when `kind = 'range'`.
- `notes`: optional free text for exceptions or clarifications.

A uniqueness constraint prevents duplicates by combining `structure_id`, `kind`, `season`, `date_start` and `date_end`. This allows the importer to skip rows already present in the catalog.

## Relationships and eager loading

When fetching a structure with `include=details`, the API returns:

- `open_periods`: serialized from the table above, already sorted by season/date.
- `availabilities`: high-level seasonal capacity blocks used by event planners.
- `cost_options`: pricing models with currencies and deposit/tax metadata.

Consumers should rely on these expanded payloads to populate the new UI sections (period badges, filters, and detail lists) rather than querying tables directly.

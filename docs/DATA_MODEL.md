# Data model – ScoutHouse

## `structures`

The `structures` table stores the core registry for huts, bases and campsites. The catalog now captures richer attributes across governance, location, accessibility, logistics and pricing:

### Governance & provenance

- `fonte_dato` (text/URL), `data_ultima_verifica` (date) and `verificato_da` (text) track who provided the information and when it was last checked.
- `stato_operativita` enum (`attiva|chiusa|in_attesa`).

### Localizzazione

- `comune`, `cap`, `regione`, `frazione_localita` complement `address`, `province`, `latitude`, `longitude`.

### Accessibilità

- `accessible` enum (`no|parziale|si`) plus `accessibility_details` (free-form notes covering bagni, rampe, docce, ecc.).

### Target & regole d'uso

- `destinatari_ammessi` (set membership across `AGESCI|CNGEI|MASCI|oratori|famiglie`).
- `autogestione` enum (`si|no|parziale`).
- `policy_animali` and `quiet_hours` (e.g. "22:00–8:00").

### Vincoli ambientali

- `in_area_protetta` (bool), `ente_area_protetta`, `regole_area_protetta`.

### Spazi interni

- `indoor_beds`, `indoor_bathrooms`, `indoor_showers` remain, while `indoor_activity_rooms` becomes `indoor_rooms` (JSON array of `{tipo, capienza}`) with optional aggregate `indoor_activity_rooms_capacity_total` for backwards compatibility.
- `cappella` (bool) with `cappella_seats` (int).
- `kitchen_spec` (array of appliances/features, e.g. frigo, forno, lavastoviglie).
- `heating_type` (text).

### Spazi esterni

- `land_area_m2` stays but is complemented by `pitches_tende` (int), `field_slope` enum (`piano|leggera|forte`), `tap_on_field` and `water_at_field` (bool to distinguish water availability in the tent area), plus `fire_policy` and detailed `fire_rules` (required when `fire_policy = 'with_permit'`).
- `water_sources` retains the array of sources and now also carries the `water_at_field` flag to ease API consumption.

### Logistica avanzata

- Access: `access_by_car`, `access_by_coach` (bool) augmented by `bus_type_access` enum (`no|minibus|granturismo`), `coach_turning_area` (bool) and optional `turning_area_length_m`.
- Heavy vehicles: `access_by_heavy_vehicles` (bool).
- Distances: `distance_km_bus_stop`, `distance_km_hospital`, `distance_km_supermarket`.
- Parking: `parking_car_slots` (int) and `bus_parking` (bool).

### Sicurezza

- `certificazioni` (JSON blob detailing agibilità, antincendio/CPI, capienza_autorizzata, ecc.).
- `emergency_plan_url` (URL).

### Media

- `photos` (array of URLs) with validation requiring at least three images whenever the structure is not a pure `house` or exposes outdoor fields (see validations below).

### Disponibilità & stagionalità

- `blackout_dates` (array of `{date_start, date_end, note}`).
- `amenities_by_period` (JSON overrides for amenities, e.g. `{"winter": {"hot_water": false}}`).

### Costi & pagamenti

- `utilities_flat` (legacy) is complemented by `utilities_included` (bool) to explicitly flag whether utilities are covered in the base price, with warnings emitted if both are set and conflicting.
- `cleaning_fee`, `heating_surcharge`, `waste_disposal_fee` (numeric), `min_nights` (int).
- Deposits: `booking_deposit` (rename of `deposit`) and `damage_deposit` (numeric).
- `payment_methods` (set from `bonifico|contanti|carta|altro`).
- `price_per_resource` (array of `{risorsa: 'house'|'field'|'altro', prezzo, include_consumi}`) to distinguish pricing for casa vs prato and support modifiers.

### Contatti

- `booking_url` (URL), `whatsapp` (string), `contact_status` pipeline enum (`da_chiamare|mail_inviata|da_richiamare|non_risponde|non_disponibile|opzione|confermata`).

`slug` remains unique and stable and is used to reconcile imports as well as public URLs. A soft uniqueness check applies to the `(name, comune)` pair to warn on duplicates. Booleans default to `false`. Numeric fields accept `NULL` when information is unavailable.

## `structure_open_periods`

Open periods are stored in a dedicated table linked via `structure_id` with `ON DELETE CASCADE`. Each row has:

- `kind`: `season` or `range`.
- `season`: nullable enum (`winter`, `spring`, `summer`, `autumn`). Mandatory when `kind = 'season'`.
- `date_start`, `date_end`: nullable ISO dates. Mandatory (and inclusive) when `kind = 'range'`.
- `notes`: optional free text for exceptions or clarifications.
- `blackout` (bool, default `false`) to mark periods within a season when the structure is unavailable. These can coexist with standard availability ranges to express maintenance windows.

A uniqueness constraint prevents duplicates by combining `structure_id`, `kind`, `season`, `date_start` and `date_end`. This allows the importer to skip rows already present in the catalog.

`blackout_dates` stored directly on `structures` surface ad-hoc closures discovered after imports, while `structure_open_periods.blackout=true` keeps repeat seasonal shutdowns co-located with the canonical availability calendar.

When serializing, the API continues returning `open_periods` sorted by season/date and now includes blackout metadata for UI timelines.

## Relationships and eager loading

When fetching a structure with `include=details`, the API returns:

- `open_periods`: serialized from the table above, already sorted by season/date.
- `availabilities`: high-level seasonal capacity blocks used by event planners.
- `cost_options`: pricing models with currencies and deposit/tax metadata. The nested payload aligns with the richer `StructureCostOption` schema described below.

Consumers should rely on these expanded payloads to populate the new UI sections (period badges, filters, and detail lists) rather than querying tables directly.

## `structure_cost_options`

The `structure_cost_options` table gains parallel updates:

- Rename column `deposit` → `booking_deposit` and introduce `damage_deposit`.
- Add `utilities_included` (bool), `min_nights` (int) and optional `payment_methods` set.
- Allow `price_per_resource` JSON array with the same `{risorsa, prezzo, include_consumi}` shape accepted at the structure level, including nested `modifiers` for seasonal/target adjustments.

Validation rules ensure that `utilities_flat` on a cost option triggers warnings when `utilities_included = true` to avoid double counting and that `price_per_resource` modifiers inherit the surrounding currency and VAT defaults.

## Validazioni trasversali

- `slug` unique and immutable; `(name, comune)` soft uniqueness with warning-level enforcement.
- Capacity coherence: `capacity_min ≤ capacity_max`, `pitches_tende ≥ 0`, `parking_car_slots ≥ 0`.
- Type-specific constraints: when `type = 'house'` tent-related fields (`pitches_tende`, `tap_on_field`, `field_slope`) are forbidden; when `type = 'land'` indoor-only fields (`indoor_rooms`, `indoor_beds`, ecc.) are not allowed.
- Environmental rules: `fire_policy = 'with_permit'` requires `fire_rules`; `in_area_protetta = true` requires `ente_area_protetta`.
- Media: require ≥ 3 photos whenever the structure has outdoor features or `type != 'house'`.
- Seasonal overrides: `amenities_by_period` may override baseline booleans (e.g. `hot_water`) but must match the allowed amenity keys.

Warnings emitted during imports help operators reconcile conflicting utility information and missing mandatory pairings (e.g. protected area without authority).

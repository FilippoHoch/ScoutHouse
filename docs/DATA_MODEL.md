# Data model – ScoutHouse

Questo documento descrive lo stato attuale del modello dati utilizzato dal backend ScoutHouse. I riferimenti derivano direttamente dagli ORM SQLAlchemy definiti sotto `backend/app/models` e riflettono lo schema post-migrazione attualmente in esercizio.

## `structures`

La tabella `structures` rappresenta l'anagrafica principale di case, basi e terreni. I campi più rilevanti sono suddivisi per area tematica.

### Identità e localizzazione

- `id` (PK incrementale).
- `name` (varchar 255) e `slug` (varchar 255, univoco) per identificare la struttura; esiste un indice su `lower(name)` per individuare duplicati omonimi.
- `type` enum `house | land | mixed` (`StructureType`).
- Coordinate e indirizzo: `province`, `address`, `latitude`, `longitude`, `altitude`.

### Capacità indoor

- `indoor_beds`, `indoor_bathrooms`, `indoor_showers`, `indoor_activity_rooms` (tutti interi opzionali).
- `has_kitchen` e `hot_water` (boolean opzionali) per la dotazione di cucina e acqua calda.

### Area esterna e servizi

- `land_area_m2` (numeric 10,2) e `shelter_on_field` (boolean) per superfici e ripari in campo.
- `water_sources` lista JSON di valori `none | fountain | tap | river` (`WaterSource`).
- `electricity_available` (boolean) e `fire_policy` enum `allowed | with_permit | forbidden` (`FirePolicy`).
- `has_field_poles` e `pit_latrine_allowed` (boolean) per pali e latrine.

### Accessibilità e logistica

- `access_by_car`, `access_by_coach`, `access_by_public_transport`, `coach_turning_area` (boolean) per i mezzi ammessi.
- `transport_access_points` (array JSON di oggetti con `type`, `coordinates`, `note`) per descrivere punti di accesso ai mezzi pubblici.
- `weekend_only` (boolean) per le strutture prenotabili solo nel weekend.
- `notes_logistics` e `notes` (text) raccolgono note operative e generiche.

### Contatti e metadati

- `contact_emails` e `website_urls` (liste JSON di stringhe) per email/URL pubblici.
- `created_at` (timestamp con timezone, default `now()`).

Gli indici secondari includono `ix_structures_province`, `ix_structures_type`, `ix_structures_fire_policy`, `ix_structures_access_by_coach` e `ix_structures_access_by_public_transport` per ottimizzare i filtri API.

## Relazioni principali

Una struttura carica diverse relazioni con `lazy="selectin"` quando il client richiede `include=details`:

- `availabilities`: stagionalità/capienza (`StructureSeasonAvailability`).
- `cost_options`: modelli di costo (`StructureCostOption`).
- `contacts`: referenti (`StructureContact`).
- `open_periods`: periodi di apertura (`StructureOpenPeriod`).
- `photos`: galleria immagini (`StructurePhoto`).

## `structure_season_availability`

Rappresenta la capacità per stagione scout (`StructureSeasonAvailability`).

- `structure_id` FK verso `structures` con `ON DELETE CASCADE`.
- `season` enum `winter | spring | summer | autumn`.
- `units` lista JSON di sigle reparto (`LC`, `EG`, `RS`, `ALL`).
- `capacity_min` e `capacity_max` (interi opzionali).

L'indice `ix_structure_season_availability_structure_id_season` previene duplicati stagionali.

## `structure_open_periods`

Memorizza finestre di apertura e blackout.

- `structure_id` FK con `ON DELETE CASCADE`.
- `kind` enum `season | range` (`StructureOpenPeriodKind`).
- `season` enum `spring | summer | autumn | winter`, richiesto quando `kind = 'season'`.
- `date_start` e `date_end` (date, richieste quando `kind = 'range'`).
- `notes` campo testuale per eccezioni.
- `units` lista JSON opzionale per limitare il periodo a specifiche unità scout.

Sono presenti indici per combinazioni `(structure_id, kind)`, `(structure_id, season)` e `(structure_id, date_start, date_end)` per evitare duplicati e accelerare le query.

## `structure_cost_option` e `structure_cost_modifier`

Il modello `StructureCostOption` descrive la tariffazione base:

- `structure_id` FK con `ON DELETE CASCADE`.
- `model` enum `per_person_day | per_person_night | forfait`.
- `amount` (numeric 10,2) e `currency` (ISO 4217, default `EUR`).
- Costi accessori opzionali: `deposit`, `city_tax_per_night`, `utilities_flat`, `min_total`, `max_total` (tutti numeric 10,2).
- `age_rules` (JSON) per eccezioni di prezzo per fascia d'età.

Le opzioni possono avere modificatori (`StructureCostModifier`) collegati tramite `cost_option_id`:

- `kind` enum `season | date_range | weekend`.
- `amount` (numeric 10,2) e, quando applicabile, `season` (`StructureSeason`) oppure `date_start`/`date_end`.

## Contatti delle strutture

La tabella pivot `structure_contacts` collega `structures` e `contacts`:

- `role` (text), `preferred_channel` enum `email | phone | other`, `is_primary` (boolean).
- Constraint univoco (`structure_id`, `contact_id`) e indice che garantisce un solo contatto primario per struttura (`uix_structure_contacts_primary`).
- Timestamp `created_at`/`updated_at` e `gdpr_consent_at` opzionale.

I record in `contacts` custodiscono `first_name`, `last_name`, `email`, `phone`, `notes` e timestamp di creazione/aggiornamento.

## Media

Le immagini sono gestite dalla tabella `structure_photos`:

- `structure_id` FK verso `structures` e `attachment_id` FK verso `attachments` (1:1, unique).
- `position` intero per ordinamento esplicito.
- `created_at` timestamp.

## Validazioni applicative

Le convalide sono garantite principalmente a livello di dominio (schemi Pydantic e servizi), ma i vincoli principali lato database includono:

- Unicità di `slug` per la riconciliazione import/API.
- Cascade delete su periodi, availabilities, cost options, contatti e foto, per mantenere il catalogo consistente.
- Indici specializzati per filtri su provincia, tipo, policy fuochi e accessibilità trasporto.

Ulteriori verifiche (coerenza capacità, note logistiche obbligatorie solo in alcuni flussi, numero minimo di foto, ecc.) sono demandate al layer applicativo.

# Scheda struttura – copertura UI

Questo documento riepiloga quali campi del modello `Structure` sono gestiti dalla UI web nelle pagine di creazione, modifica e visualizzazione della scheda. L'obiettivo è avere una checklist rapida per verificare che tutti i dati esposti dal modello operativo siano coperti.

## Creazione e modifica (`/structures/new`, `/structures/:slug/edit`)

Il wizard di creazione è suddiviso in sezioni tematiche. Ogni sezione presenta i campi elencati di seguito.

### Informazioni principali
- `name` (obbligatorio) e slug generato automaticamente.
- `type` (`house`, `land`, `mixed`).
- `province` (codice a due lettere).
- `address`.
- `contact_status` (`unknown`, `to_contact`, `contacted`, `confirmed`, `stale`).
- `operational_status` (`operational`, `seasonal`, `temporarily_closed`, `permanently_closed`).

### Coordinate
- `latitude`, `longitude` con anteprima Google Maps.
- `altitude`.

### Spazi interni (visualizzata per `type != land`)
- `indoor_beds`, `indoor_bathrooms`, `indoor_showers`, `indoor_activity_rooms`.
- Flag tri-stato `has_kitchen`, `hot_water`.

### Spazi esterni (visualizzata per `type != house`)
- `land_area_m2`.
- `field_slope` (`flat`, `gentle`, `moderate`, `steep`).
- `pitches_tende` (numero indicativo di piazzole tende).
- `water_at_field` (tri-stato).
- Checkbox multiple `water_sources` (`none`, `fountain`, `tap`, `river`).
- Flag tri-stato `shelter_on_field`, `electricity_available`, `has_field_poles`, `pit_latrine_allowed`.
- `fire_policy` (`allowed`, `with_permit`, `forbidden`).

### Accessibilità e trasporti
- Flag tri-stato `access_by_car`, `access_by_coach`, `access_by_public_transport`, `coach_turning_area`, `wheelchair_accessible`, `step_free_access`.
- Campi numerici `parking_car_slots`, `parking_bus_slots` con note libere `parking_notes`.
- Campo libero `nearest_bus_stop`.
- Textarea `accessibility_notes`.

### Operatività
- Tri-stato `weekend_only`.
- Gestione tabelle `open_periods` (stagioni e intervalli con `units`, `notes`).
- Textarea `notes_logistics`.
- Lista libera `allowed_audiences`.
- Textarea `usage_rules`.
- Select `animal_policy` (`allowed`, `allowed_on_request`, `forbidden`) + textarea `animal_policy_notes`.
- Flag tri-stato `in_area_protetta` con campo libero `ente_area_protetta`.
- Textarea `environmental_notes`.
- Mappa chiave/valore `seasonal_amenities` (servizi stagionali serializzati in oggetto JSON).

### Costi
- Lista dinamica di `StructureCostOptionInput` (`model`, `amount`, `currency`, `booking_deposit`, `damage_deposit`, `city_tax_per_night`, `utilities_flat`, `utilities_included`, `utilities_notes`, `payment_methods`, `payment_terms`, `min_total`, `max_total`).
- Textarea "Metadati avanzati (JSON)" per ogni opzione di costo: consente di impostare campi aggiuntivi come `modifiers`, `age_rules`, `price_per_resource` senza sovrascrivere i valori gestiti dal modulo.

### Metadati avanzati
- Textarea dedicata ai metadati avanzati: accetta un oggetto JSON arbitrario che viene fuso nel payload di creazione/aggiornamento. I campi di sola lettura (`id`, `created_at`, `updated_at`, `estimated_cost`, `cost_band`, `availabilities`, `contacts`, `open_periods`, `cost_options`, `warnings`, `photos`) vengono ignorati automaticamente e non vengono sovrascritti i valori già compilati tramite il modulo principale.
- Tramite questo canale è possibile impostare tutti gli altri attributi previsti da `StructureCreateDto`. Di seguito l'elenco dei campi oggi non coperti dal wizard ma gestibili tramite JSON:
  - `activity_equipment`, `activity_spaces`, `aed_on_site`, `booking_notes`, `booking_required`, `booking_url`, `bridge_weight_limit_tonnes`, `bus_type_access`, `cell_coverage`, `cell_coverage_notes`, `communications_infrastructure`, `country`.
  - `data_last_verified`, `data_quality_flags`, `data_quality_notes`, `data_quality_score`, `data_source`, `data_source_url`, `documents_required`, `dry_toilet`, `emergency_coordinates`, `emergency_phone_available`, `emergency_plan_notes`, `emergency_response_time_minutes`, `evacuation_plan_url`.
  - `event_rules_notes`, `event_rules_url`, `fire_rules`, `fiscal_notes`, `flood_risk`, `generator_available`, `generator_notes`, `governance_notes`, `iban`, `inclusion_notes`, `inclusion_services`, `indoor_rooms`.
  - `invoice_available`, `locality`, `logistics_arrival_notes`, `logistics_departure_notes`, `map_resources_urls`, `max_vehicle_height_m`, `municipality`, `municipality_code`, `outdoor_bathrooms`, `outdoor_showers`, `payment_methods`, `pec_email`, `plus_code`.
  - `power_capacity_kw`, `power_outlet_types`, `power_outlets_count`, `risk_assessment_template_url`, `river_swimming`, `road_access_notes`, `road_weight_limit_tonnes`, `sdi_recipient_code`, `wastewater_notes`, `wastewater_type`, `water_tank_capacity_liters`, `weather_risk_notes`, `what3words`, `whatsapp`, `wildlife_notes`, `winter_access_notes`.
- I valori impostati nei metadati avanzati vengono mostrati anche nella pagina di dettaglio all'interno del riquadro "Metadati avanzati".

### Contatti, link e note
- Array `contact_emails`.
- Array `website_urls` con validazione client.
- Textarea `notes`.
- Sezione opzionale per creare/collegare un `StructureContact`.

### Foto
- Coda di upload per `StructurePhoto` tramite S3 signed upload.

#### Copertura test

- `StructureCreate.test.tsx > collects full logistics metadata for mixed structures` esercita l'inserimento combinato di campi interni, esterni, accessibilità e note operative garantendo la serializzazione completa del payload.
- `StructureCreate.test.tsx > merges advanced metadata JSON into the payload` valida l'integrazione dei campi aggiuntivi impostati tramite la textarea di metadati avanzati, inclusa l'esclusione delle chiavi bloccate.
- `StructureDetails.test.tsx > renders structure details when found` verifica il rendering della scheda con i campi di logistica, posizione, costi e include asserzioni sui metadati avanzati mostrati nel riquadro dedicato.

## Visualizzazione (`/structures/:slug`)

La pagina dettaglio mostra gli stessi campi organizzati in tab.

### Tab "Panoramica"
- Metadati (`slug`, `created_at`, `cost_band`, `estimated_cost`).
- Badge introduttivi con `type`, `operational_status`, `contact_status`, `province`.
- Blocco Posizione con indirizzo, coordinate, `altitude` e link Google Maps.
- Griglia "Spazi interni" con `has_kitchen`, `hot_water`, `indoor_*`.
- Griglia "Spazi esterni" con `land_area_m2`, `field_slope`, `pitches_tende`, `water_at_field`, `shelter_on_field`, `has_field_poles`, `water_sources`, `pit_latrine_allowed`, `electricity_available`, `fire_policy`.
- Griglia "Accessibilità" con `access_by_car`, `access_by_coach`, `coach_turning_area`, `access_by_public_transport`, `nearest_bus_stop`, `wheelchair_accessible`, `step_free_access`, `parking_car_slots`, `parking_bus_slots`, `parking_notes`, `accessibility_notes`.
- Sezione Operatività con `website_urls`, `weekend_only`, `allowed_audiences`, `usage_rules`, `animal_policy`, `animal_policy_notes`, `in_area_protetta`, `ente_area_protetta`, `environmental_notes`, `seasonal_amenities`, `notes_logistics`, `notes`.
- Box "Metadati avanzati" che visualizza (in JSON formattato) i campi extra presenti sull'entità.

### Tab "Disponibilità"
- Tabella delle `availabilities` (stagione, branche, capacità) e `open_periods` con note/unità.

### Tab "Costi"
- Elenco formattato delle `cost_options`, inclusi depositi (prenotazione/danni), tassa di soggiorno, forfait utenze con flag di inclusione e note, soglie min/max e metodi/condizioni di pagamento.
- Per ogni voce viene mostrato un riquadro espandibile con i metadati avanzati serializzati via JSON (es. `modifiers`, `age_rules`, `price_per_resource`).

### Tab "Contatti"
- Sezione link per `website_urls` e `contact_emails`.
- Tabella CRUD dei `StructureContact` (con flag primario, email, telefono).

### Tab "Foto" e "Allegati"
- Galleria `photos` con carousel e azioni.
- Placeholder allegati con prompt login (l'integrazione storage avverrà in fasi successive).

## Checklist di verifica

Quando si estende il modello dati:

1. Aggiornare gli schema DTO (`Structure`, `StructureCreateDto`).
2. Mappare il campo nella UI di creazione (controllando le condizioni di visibilità per `type`).
3. Aggiungere la rappresentazione nel tab "Panoramica" o nella sezione pertinente della pagina dettagli.
4. Estendere le traduzioni (`frontend/src/i18n/it/common.json`).
5. Aggiornare i test (`StructureCreate.test.tsx`, `StructureDetails.test.tsx`) per coprire il nuovo campo.
6. Aggiornare questa pagina e la sezione API se il campo è editabile dall'interfaccia.
7. Eseguire `scripts/verify_structure_profile.py` per verificare che documentazione e costanti della UI coprano tutti i campi dello schema.

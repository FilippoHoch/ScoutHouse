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
- Select `flood_risk` (`none`, `low`, `medium`, `high`).
- Textarea `environmental_notes`.
- Mappa chiave/valore `seasonal_amenities` (servizi stagionali serializzati in oggetto JSON).

### Costi
- Selettore multiplo `payment_methods` (enum: `not_specified`, `cash`, `bank_transfer`, `card`, `online`, `other`).
- Lista dinamica di `StructureCostOptionInput` (`model`, `amount`, `currency`, `booking_deposit`, `damage_deposit`, `city_tax_per_night`, `utilities_flat`, `utilities_included`, `utilities_notes`, `payment_methods`, `payment_terms`, `min_total`, `max_total`).

### Contatti, link e note
- Array `contact_emails`.
- Array `website_urls` con validazione client.
- Textarea `notes`.
- Sezione opzionale per creare/collegare un `StructureContact`.

### Foto
- Coda di upload per `StructurePhoto` tramite S3 signed upload.

#### Copertura test

- `StructureCreate.test.tsx > collects full logistics metadata for mixed structures` esercita l'inserimento combinato di campi interni, esterni, accessibilità e note operative garantendo la serializzazione completa del payload.
- `StructureDetails.test.tsx > renders structure details when found` verifica il rendering della scheda con i campi di logistica, posizione e costi principali.

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

### Tab "Disponibilità"
- Tabella delle `availabilities` (stagione, branche, capacità) e `open_periods` con note/unità.

### Tab "Costi"
- Elenco formattato delle `cost_options`, inclusi depositi (prenotazione/danni), tassa di soggiorno, forfait utenze con flag di inclusione e note, soglie min/max e metodi/condizioni di pagamento.

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

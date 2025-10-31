# Import / Export – guida operativa

## Template aggiornati

- `structures_import_template.(xlsx|csv)` espone ora la colonna `indoor_activity_rooms` al posto della precedente `dining_capacity`.
- Nuovi endpoint `structure-open-periods.(xlsx|csv)` con intestazioni `structure_slug`, `kind`, `season`, `date_start`, `date_end`, `notes`.

Scaricare sempre i template aggiornati dalle API (`/api/v1/templates/...`) prima di preparare i file: i campi obbligatori e l'ordine delle colonne vengono validati rigidamente.

## Import strutture

Il flusso resta invariato rispetto alle versioni precedenti:

1. Effettuare un upload in modalità `dry_run=true` per ottenere anteprima di `valid_rows`, `invalid_rows` ed errori puntuali.
2. Risolvere eventuali errori e rilanciare l'import con `dry_run=false`.
3. Il sistema esegue un upsert per `slug`, conteggia le righe vuote in `skipped` e registra un audit `import_structures`.

Campi booleani (`has_kitchen`, `hot_water`, `access_*`, `pit_latrine_allowed`, ecc.) accettano i valori `true/false`, `1/0`, `yes/no`. Le colonne numeriche devono contenere interi o decimali positivi; lasciare la cella vuota se il dato non è disponibile.

## Import periodi di apertura

- `kind = season` richiede l'indicazione della stagione (`winter|spring|summer|autumn`).
- `kind = range` richiede `date_start` e `date_end` (formato ISO `YYYY-MM-DD`).
- `notes` è facoltativo in entrambi i casi.

Il `dry_run` restituisce l'anteprima con le possibili azioni:

- `create`: verrà creato un nuovo periodo.
- `skip`: il periodo è già presente e verrà ignorato.
- `missing_structure`: lo `slug` indicato non esiste; la presenza di almeno una riga di questo tipo blocca l'import definitivo.

L'esecuzione con `dry_run=false` crea solo i periodi marcati come `create`. I duplicati e le righe vuote rientrano nel conteggio `skipped`. Anche questa operazione è tracciata con audit `import_structure_open_periods`.

## Export

- Formato `csv`: restituisce un archivio ZIP con due file (`structures.csv` e `structure_open_periods.csv`).
- Formato `xlsx`: aggiunge il foglio `structure_open_periods` accanto al foglio principale delle strutture.
- Formato `json`: ogni struttura include l'array `open_periods` già ordinato.

Filtri supportati: ricerca testuale (`q`), provincia, tipologia, stagione/unità, fascia di costo, distanza massima, policy fuochi, area minima, flag trasporti (`access`), disponibilità acqua calda (`hot_water`), `open_in_season`, `open_on_date`.

## Migrazione dati esistenti

- Aggiornare eventuali pipeline o spreadsheet custom rinominando la colonna `dining_capacity` in `indoor_activity_rooms`.
- Rimuovere campi obsoleti (`max_vehicle_height_m`, `max_tents`, `toilets_on_field`, `winter_open`) da script o fogli legacy: non sono più riconosciuti dal parser.
- Generare i nuovi template e verificare gli import su un database di staging prima di procedere in produzione.

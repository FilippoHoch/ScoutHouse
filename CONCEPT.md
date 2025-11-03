# ScoutHouse – Visione e requisiti di prodotto

## Obiettivo
Realizzare una piattaforma web accessibile per il gruppo scout che centralizzi le
informazioni sulle strutture ricettive e supporti la pianificazione di uscite,
campi e attività. L'interfaccia deve essere intuitiva così che ogni capo possa
consultare rapidamente i dati, collaborare con il resto della comunità e tenere
traccia delle verifiche fatte con le strutture.

## Catalogo delle strutture
### Esperienza utente
- Pagina indice con elenco e card delle strutture registrate.
- Filtri per testo libero, provincia, tipologia (`house`, `land`, `mixed`),
  stagione, unità, fascia di costo, periodi di apertura (`open_in`/`open_on`) e
  distanza dalla base di riferimento.
- Accesso rapido alla scheda dettagliata con contatti, disponibilità stagionali
  e documenti allegati.
- Possibilità di aggiungere nuove strutture riservata agli amministratori a
  meno che `ALLOW_NON_ADMIN_STRUCTURE_EDIT=true` abiliti l'editing per tutti gli
  utenti autenticati.

### Dati anagrafici richiesti
Ogni struttura deve poter memorizzare le informazioni chiave elencate di seguito.
Molti campi sono opzionali, ma è importante supportarli tutti per descrivere al
meglio le diverse casistiche:

- **Identità:** nome, slug univoco, tipologia, data di creazione.
- **Posizionamento:** provincia (sigla a due lettere), indirizzo completo,
  coordinate geografiche per mappa e calcolo distanze.
- **Logistica:** posti letto interni, numero di bagni e docce, sale attività,
  disponibilità cucina e acqua calda, accessibilità mezzi (auto, pullman, TPL),
  politiche fuochi, possibilità di scavare latrine, eventuali note descrittive.
- **Riferimenti esterni:** URL del sito o della fonte informativa.
- **Disponibilità stagionali:** unità ammesse (`LC`, `EG`, `RS`, `ALL`) con
  capacità minima/massima per stagione.
- **Costi:** modelli tariffari (a persona/notte/giorno o forfait) con valuta,
  deposito, eventuali imposte di soggiorno o utenze forfettarie.
- **Contatti:** elenco ordinato con canale preferito, ruolo, note e consenso
  GDPR.
- **Documentazione:** allegati caricati dagli utenti con tracciamento di chi ha
  eseguito l'upload.

## Pianificazione eventi
- Gestione attività (uscite, campi, riunioni) con informazioni su branche,
  partecipanti, periodo e stato.
- Possibilità di associare più strutture candidate, assegnare responsabilità di
  contatto ai capi e segnare gli esiti.
- Sistema di quote per stimare costi totali basati sulle informazioni dei
  candidati (trasporti, numero ragazzi e capi, ecc.).

## Operazioni e automazione
- Import massivo da CSV/XLSX con intestazioni estese (`indoor_beds`,
  `indoor_bathrooms`, `indoor_showers`, `indoor_activity_rooms`, `has_kitchen`,
  ecc.) e validazioni puntuali.
- Esportazione dei dati delle strutture in CSV, JSON e XLSX con i nuovi campi
  logistici inclusi.
- Allegati gestiti via storage S3-compatibile con controllo di dimensione e mime
  type.

## Piattaforma tecnica
- Frontend React con traduzioni italiane, componenti accessibili e test di
  regressione.
- Backend FastAPI con autenticazione JWT, audit trail per le modifiche e rate
  limiting sugli endpoint sensibili.
- Script di seed e dataset d'esempio aggiornati ai nuovi campi logistici.
- Possibilità di esporre il progetto localmente (Docker/`uvicorn`) per facilitare
  test e demo interne.

## Evoluzioni future
- Integrazione di mappe reali al posto del placeholder.
- Notifiche e-mail o push per cambio stato dei candidati struttura.
- Modalità offline/PWA per consultare contatti e documenti sul campo.
- Reportistiche dedicate (es. disponibilità per periodo, storico contatti
  effettuati) per migliorare il coordinamento tra i capi.

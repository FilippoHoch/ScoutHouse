# Operatività ScoutHouse

Questa guida raccoglie le procedure operative minime per monitorare lo stato
del backend e gestire i backup del database.

## Logging strutturato

Il backend FastAPI emette log JSON su `stdout` con campi `timestamp`, `level`,
`logger`, `message` e `request_id`. Ogni richiesta HTTP riceve/propaga l'header
`X-Request-ID`, così da correlare le entry nei log e le segnalazioni esterne
(es. Sentry).

Livello e formato sono configurabili via `LOG_LEVEL` (default `INFO`) e
`LOG_JSON` (default `true`). Per disabilitare la serializzazione JSON in locale
impostare `LOG_JSON=false` nel file `.env` del backend.

## Healthcheck

- **Liveness**: `GET /api/v1/health/live` → verifica che l'app sia in esecuzione.
- **Readiness**: `GET /api/v1/health/ready` → esegue un `SELECT 1` sul DB e
  controlla che la tabella `alembic_version` sia allineata all'ultimo head.

In Docker Compose il servizio `api` espone un healthcheck che punta al readiness
endpoint; `docker compose ps` mostra lo stato corrente.

## Metriche Prometheus

L'endpoint `GET /metrics` espone le metriche in formato Prometheus utilizzando
`prometheus-fastapi-instrumentator`. Sono disponibili contatori per richieste,
istogrammi di latenza, errori per codice HTTP e il gauge
`db_pool_connections_in_use` per monitorare le connessioni PostgreSQL attive.

Esempio di scraping manuale:

```bash
curl -s http://localhost:8000/metrics | grep http_requests_total
```

## Error tracking (Sentry)

Se `SENTRY_DSN` è valorizzato il backend inizializza Sentry con sample rate di
tracing configurabile (`SENTRY_TRACES_SAMPLE_RATE`, default 0.1). In assenza di
DSN l'integrazione rimane inattiva. I log di livello `ERROR` vengono inviati al
backend Sentry attraverso il logging integration.

## Backup e restore

Il container `backup` esegue giornalmente `pg_dump` generando file compressi
`scouthouse_%Y-%m-%d_%H%M.sql.gz`. Destinazioni supportate:

- Volume locale `backup_data` (predefinito).
- Bucket S3/MinIO quando `AWS_S3_BUCKET` è impostato; utilizzare una regola di
  retention a 14 giorni lato bucket.

Per ripristinare da un backup locale:

```bash
docker compose run --rm db bash -c "gunzip -c /backups/scouthouse_2025-01-01_0200.sql.gz | psql \$DATABASE_URL"
```

Aggiornare il path al file desiderato. In scenari S3 scaricare il dump con
`aws s3 cp` e seguire la stessa procedura.

## Variabili d'ambiente principali

| Variabile                   | Descrizione                                                   |
|-----------------------------|---------------------------------------------------------------|
| `LOG_LEVEL`                 | Livello di log (INFO, DEBUG, ecc.).                           |
| `LOG_JSON`                  | Abilita la serializzazione JSON dei log.                      |
| `SENTRY_DSN`                | DSN Sentry (vuoto → disabilitato).                            |
| `SENTRY_TRACES_SAMPLE_RATE` | Sample rate per performance traces (0.0 – 1.0).               |
| `BACKUP_CRON`               | Programmazione cron del job di backup.                        |
| `AWS_*`                     | Credenziali e configurazione per upload su S3/MinIO.          |
| `DATABASE_URL`              | Connessione al database (usata anche dal job di backup).      |

## Verifiche rapide

1. **Stato applicazione**: `curl -f http://localhost:8000/api/v1/health/ready`.
2. **Metriche disponibili**: `curl -f http://localhost:8000/metrics | head`.
3. **Ultimo backup**: `docker compose exec backup ls -1 /backups | tail`.

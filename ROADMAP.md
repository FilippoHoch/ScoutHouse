# Roadmap · ScoutHouse

## 0) Scopo e risultato finale

* **Risultato atteso**: piattaforma web per capi scout che centralizza catalogo case/terreni, gestione eventi, workflow contatti, preventivi, import/export, con sicurezza e audit.
* **KPI**: tempo medio per trovare una struttura; % eventi con shortlist ≤ 3 strutture; tempo medio risposta contatti; accuratezza preventivi ±10%; N utenti attivi/mese.
* **Personas**: amministratore catalogo; capo responsabile evento; capo collaboratore; ospite in sola lettura.

## 1) Architettura target

**Frontend**

* React + TypeScript + Vite. Routing client-side. Design system accessibile (WCAG 2.1 AA).
* State: TanStack Query per dati server; store leggero (Zustand/Redux) per filtri e UI.
* Componenti: card struttura, barra filtri, modale struttura, wizard evento, tabella contatti, timeline stato, modale preventivo.
* Feature flag client (Unleash SDK o hook custom su Redis), fallback lato UI e gated rollout.
* PWA con Workbox, cache offline per schede struttura, contatti e checklist sopralluogo.
* i18n pronto, default IT.

**Backend**

* FastAPI + Pydantic + SQLAlchemy. REST + WebSocket per aggiornamenti di stato.
* Servizi: filtri e disponibilità, matching strutture, calcolo distanze, preventivi.
* Task asincroni: RQ/Celery per import/export, email, ricalcoli.
* Middleware idempotenza (Redis), rate limiting `fastapi-limiter`, security headers avanzati.
* Auth: JWT con refresh; ruoli e permessi granulari.
* Dipendenze: feature flag backend, validazione dedup, DSAR export, audit trail a catena.

**Dati e integrazioni**

* PostgreSQL; Redis per cache, idempotenza e feature toggle. S3 compatibile per allegati.
* Geocoding/distanze: Nominatim + OSRM. Base di distanza = “Gussago Piazza”, override per utente.
* Mail: SendGrid (o analogo). Calendari: iCal export, integrazione GCal in backlog.
* Upload sicuri con ClamAV sidecar, DLP base (masking log e MIME whitelisting).
* Monitoraggio: Prometheus + Grafana, synthetic test k6, alert su SLO.

**DevOps**

* Monorepo: `/frontend`, `/backend`, `/infra`, `/docs`, `/scripts`.
* Docker per dev e deploy. CI GitHub Actions: lint, test, build, security scan.
* Deploy: Railway/Fly.io. IaC opzionale (Terraform) per prod.

## 2) Dominio e modello dati

**Entità principali**

* `Structure` (casa/terreno/misto): nome, slug, indirizzo, provincia, coord, servizi, note.
* `Contact` (responsabili): nome, telefono, email, preferenze.
* `StructureSeasonAvailability` (stagione → unità: L/C, E/G, R/S, Tutti; limiti).
* `StructureCostOption` (per persona/giorno/notte, forfait, acconti, utenze, tassa soggiorno con soglie età).
* `Event`: titolo, branca, periodo, date, partecipanti per fascia, budget, note logistiche.
* `EventStructureCandidate`: legame evento–struttura + stato disponibilità.
* `EventContactTask`: assegnatario, stato chiamata, esito, note, timestamp.
* `EventParticipantSummary`: breakdown età/capi.
* `Quote` (versioni di preventivo) con breakdown voci.
* `User` + ruoli; `AuditLog`; `Attachment`.
* `StructureFieldMeta` (JSONB `field_meta`) con `{source, verified_by, verified_at}` per campi critici.
* `Consent`, `BillingProfile`, `WebhookEndpoint`, `FeatureFlagState`, `Tenant` (soft multi-tenant).

**Relazioni**

* Structure 1–N Availability/CostOption.
* Event N–N Structure tramite `EventStructureCandidate`.
* Event 1–N ContactTask e Quote.
* User N–N Event con ruoli.

## 3) Superficie funzionale (stato finale)

1. **Catalogo strutture**

   * CRUD + validazioni. Filtri: tipologia, provincia, stagione, unità, fascia costo, distanza, disponibilità.
   * Ricerca full-text. Card + dettaglio con tab info/costi/disponibilità/contatti/storico feedback.
   * Calcolo distanza da base utente o default.
   * Import/Export: XLSX/CSV/JSON; anteprima errori; update per ID o match nome+indirizzo.
   * Servizio dedup (preview + merge transazionale), caching filtri frequenti, indice PostGIS + trigram.
   * Endpoint compare strutture con export CSV/PDF.

2. **Eventi e collaborazione**

   * Wizard evento: dettagli → partecipanti → budget → shortlist suggerita.
   * Kanban/Tabella contatti: assegnazioni, stati, note, cronologia.
   * Sincronizzazione disponibilità tra eventi. WebSocket/polling per aggiornamenti.
   * Notifiche email opzionali.
   * Gestione conflitti disponibilità con lock logico e segnalazione overlap.

3. **Preventivazione**

   * Regole tariffarie combinabili. Scenari best/realistic/worst.
   * Esportazione PDF/Excel. Versionamento e confronto.
   * Calcolo quote idempotente con retry safe e audit dei parametri.

4. **Sicurezza e amministrazione**

   * Auth completa, reset password, inviti, MFA opzionale.
   * Permessi granulari, audit log, allegati su S3.
   * Pannello admin: strutture proposte, utenti, ruoli.
   * Rate limit pubblici/import, security headers, SBOM/Trivy in CI, job audit dipendenze.
   * Webhook HMAC con retry/backoff, audit trail firmato e catena hash.

5. **Qualità, osservabilità, privacy**

   * Logging strutturato, Sentry, healthcheck.
   * Backup DB e storage; test restore; PITR e DR mensile.
   * Privacy/GDPR: consensi contatti, data retention, DSAR export/erase, CMP cookie.
   * Metriche Prometheus (p50/p95, error rate, code RQ), SLO e synthetic monitoring k6.

## 4) IA informativa e UX

**Sitemap**

* `/` landing + CTA login
* `/structures`, `/structures/new`, `/structures/:slug`
* `/events`, `/events/:id`
* `/import-export`
* `/login`, `/register`, `/forgot-password`
* `/admin` (utenti, approvazioni)
  **Pattern**
* Wizard multi-step con progress.
* Filtri persistenti. Accessibilità tastiera e ARIA. Contrasti AA/AAA.

## 5) Struttura repository

```
/frontend
  src/app, src/entities(structures,events,quotes)
  src/shared(ui,lib,api), i18n, tests
/backend
  app/api(v1), app/core(auth,security), app/models, app/services, app/schemas
  app/tasks, migrations, tests
/infra (docker, compose, IaC)
/docs (CONCEPT.md, ROADMAP.md, API.md, DATA_MODEL.md)
/scripts (dev_server.py, seed.py, import_export.py)
```

## 6) Milestone con DoD

### Stato avanzamento e priorità

Le milestone M0–M4 (fondamenta prodotto, workflow principali e infrastruttura) sono state chiuse e manteniamo solo le attività aperte nel piano seguente.

### M5 · Governance accessi e compliance operativa

**Obiettivi principali**

* Coprire gli ultimi gap su controllo accessi, gestione sessioni e obblighi GDPR prima del beta pubblico.

#### Task essenziali

* **Identity & access management**
  * Introdurre ruoli granulari per strutture/eventi con ereditarietà e deleghe temporanee.
  * Single Sign-On opzionale (SAML/SCIM) per gruppi con più account e gestione sessioni attive con revoca.
  * MFA obbligatoria per amministratori e audit trail completo su eventi di login/dispositivo.
* **Compliance**
  * Workflow consensi e data-retention automatizzata su contatti e allegati con job programmati di purge.
  * DPIA aggiornata, registro trattamenti versionato e run trimestrale del playbook incident response.
* **Security automation**
  * Integrazione scanner dipendenze (Dependabot, Trivy, pip-audit, npm audit) con triage automatico e SLA di remediation tracciato.
  * Alerting sicurezza centralizzato (SIEM leggero) e report mensile condiviso con il team.

#### Metriche di successo

* 100% endpoint privilegiati coperti da test autorizzazione automatici.
* ≥ 80% degli amministratori con MFA attiva entro un mese dal rilascio.
* Nessun CVE alto aperto oltre 5 giorni.

**DoD**

* Matrice ruoli/permessi e policy di retention pubblicate, SSO/MFA disponibili in produzione, check ASVS L1 superato e report incident response archiviato.

### M6 · Resilienza, osservabilità e costi

**Obiettivi principali**

* Garantire disponibilità e tempi di risposta stabili, introducendo strumenti di monitoraggio e ottimizzando i costi cloud.

#### Task essenziali

* **Affidabilità**
  * Test di carico k6 sugli scenari critici (import massivi, generazione preventivi, SSE eventi) con target p95 < 1s.
  * Chaos testing su code RQ, servizi esterni (S3, geocoding) e failover DB con run mensile documentata.
  * Piano DR completo: restore automatizzato DB/allegati + verifica RPO/RTO.
* **Osservabilità**
  * Tracing distribuito OpenTelemetry end-to-end con sampling adattivo e log contestualizzati.
  * Dashboard Grafana unificate (API, frontend, code, job) con alerting su SLO e canali on-call.
* **Ottimizzazione costi**
  * Stima budget ambienti (dev/staging/prod) con alert FinOps e scalabilità oraria per workload batch.
  * Riduzione storage S3 tramite lifecycle e compressione automatica esportazioni.

#### Metriche di successo

* ≥ 99.5% uptime applicativo in staging con carico realistico.
* P95 API critiche < 900 ms durante gli stress test.
* Riduzione costi infrastruttura del 15% rispetto al baseline attuale.

**DoD**

* Dashboard e alert attivi, report FinOps condiviso e simulazione disaster recovery eseguita con esito positivo.

### M6.1 · Governance dati catalogo strutture

**Obiettivi principali**

* Aumentare l'affidabilità del registro strutture introducendo nuove dimensioni informative e controlli di coerenza.

#### Task essenziali

* **Schema & migrazioni**
  * Estendere il modello `Structure` con i blocchi governance, localizzazione dettagliata, accessibilità, target/regole d’uso, vincoli ambientali e media (fonte dato, stato operatività, destinatari ammessi, policy animali, blackout dates, amenities stagionali, ecc.).
  * Aggiornare `StructureCostOption` con rinomina `booking_deposit`, nuovo `damage_deposit`, `price_per_resource` e campi utilities/pagamenti.
  * Adeguare `structure_open_periods` con flag `blackout` e migrazioni su `indoor_rooms` JSON, `bus_type_access`, `field_slope`, `pitches_tende`, `water_at_field`.
* **Validazioni & regole business**
  * Applicare vincoli su `slug` univoco, coppia `(name, comune)` con warning e controlli `capacity_min ≤ capacity_max`, `pitches_tende ≥ 0`, `parking_car_slots ≥ 0`.
  * Introdurre regole condizionali per `type` (case senza tende, terreni senza indoor) e obblighi per `fire_policy='with_permit'`, `in_area_protetta`, foto outdoor ≥ 3.
  * Generare warning se `utilities_flat` coesiste con `utilities_included` o se mancano `fire_rules`/`ente_area_protetta` quando richiesti.
* **API & import/export**
  * Aggiornare serializer, serializer admin e filtri per esporre i nuovi campi, compresi `contact_status`, `booking_url`, `whatsapp` e `bus_type_access`.
  * Estendere pipeline import/export (CSV/JSON) con mapping e validazioni dei nuovi campi, inclusa gestione `price_per_resource.modifiers`.
  * Aggiornare interfaccia di amministrazione e viste catalogo per editing inline dei nuovi blocchi (accessibilità, vincoli ambientali, logistica avanzata).

#### Metriche di successo

* ≥ 95% delle strutture hanno `fonte_dato` e `data_ultima_verifica` valorizzati dopo il backfill iniziale.
* Riduzione del 50% delle incongruenze logistiche segnalate (tende senza acqua/pendenza non indicata) nelle revisioni mensili.
* 100% degli import automatici applicano i nuovi controlli di validazione senza regressioni sulle performance (< 2s/record batch da 200 righe).

**DoD**

* Migrazioni applicate in staging, UI/admin aggiornati con i nuovi campi, import/export documentati e validazioni attive con report QA firmato.

### M6.2 · Operatività strutture avanzate

**Obiettivi principali**

* Estendere il modello `Structure` con i blocchi operativi richiesti dai campi geocoding, energia, sicurezza e compliance italiana senza rompere i payload esistenti.

#### Task essenziali

* **Schema & migrazioni**
  * Aggiungere colonne ai modelli per i nuovi campi: geocodifica (`plus_code`, `what3words`, `winter_access_notes`, limiti strada/ponti), energia/acqua (potenza, prese, generatori, serbatoi, reflue), sanitari indoor/outdoor, comunicazioni, sicurezza/emergenze, meteo/rischi, spazi/attività, inclusione, regole evento, prenotazioni/documenti, fiscale/pagamenti (incluso `pec_email`), data quality e logistica fine.
  * Definire ENUM e vincoli DB (range numerici, array tipizzati, JSONB per coordinate) e implementare regole condizionali: `dry_toilet` ⇒ `pit_latrine_allowed`, `river_swimming='si'` ⇒ `wildlife_notes` o `risk_assessment_template_url`, `invoice_available`+`country='IT'` ⇒ `sdi_recipient_code` o `pec_email`, `generator_available` ⇒ `power_capacity_kw` obbligatorio, rispetto vincoli indoor/outdoor per `type`.
  * Gestire backfill con default coerenti, loggare violazioni senza bloccare la migrazione.
* **Validazioni & servizi**
  * Implementare validator per IBAN (modulo 97), formato `what3words`, OLC `plus_code`, coordinate emergenza (`lat`/`lon`), URL (HTTP/HTTPS), array/enum e controlli condizionali runtime con warning UI.
  * Aggiornare servizi di filtraggio `/structures/search` con filtri `cell_coverage`, `aed_on_site`, `river_swimming`, `wastewater_type`, soglie `power_capacity_kw` e `parking_car_slots`, `flood_risk`.
* **API & DTO**
  * Estendere schemi Create/Update/Read e serializer senza rompere la compatibilità; aggiornare import/export per gestire i nuovi campi.
  * Aggiornare test API con combinazioni limite e assicurare default sensati su campi opzionali.
* **UI Admin**
  * Introdurre tab dedicate: "Energia e acqua", "Sicurezza ed emergenze", "Meteo e rischi", "Documenti e mappe", "Fiscale e fatturazione" con help text e warning sui vincoli.
  * Aggiungere supporto alle nuove proprietà in moduli admin, filtri e checklist runtime.
* **Test & QA**
  * Coprire validator (IBAN, OLC, what3words, coordinate), regressioni API CRUD/search, e2e UI sulle nuove tab e filtri.

#### Metriche di successo

* 0 errori runtime su validazioni condizionali e nessun regressione sui payload esistenti (copertura test ≥ 90% sulle nuove branch).
* ≥ 80% strutture con dati energia/sicurezza compilati entro il primo ciclo di aggiornamento.
* Filtri catalogo aggiornati utilizzati in ≥ 50% delle sessioni admin nelle 4 settimane successive al rilascio.

**DoD**

* Migrazioni applicate, API/UI pubblicate con warning vincoli attivi, test (unit, API, e2e) verdi e documentazione admin aggiornata.

### M6.3 · Affidabilità, sicurezza dati e rollout controllato

**Obiettivi principali**

* Garantire idempotenza, hardening sicurezza e governance dati prima del rollout beta pubblico con feature flag controllati.

#### Task essenziali

* **Idempotenza & concorrenza**
  * Middleware `Idempotency-Key` su POST/PUT critici con hash corpo+utente+endpoint persistito su Redis (24h) e risposta 409 su replay mutanti.
  * Versionamento ottimistico: colonna `row_version` INT e header ETag/If-Match su `structures`, `events`, `candidates`, `quotes`.
  * Endpoint PATCH disponibilità con lock logico, detection overlap e risposta 409 dettagliata.
* **Security hardening & rate limit**
  * Rate limiting `fastapi-limiter` su rotte pubbliche e import/export; metriche di saturazione.
  * Middleware security headers (HSTS, CSP `'self'` + CDN allowlist, referrer-policy, X-Content-Type-Options, COOP/COEP ove applicabile).
  * Generazione SBOM (Syft) e scansione immagini con Trivy in CI; job settimanale audit dipendenze.
* **Upload & DLP**
  * Servizio upload con scansione ClamAV sidecar e rifiuto file infetti.
  * Mascheramento IBAN/CF/telefoni nei log, blocco MIME non attesi e limiti dimensione/pagine PDF.
* **Data lineage & qualità**
  * Estendere schema `structures` con `field_meta` JSONB (source, verified_by, verified_at) per campi critici.
  * Pipeline import con validazioni hard/soft (motore stile Great Expectations) e report HTML su S3.
  * Servizio dedup: endpoint `/structures/dedup/preview` con punteggio e `/structures/dedup/merge` transazionale con audit.
* **Observability & SLO**
  * Metriche Prometheus per latenza p50/p95, error rate per route, coda RQ, successo import; esposizione `/metrics` harden.
  * Definire SLO: `/structures/search` p95 < 900 ms, error rate < 1%; alert su burn rate.
  * Script k6 per funnel principale + pipeline CI nightly con soglie.
* **Feature flag & rollout**
  * Integrare Unleash (o toggle Redis) con flag `advanced-availability`, `ics-import`, `invoice-sdi`, `escrow-deposit`, `safety-checklist` e gating per ruolo.
  * FE: HOC/hook `useFeatureFlag`; BE: dependency di autorizzazione feature.
* **Privacy & GDPR operativo**
  * Endpoint DSAR: `GET /privacy/dsar/export?user_id=` (ZIP JSON+CSV), `POST /privacy/dsar/erase` (soft-delete/masking legale).
  * CMP frontend per cookie con banner, preferenze, audit eventi consenso; tracciamento consensi su modello `Consent` con base giuridica/scadenza.
* **Ricerca & confronto**
  * Indici PostGIS per coordinate e trigram per `structures.name/address`.
  * Endpoint `/structures/compare?ids=` per tabella comparativa ed export CSV/PDF.
  * Cache risultati filtri frequenti su Redis con chiavi normalizzate.
* **PWA offline & sopralluogo**
  * Workbox caching e sync differito per schede struttura, contatti e checklist.
  * Modulo “Checklist sopralluogo” dinamico (energia, acqua, sicurezza) con salvataggio offline e risoluzione conflitti.
* **Calendari & pagamenti**
  * Import ICS: `POST /structures/{id}/calendar/import` (normalize timezone, dedup UID, crea blocchi disponibilità).
  * `BillingProfile` per struttura; `POST /billing/invoice` mock v1 con validazioni CF/PIVA/SDI.
  * Schema escrow caparre v2 con placeholder PSP e riconciliazione.
* **Webhook, audit & multi-tenant base**
  * Webhook firmati HMAC (`structure.updated`, `event.status_changed`) con retry backoff e idempotenza.
  * Audit trail con catena hash (`prev_hash`) e firma SHA256.
  * Preparare multi-tenant soft: colonna `tenant_id`, policy filtro per ruolo.
* **DevOps & DR**
  * Script blue/green deploy, health-check, hook pre/post migrazione.
  * Backup S3 con Object Lock, test DR mensile automatizzato e PITR PostgreSQL abilitato.
* **Test & qualità**
  * Property-based test per costi e overlap date.
  * Validazione contratti OpenAPI (Schemathesis) in CI, E2E Playwright (compare, import ICS, DSAR export).

#### Metriche di successo

* 0 replay mutanti accettati nei log applicativi; conflitti disponibilità tracciati e risolti < 24h.
* ≥ 99% upload scansionati < 10 s con tasso falsi positivi ClamAV < 0.5%.
* Tutti gli SLO monitorati con alert attivi e synthetic test nightly verdi per 14 giorni consecutivi.

**DoD**

* Migrazioni Alembic applicate, middleware idempotenza e security headers in produzione, feature flag attivi, pipeline metriche/scan operative, documentazione aggiornata (API.md, SECURITY.md, PRIVACY.md, k6 script e checklist DR).

### M7 · Esperienza utente e adozione guidata

**Obiettivi principali**

* Migliorare onboarding, supporto e feedback loop per facilitare l’adozione nei gruppi scout.

#### Task essenziali

* **Onboarding & formazione**
  * Tour guidati contestuali per eventi, preventivi e gestione strutture con checklist completamento.
  * Knowledge base in-app con ricerca, tutorial video e template email verso i gestori delle strutture.
* **Accessibilità e localizzazione**
  * Copertura i18n completa (IT/EN) inclusa documentazione automatica email/notifiche.
  * Audit accessibilità periodico (axe, manuale) con fix di contrasto, focus e scorciatoie.
* **Feedback & analytics**
  * Integrazione PostHog/Matomo per funnel shortlist→preventivo→prenotazione e widget feedback in pagina.
  * Report adozione condiviso con indicatori settimanali e action log.

#### Metriche di successo

* ≥ 90% utenti completano l’onboarding entro 7 giorni dal primo accesso.
* SUS ≥ 80 e miglioramento del 20% nel tasso di completamento preventivi.
* Tutte le principali viste superano verifica accessibilità WCAG 2.1 AA.

**DoD**

* Tour e knowledge base pubblicati, dashboard adozione in uso e audit accessibilità firmato.

### M8 · Estensioni ecosistema e monetizzazione

**Obiettivi principali**

* Abilitare integrazioni esterne, estendere il valore dato ai gruppi e preparare i modelli di revenue.

#### Task essenziali

* **Integrazioni**
  * API pubblica read-only con chiavi e rate limit per condividere strutture con reti territoriali.
  * Sincronizzazione calendari bidirezionale (Google Calendar + ICS) per disponibilità strutture ed eventi.
  * Webhook per CRM/contabilità e marketplace fornitori (catering, trasporti) in beta.
* **Monetizzazione & partnership**
  * Modello tariffario (tier gruppi, organizzazioni partner) con billing manuale iniziale.
  * Reportistica avanzata (Metabase/Looker Studio) per strutture partner con insight utilizzo.
* **Mobile & offline**
  * PWA con cache offline per contatti, documenti e checklist sopralluogo con sincronizzazione differita.

#### Metriche di successo

* ≥ 3 integrazioni attive in beta con feedback positivo.
* 20% delle strutture partner utilizza i report dedicati ogni mese.
* Utenti mobile accedono ai contenuti offline con tasso successo > 95%.

**DoD**

* API pubblica documentata, calendari sincronizzati in staging, primi contratti partner attivi e PWA disponibile sugli store.

### M9 · Automazioni intelligenti e knowledge management

**Obiettivi principali**

* Creare insight proattivi per i capi evento e ridurre il carico manuale tramite automazioni guidate da dati e ML leggero.

#### Task essenziali

* **Machine learning & suggerimenti**
  * Motore raccomandazioni shortlist basato su combinazione di preferenze storiche, disponibilità e feedback post-evento.
  * Stima automatica costi extra (trasporti, cambusa) usando regressione con spiegabilità (SHAP) e range di confidenza.
  * Segmentazione strutture per performance (occupazione, rating) con avvisi per strutture sotto soglia.
* **Automazioni operative**
  * Bot di follow-up email/SMS verso gestori quando i task contatto restano in sospeso oltre SLA definiti.
  * Template dinamici per piani attività evento con checklist derivate da caratteristiche (branca, durata, servizi disponibili).
  * Integrazione con strumenti interni (es. Notion/Confluence) per esportare knowledge base aggiornata automaticamente.
* **Knowledge management**
  * Repository centralizzato di lesson learned con tagging per branca, regione, stagione e ricerca semantica.
  * Workflow di approvazione contenuti con versioning e storicizzazione contributi.

#### Metriche di successo

* ≥ 60% shortlist generate con supporto del motore raccomandazioni e feedback positivo ≥ 4/5.
* Riduzione del 30% dei task contatto scaduti oltre SLA.
* ≥ 70% dei nuovi eventi utilizza almeno un template/checklist generato automaticamente.

**DoD**

* Motore raccomandazioni attivo in beta controllata, automazioni comunicazioni configurabili per evento e knowledge base accessibile via app con ricerca semantica funzionante.

## 7) Piano temporale suggerito (sprint 2 settimane)

* Sprint 1–6: M0–M4 ✅ (completati)
* Sprint 7–9: M5 (governance & compliance)
* Sprint 10–12: M6 (resilienza & osservabilità)
* Sprint 13–15: M6.2 (operatività strutture avanzate)
* Sprint 16–18: M6.3 (affidabilità & rollout controllato)
* Sprint 19–21: M7 (adozione & UX)
* Sprint 22–25: M8 (integrazioni & monetizzazione)
* Sprint 26–29: M9 (automazioni & knowledge)

## 8) API principali (v1, estratto)

* `GET/POST/PUT/DELETE /structures`
* `GET /structures/search?province=&type=&season=&unit=&cost_band=&max_km=`
* `POST /import/structures` · `GET /export/structures?format=xlsx|csv|json`
* `GET /structures/dedup/preview`, `POST /structures/dedup/merge`
* `GET /structures/compare?ids=` · `POST /structures/{id}/calendar/import`
* `GET/POST /events`, `POST /events/{id}/candidates`, `PATCH /events/{id}/candidates/{cid}`
* `POST /events/{id}/contacts` (assign/update state)
* `POST /quotes/calc` → scenari
* `WS /events/{id}/live`
* `GET /privacy/dsar/export`, `POST /privacy/dsar/erase`
* `POST /billing/invoice`
* `POST /webhooks/test` (firma HMAC)

## 9) Test, qualità, osservabilità

* Backend: pytest, property-based test (Hypothesis), mypy, Ruff, Bandit.
* Frontend: Vitest/RTL, Playwright (incl. compare, ICS import, DSAR). Axe per a11y.
* CI: lint+type+unit+e2e, Schemathesis su OpenAPI, k6 nightly con soglie.
* Logs JSON, tracing OpenTelemetry, metrics Prometheus, dashboards Grafana, alert su SLO.

## 10) Privacy, sicurezza, compliance

* Registro trattamenti; base giuridica contatti; opt-in notifiche; CMP cookie con audit consenso.
* Data minimization; retention 24 mesi per log contatto; diritto oblio; workflow DSAR export/erase.
* Crittografia at-rest S3 e in-transit TLS. Segreti via env/secret manager; DLP (masking log, ClamAV upload, MIME whitelist).

## 11) Backlog futuro

* Recensioni interne post-evento e badge qualità struttura.
* Automazioni ML su pricing e suggerimenti shortlist.
* Integrazione pagamenti digitali per caparre/utenze.
* App mobile nativa per sopralluoghi con foto offline.
* Partnership con reti scout internazionali e pacchetti traduzione extra lingue.
* Modulo carbon footprint evento con calcolo emissioni e suggerimenti compensazione.
* Libreria contratti standard per collaborazioni intergruppo e convenzioni regioni.
* Supporto offline avanzato per aree remote con sincronizzazione differita dei media.

## 12) Rischi e mitigazioni

* **Complessità tariffaria** → modello v1 limitato + estensioni versionate.
* **Qualità dati** → import con validazione, ruoli revisori, audit.
* **Disponibilità reale** → regole di conflitto e lock per range date.
* **Adozione** → formazione, guide brevi, KPI di utilizzo, feedback loop.

## 13) Team, governance e dipendenze

* **Team di prodotto**: Product manager, design lead, tech lead FE/BE, data lead e referente operations. Incontri settimanali di allineamento OKR.
* **Riti**: Sprint review condivisa con stakeholder territoriali ogni 4 settimane, retrospettiva cross-team e community update trimestrale.
* **Dipendenze esterne**: Contratti geocoding/OSRM, fornitore PSP, consulenti legali privacy/fiscale, partner infrastruttura (cloud provider, monitoring SaaS).
* **Governance**: Comitato guida con rappresentanti capi regione, revisione roadmap semestrale e gestione risk register centralizzata in docs/risks.

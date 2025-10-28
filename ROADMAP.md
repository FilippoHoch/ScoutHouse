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
* i18n pronto, default IT.

**Backend**

* FastAPI + Pydantic + SQLAlchemy. REST + WebSocket per aggiornamenti di stato.
* Servizi: filtri e disponibilità, matching strutture, calcolo distanze, preventivi.
* Task asincroni: RQ/Celery per import/export, email, ricalcoli.
* Auth: JWT con refresh; ruoli e permessi granulari.

**Dati e integrazioni**

* PostgreSQL; Redis per cache e code. S3 compatibile per allegati.
* Geocoding/distanze: Nominatim + OSRM. Base di distanza = “Gussago Piazza”, override per utente.
* Mail: SendGrid (o analogo). Calendari: iCal export, integrazione GCal in backlog.

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

2. **Eventi e collaborazione**

   * Wizard evento: dettagli → partecipanti → budget → shortlist suggerita.
   * Kanban/Tabella contatti: assegnazioni, stati, note, cronologia.
   * Sincronizzazione disponibilità tra eventi. WebSocket/polling per aggiornamenti.
   * Notifiche email opzionali.

3. **Preventivazione**

   * Regole tariffarie combinabili. Scenari best/realistic/worst.
   * Esportazione PDF/Excel. Versionamento e confronto.

4. **Sicurezza e amministrazione**

   * Auth completa, reset password, inviti, MFA opzionale.
   * Permessi granulari, audit log, allegati su S3.
   * Pannello admin: strutture proposte, utenti, ruoli.

5. **Qualità, osservabilità, privacy**

   * Logging strutturato, Sentry, healthcheck.
   * Backup DB e storage; test restore.
   * Privacy/GDPR: consensi contatti, data retention.

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

### M0 · Fondamenta tecniche

**Obiettivi principali**

* Allestire ambiente di sviluppo condiviso e pipeline CI di base.
* Definire le fondamenta architetturali (monorepo, standard lint/test, scaffolding FE/BE).

#### Task essenziali

* **Backend & API**
  * Inizializzare progetto FastAPI con struttura modulare (`app/api`, `app/core`, `app/models`).
  * Configurare Pydantic settings per ambienti dev/test e gestione segreti `.env`.
  * Preparare connessione a PostgreSQL con SQLAlchemy 2.0 e Alembic baseline.
  * Impostare primi healthcheck (`/healthz`, `/readiness`).
* **Frontend & UX**
  * Bootstrap Vite + React + TypeScript con routing client-side e tema base.
  * Impostare ESLint/Prettier/Stylelint condivisi e Storybook scheletro per UI kit.
  * Creare layout app principale (header, sidebar, contenuto) con responsive breakpoints base.
  * Definire palette colori, tipografia e token design condivisi.
* **DevOps & Tooling**
  * Configurare Docker Compose con servizi `frontend`, `backend`, `db`, `redis` e hot reload.
  * Pipeline GitHub Actions per lint, unit test FE/BE e build immagini base.
  * Script `make`/`just` o `npm run` per setup rapido (`install`, `lint`, `test`, `dev`).
  * Integrare gestione versioni con semantic-release o convenzione `changelog` manuale.
* **QA & Documentation**
  * Aggiornare README con istruzioni locali/CI e mappa servizi.
  * Documentare architettura in `docs/CONCEPT.md` + definire convenzioni commit/branching.
  * Redigere checklist code review + template PR.

#### Task complementari

* Setup Git hooks (pre-commit) per lint automatico.
* Creare script popolamento dati demo minimi (seed JSON/CSV) riutilizzabile.
* Analizzare provider hosting (Railway/Fly/Render) con tabella comparativa costi/limiti.

#### Stretch goal & possibilità

* Prototipo pipeline IaC Terraform con ambienti `dev` e `staging` separati.
* Integrazione SonarQube/SonarCloud per quality gate aggiuntivo.
* Abbozzo design system in Figma condiviso con team.

#### Metriche di successo

* Tempo medio setup nuovo sviluppatore ≤ 30 minuti.
* Pipeline CI < 8 minuti per run completa.
* 100% repository coperte da linting automatico.

**Dipendenze e rischi**

* Scelta provider DB/hosting per evitare lock-in.
* Allocare tempo per automatizzare seeding dati fittizi.
* Coordinare gestione segreti per ambienti locali vs CI.

**DoD**

* `docker compose up` lancia FE/BE, test unitari base verdi, README aggiornato e pipeline CI attiva.
* Checklist onboarding completata e documentazione firmata dal team.

### M1 · Catalogo minimo

**Obiettivi principali**

* Offrire la prima versione del catalogo strutture con CRUD, ricerca base e calcolo distanza.

#### Task essenziali

* **Backend & API**
  * Implementare modelli `Structure`, servizi filtri (provincia, tipologia) e ricerca full-text base.
  * Endpoint REST `GET/POST/PUT/PATCH/DELETE /structures` con validazioni Pydantic.
  * Calcolo distanza da “Gussago Piazza” tramite servizio dedicato e caching Redis.
  * Validazioni coordinate geografiche e normalizzazione indirizzi.
* **Frontend & UX**
  * Pagina elenco strutture con card responsive, barra filtri, ricerca testuale e paginazione.
  * Pagina dettaglio con tab info principali (descrizione, servizi, contatti essenziali).
  * Gestione errori (toast) e stato loading con skeleton.
  * Componenti riutilizzabili per filtri (select provincia, toggle tipologia, slider distanza).
* **Data & Integrazioni**
  * Import CSV/XLSX con validazione step-by-step, export CSV.
  * Setup seeds iniziali (5-10 strutture) per demo interna.
  * Normalizzare servizi (tag) con dizionario condiviso.
* **DevOps & QA**
  * Playwright e2e: ricerca → visualizza → crea struttura.
  * Coverage modelli backend ≥80%; monitorare performance query con SQLAlchemy.
  * Pipeline per test smoke su endpoint `GET /structures` ad ogni deploy.

#### Task complementari

* Implementare filtro mappa (bounding box) come prova di concetto.
* Creare dashboard Grafana iniziale con metriche visite catalogo.
* Definire naming convention immagini e compressione automatica.

#### Stretch goal & possibilità

* Sperimentare suggerimenti strutture correlate (basato su servizi simili).
* Implementare salvataggio ricerche preferite per utente.
* Prototipare vista lista/kanban alternative per presentazione strutture.

#### Metriche di successo

* Tempo medio risposta ricerca ≤ 500ms (dataset demo).
* ≥ 5 strutture create e aggiornate senza errori di validazione.
* Tasso errore import < 2% su file di prova.

**Dipendenze e rischi**

* Validare limiti rate API geocoding; prevedere fallback offline.
* Gestire indirizzi non standard (montagna) con geocoding manuale.

**DoD**

* Utente può ricercare, visualizzare, creare e modificare strutture; test e2e e coverage rispettano target.
* Metriche monitorate in dashboard base e condivise in retro.

### M2 · Dati ricchi struttura

**Obiettivi principali**

* Arricchire le schede struttura con stagionalità, costi dettagliati e allegati.

#### Task essenziali

* **Backend & API**
  * Modelli `StructureSeasonAvailability` e `StructureCostOption` con regole di validazione.
  * Endpoint per allegati (upload S3 compatibile) e gestione versionamento documenti.
  * Servizi per calcolo costi preliminare dato un profilo evento.
  * Validazione consistenza tra disponibilità e costi con transazioni atomiche.
* **Frontend & UX**
  * Wizard/modulo a più sezioni per creare/aggiornare struttura con validazioni dinamiche.
  * UI per tab costi, disponibilità stagionali, servizi extra; anteprima allegati.
  * Indicatore qualità dati (percentuale campi completi) e suggerimenti miglioramento.
  * Visualizzazione timeline stagionalità e prezzi in grafici.
* **Data & Integrazioni**
  * Pipeline import per availability/cost option da fogli Excel (mapping colonne configurabile).
  * Gestione allegati grandi con upload chunked e anti-virus opzionale.
  * Normalizzare listini storici e possibilità di versioning con data validità.
* **DevOps & QA**
  * Test calcolo costi con fixture evento “dry-run”.
  * A11y audit automatico (axe) sulle pagine catalogo/dettaglio.
  * Test di regressione sulle importazioni con dataset ampio (≥ 200 righe).

#### Task complementari

* Implementare anteprima PDF/immagini in-app per allegati principali.
* Creare checklist qualità dati condivisa con amministratori catalogo.
* Introdurre tagging automatico servizi tramite NLP leggero sui documenti.

#### Stretch goal & possibilità

* Simulare scenario costi multi-struttura per valutare pacchetti gemelli.
* Esplorare pricing dinamico basato su domanda stagionale (insight analitici).
* Collegare API Meteo per suggerire periodi con clima favorevole.

#### Metriche di successo

* ≥ 80% strutture con dati completi su disponibilità e costi.
* Tempo medio generazione preventivo “dry-run” ≤ 2s.
* Riduzione errori import costi < 1% dopo validazioni.

**Dipendenze e rischi**

* Garantire coerenza fra costi e disponibilità quando si aggiornano record.
* Gestire spazio storage per allegati e politiche retention.

**DoD**

* Preventivo “dry-run” per struttura singola produce risultati coerenti; checklist accessibilità senza errori critici.
* Dashboard qualità dati aggiornata e condivisa con stakeholder.

### M3 · Eventi e workflow contatti

**Obiettivi principali**

* Abilitare la gestione eventi, assegnazione contatti e collaborazione realtime.

#### Task essenziali

* **Backend & API**
  * Modelli `Event`, `EventStructureCandidate`, `EventContactTask`, `EventParticipantSummary`.
  * Endpoint CRUD eventi con validazioni su date, partecipanti, budget.
  * WebSocket (o polling ottimizzato) per aggiornamenti stato contatti e candidature.
  * Audit log eventi e attività contatti.
  * Calcolo suggerimenti shortlist basato su disponibilità e distanza.
* **Frontend & UX**
  * Wizard evento multi-step (dettagli → partecipanti → budget → shortlist suggerita).
  * Dashboard eventi con vista Kanban/tabellare per contatti e timeline aggiornamenti.
  * Collaborazione realtime (presence indicator, aggiornamenti toast) + ruoli permesso.
  * Gestione task contatti con reminder e timeline attività.
* **Data & Integrazioni**
  * Sincronizzazione disponibilità struttura-evento, gestione conflitti e suggerimenti alternative.
  * Template email per follow-up contatti, invio manuale/automatico.
  * Log integrazioni per monitorare esiti email/contatti.
* **DevOps & QA**
  * Test integrazione che due utenti vedano aggiornamenti live nella stessa pagina.
  * Monitor WebSocket con metrics (uptime, messaggi) e alert soglie.
  * Test carico leggero su notifiche realtime (≥ 50 eventi/min).

#### Task complementari

* Implementare chat/commenti contestuali all'evento.
* Esportazione timeline evento in PDF per briefing riunioni.
* Analisi adoption: numero task contatto completati per evento.

#### Stretch goal & possibilità

* Integrazione calendari condivisi (pubblicazione ICS automatica per eventi confermati).
* AI assistant per suggerire messaggi follow-up ai contatti.
* Modalità offline app mobile per aggiornare contatti sul campo.

#### Metriche di successo

* Tempo medio aggiornamento stato contatto < 2s tra client sincronizzati.
* ≥ 90% eventi con shortlist generata automaticamente.
* Riduzione attività manuali (email fuori piattaforma) misurata tramite survey.

**Dipendenze e rischi**

* Necessità definire policy concorrenza su candidature; gestire rollback su errori WebSocket.
* Garantire sicurezza WebSocket (auth, rate limit, timeouts).

**DoD**

* Due utenti connessi vedono aggiornamenti in tempo reale, audit log registra cambi, test integrazione superati.
* Report settimanale utilizzo eventi disponibile per stakeholder.

### M4 · Preventivazione

**Obiettivi principali**

* Fornire motore preventivi versionato con esportazioni professionali.

#### Task essenziali

* **Backend & API**
  * Motore calcolo scenari best/realistic/worst con regole combinabili (costi fissi, variabili, tasse).
  * Versionamento `Quote`, confronto differenze e storicizzazione.
  * API per generazione PDF/Excel (servizio Celery/RQ) e notifiche completamento.
  * Gestione stato preventivo (bozza, inviato, accettato, rigettato) con audit.
* **Frontend & UX**
  * Interfaccia comparativa preventivi (tab/scenario) con evidenza differenze e grafici.
  * Editor voci personalizzate (sconti, extra) e allegati preventivo.
  * Azioni esporta (download) e invia via email con stato processo.
  * Panoramica storico versioni con diff visuale.
* **Data & Integrazioni**
  * Template PDF brandizzato; integrazione con storage per storico documenti.
  * Sincronizzazione con budget evento e avvisi se si superano soglie.
  * Registro prezzi di riferimento per benchmarking automatico.
* **DevOps & QA**
  * Suite test con fixture expected: errore <5% per scenari generati.
  * Monitor code worker (retry policy, dead letter queue) e alert.
  * Test prestazionali calcolo (p95 < 1s per 3 scenari su evento medio).

#### Task complementari

* Integrazione firma digitale su preventivo inviato.
* Template email personalizzabile con merge tag.
* Dashboard KPI margine preventivi vs budget.

#### Stretch goal & possibilità

* Simulatore “what-if” con slider partecipanti/budget.
* Suggerimenti AI per ottimizzare costi (es. alternative più economiche).
* Integrazione pagamento acconti tramite provider (Stripe/PayPal) con riconciliazione.

#### Metriche di successo

* ≥ 95% preventivi generati senza errori.
* Tempo medio generazione documento ≤ 30s (incluso rendering PDF).
* Almeno 3 versioni preventivo per evento con differenze tracciate.

**Dipendenze e rischi**

* Rischio performance calcolo su dataset grandi: predisporre profiling e caching.
* Gestire aggiornamenti template PDF senza downtime.

**DoD**

* Differenza tra preventivo calcolato e expected fixture <5%; export PDF/Excel riuscito e versionamento verificato.
* Stakeholder validano layout documento e workflow invio.

### M5 · Accesso, ruoli, sicurezza

**Obiettivi principali**

* Mettere in sicurezza la piattaforma e introdurre gestione ruoli avanzata.

#### Task essenziali

* **Backend & API**
  * Implementare auth completa (registrazione/inviti, reset password, refresh token, MFA opzionale).
  * RBAC con ruoli predefiniti (admin, capo evento, collaboratore, viewer) e permessi granulari per endpoint.
  * Rate limiting API, logging sicurezza, audit accessi e gestione sessioni attive.
  * Gestione sessioni attive con revoca centralizzata.
* **Frontend & UX**
  * Flussi UI per login, reset, inviti, gestione ruoli utenti, session management.
  * Pagina amministrazione utenti con filtri, bulk actions, audit trail.
  * Banner/alert sicurezza (password deboli, MFA mancante).
  * Pagina impostazioni personali (token, dispositivi riconosciuti, preferenze sicurezza).
* **DevOps & Compliance**
  * Hardening Docker/images, scansione vulnerabilità (Dependabot, Trivy, pip-audit).
  * Policy backup cifrati, rotazione chiavi, gestione segreti (Vault/SSM).
  * Review OWASP ASVS L1, check GDPR (consensi, privacy policy, registro trattamenti).
  * Piano incident response con ruoli e runbook.
* **QA & Supporto**
  * Test autorizzazioni su 10 endpoint critici + e2e multi-ruolo.
  * Run periodico sicurezza (ZAP baseline) e piani incident response.
  * Simulazioni phishing/social engineering interne per sensibilizzazione.

#### Task complementari

* Implementare login social (ScoutNet, Google) mantenendo sicurezza.
* Audit log esportabile e integrabile con SIEM esterno.
* Programma bug bounty interno con checklist submission.

#### Stretch goal & possibilità

* MFA hardware key (WebAuthn) per amministratori.
* Alert comportamenti anomali (es. download massivi) con machine learning leggero.
* Cruscotto sicurezza tempo reale con KPI (login falliti, MFA attivi, sessioni aperte).

#### Metriche di successo

* 100% endpoint critici coperti da test autorizzazione automatizzati.
* ≥ 70% utenti admin con MFA attivo entro due settimane dalla release.
* Nessun CVE alto aperto oltre 7 giorni.

**Dipendenze e rischi**

* Coordinare compliance con consulente privacy; gestione MFA SMS/email costi.
* Gestire provisioning hardware key e training utenti.

**DoD**

* Tutti gli endpoint protetti rispettano permessi, checklist ASVS L1 completata, audit accessi attivo.
* Report sicurezza condiviso con board e piano incident response testato.

### M6 · Strategia di testing end-to-end

Per garantire copertura su tutti i casi d'uso, la roadmap include una batteria di test progressiva e multilivello.

#### Task essenziali

1. **Unit test backend**
   * Validazione schemi Pydantic per ogni entità (`Structure`, `Event`, `Quote`, ecc.).
   * Branch coverage su servizi critici: filtri strutture, calcolo disponibilità, generazione preventivi.
   * Test parametrizzati per tutte le combinazioni di stagioni, unità scout e fasce di costo.
   * Test di error handling (input invalido, risorse mancanti, limiti di quota).

2. **Unit test frontend**
   * Test componenti UI con casi edge (filtri vuoti, dati massimi, errori API).
   * Snapshot per varianti responsive e localizzazioni IT/EN.
   * Test di accessibilità automatizzati (axe) per modali, wizard e tabelle.

3. **Contract e API testing**
   * Suite OpenAPI generata automaticamente con validazione schema requests/responses.
   * Test end-to-end delle principali rotte (`/structures`, `/events`, `/quotes`) con ruoli utente differenti.
   * Mock integrazioni esterne (geocoding, email) con casi di successo/fallimento/retry.

4. **End-to-end & scenari utente**
   * Percorsi completi: creazione struttura → shortlist evento → generazione preventivo → invio contatti.
   * Test di concorrenza (due utenti che modificano lo stesso evento) e resilienza a riconnessioni.
   * Verifiche mobile/desktop con Playwright (viewport differenti) e regressioni visive.

5. **Quality gates CI/CD**
   * Coverage minimo 85% backend e 80% frontend, con trend monitorato in CI.
   * Linting (ESLint, Prettier, Ruff) + security scans (Bandit, npm audit) blocking.
   * Performance smoke test per endpoint critici (p95 latenza, limiti rate limiting).

6. **Testing operazionale**
   * Disaster recovery: restore backup DB e verifica integrità allegati.
   * Chaos test su code asincrone (task falliti, reti lente) con metriche di retry.
   * Verifica manuale checklist GDPR (diritto all'oblio, export dati) per release candidate.

#### Task complementari

* Integrare report qualità in Notion/Confluence con aggiornamento automatico.
* Creare calendario test regressione manuale per release maggiore.
* Workshop formazione QA per volontari/capi reparto coinvolti nel testing.

#### Stretch goal & possibilità

* Automazione test non funzionali (resilienza rete, consumo risorse) con k6/Loki.
* Analisi statiche sicurezza avanzate (Semgrep personalizzato).
* Gamification bug bash con leaderboard interna.

#### Metriche di successo

* Trend coverage positivo per 3 sprint consecutivi.
* Numero bug critici post-release < 2 per trimestre.
* Rapporto test automatici/manuali documentato e aggiornato.

**DoD**: pipeline CI/CD con coverage e2e ≥ obiettivi, suite Playwright nightly e report condiviso.

### M7 · Rifiniture e release

**Obiettivi principali**

* Ottimizzare performance, completare localizzazione e preparare go-live controllato.

#### Task essenziali

* **Performance & UX**
  * Cache filtri e risultati frequenti lato backend/frontend.
  * Compressione immagini, lazy loading e ottimizzazione bundle.
  * Audit Core Web Vitals e interventi mirati.
* **Localizzazione & contenuti**
  * Traduzioni complete IT/EN con validazione stakeholder.
  * Guida utenti (video/microlearning) e FAQ integrate in-app.
* **Operazioni & supporto**
  * Playbook monitoraggio produzione (alert, dashboards, on-call rota).
  * Automazione backup (DB, storage) e test ripristino.

#### Task complementari

* Setup helpdesk (email/ticketing) e flusso triage richieste.
* Preparare comunicazione lancio (newsletter, social, blog post).
* Valutare analytics prodotto (PostHog/Matomo) per misurare adozione.

#### Stretch goal & possibilità

* Modalità demo guidata per nuovi utenti.
* Programma beta testing con feedback raccolti via survey.
* Automazione traduzioni continue con pipeline i18n.

#### Metriche di successo

* LCP < 2,5s su pagine principali.
* ≥ 90% stringhe tradotte e verificate.
* Test ripristino DB completato in < 30 minuti.

**DoD**: staging pubblico; runbook; prova ripristino DB riuscita.

### M8 · Rifinitura interfaccia e integrazione API

**Obiettivi principali**

* Allineare esperienza utente a concept e requisiti, consolidando integrazione API.

#### Task essenziali

* **Design system & UI**
  * Revisione componenti (cards, modali, tabelle, grafici) rispetto a guidelines.
  * Aggiornamento token design (spaziatura, tipografia, colori) e documentazione Storybook.
* **Esperienza utente**
  * Miglioramento UX per flussi chiave (catalogo, eventi, preventivi) con test moderati.
  * Copywriting coerente e microinterazioni (tooltip, empty state, success/error state).
* **Integrazione API**
  * Ottimizzare orchestrazione chiamate (batching, caching client) e gestione errori.
  * Validare sicurezza API lato client (refresh token, retry, logout forzato su 401).

#### Task complementari

* Implementare dark mode/light mode con preferenza utente.
* Aggiornare libreria icone e illustrazioni con brand personalizzato.
* Organizzare sessione di testing con capi scout reali e raccogliere insight.

#### Stretch goal & possibilità

* Prototipo responsive avanzato (mobile-first) con gesture ottimizzate.
* Integrazione progressive web app (PWA) con offline caching selettivo.
* Setup design tokens sincronizzati tra Figma e repository.

#### Metriche di successo

* SUS score ≥ 80 dai test moderati.
* Riduzione bounce rate in flusso preventivo del 20%.
* Nessun warning axe-core su componenti principali.

**DoD**: scenari end-to-end documentati con verifiche UX/API e checklist accessibilità aggiornata.

### M9 · Indicizzazione e ricerca avanzata

**Obiettivi principali**

* Abilitare ricerca intelligente su strutture, eventi e preventivi con feedback continuo.

#### Task essenziali

* **Backend & Search**
  * Strategia di indicizzazione incrementale per strutture, eventi e preventivi.
  * Integrazione motore (PostgreSQL full-text o ElasticSearch) con ranking personalizzato.
  * Gestione sinonimi, stemming e filtri avanzati (servizi, fascia prezzo, disponibilità).
* **Frontend & UX**
  * Barra ricerca globale con suggerimenti e highlight termini.
  * Risultati categorizzati (tab strutture/eventi/preventivi) e filtri dinamici.
  * Feedback qualità direttamente dall'interfaccia (thumbs up/down, note).
* **Data & Analytics**
  * Monitoraggio qualità risultati con metriche precision/recall.
  * Raccolta query più frequenti e analisi zero-result.
  * Automatizzare retraining dizionari sinonimi.

#### Task complementari

* Integrazione ricerca vocale sperimentale (browser supportato).
* Esplorare motore vettoriale per ricerca semantica (OpenSearch vector). 
* Dashboard Notion/Looker con insight ricerche.

#### Stretch goal & possibilità

* Suggerimenti proattivi basati su eventi in pianificazione.
* Integrazione feedback qualitativi da survey post-evento nella rilevanza.
* API pubblica per ricerca condivisa con altri gruppi scout.

#### Metriche di successo

* ≥ 85% query con risultato utile (feedback positivo).
* Riduzione query “zero results” del 50%.
* Tempo risposta ricerca avanzata ≤ 700ms p95.

**DoD**: pipeline di indicizzazione attiva in CI/CD e dashboard metriche ricerca popolata.

## 7) Piano temporale suggerito (sprint 2 settimane)

* Sprint 1: M0
* Sprint 2–3: M1
* Sprint 4: M2 (availability/costi)
* Sprint 5–6: M3
* Sprint 7: M4
* Sprint 8: M5
* Sprint 9: M6
* Sprint 10: M7
* Sprint 11: M8
* Sprint 12+: M9 e hardening continuo

## 8) API principali (v1, estratto)

* `GET/POST/PUT/DELETE /structures`
* `GET /structures/search?province=&type=&season=&unit=&cost_band=&max_km=`
* `POST /import/structures` · `GET /export/structures?format=xlsx|csv|json`
* `GET/POST /events`, `POST /events/{id}/candidates`, `PATCH /events/{id}/candidates/{cid}`
* `POST /events/{id}/contacts` (assign/update state)
* `POST /quotes/calc` → scenari
* `WS /events/{id}/live`

## 9) Test, qualità, osservabilità

* Backend: pytest, mypy, Ruff, Bandit.
* Frontend: Vitest/RTL, Playwright. Axe per a11y.
* CI: lint+type+unit+e2e. Artifact build FE/BE.
* Logs JSON, tracing OpenTelemetry, metrics Prometheus, dashboards Grafana.

## 10) Privacy, sicurezza, compliance

* Registro trattamenti; base giuridica contatti; opt-in notifiche.
* Data minimization; retention 24 mesi per log contatto; diritto oblio.
* Crittografia at-rest S3 e in-transit TLS. Segreti via env/secret manager.

## 11) Backlog futuro

* Recensioni interne post-evento.
* Sync calendari bidirezionale.
* App mobile sopralluoghi.
* API pubblica read-only multi-gruppo.
* Suggerimenti ML su feedback e costi.

## 12) Rischi e mitigazioni

* **Complessità tariffaria** → modello v1 limitato + estensioni versionate.
* **Qualità dati** → import con validazione, ruoli revisori, audit.
* **Disponibilità reale** → regole di conflitto e lock per range date.
* **Adozione** → formazione, guide brevi, KPI di utilizzo, feedback loop.

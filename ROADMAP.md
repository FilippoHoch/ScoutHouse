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

### Stato avanzamento e priorità

La codebase ha completato le fondamenta previste dalle milestone M0–M4:

* **Infrastruttura e DevOps**: monorepo con Docker Compose, CI GitHub Actions, metriche Prometheus e backup automatici.
* **Catalogo strutture**: ricerca avanzata (`/structures/search`), import/export CSV/XLSX, anagrafiche complete con contatti, costi e disponibilità.
* **Eventi e collaborazione**: wizard eventi, candidature con sincronizzazione stato in tempo reale (SSE), task contatti e gestione team.
* **Preventivi**: calcolo scenari, versioning quote, export XLSX/HTML e notifiche email tramite RQ.
* **Allegati & audit**: storage S3-compatibile con firma temporanea, audit log centralizzato e seeding dataset.

Le prossime milestone si concentrano su sicurezza, qualità, operatività e adozione.

### M5 · Sicurezza e compliance estesa

**Obiettivi principali**

* Rafforzare il controllo accessi e coprire i requisiti GDPR/ASVS prima del go-live pubblico.

#### Task essenziali

* **Backend & API**
  * Evolvere il modello permessi oltre `is_admin`, introducendo ruoli granulari per strutture ed eventi (lettura/scrittura/moderazione) e tabelle pivot dedicate.
  * Implementare MFA (TOTP/WebAuthn) con gestione dispositivi e enforcement per ruoli sensibili.
  * Esporre endpoint di gestione sessioni attive/refresh token (lista e revoca) e completare gli audit su `Attachment`, `Quote` e `Event` con dettagli ip/user-agent.
  * Arricchire rate limiting SlowAPI con bucket per autenticazione e export, più log di sicurezza strutturati.
* **Frontend & UX**
  * Creare dashboard amministrativa per gestione utenti/ruoli, revisione audit log e chiusura sessioni attive.
  * Offrire flusso di attivazione MFA con verifica backup codes e indicatori di sicurezza account.
  * Surface avvisi di compliance (consensi, data-retention) nelle schede struttura/evento.
* **Compliance & Ops**
  * Formalizzare criteri data-retention per allegati e log, con job programmati di purge e reportistica.
  * Integrare scansioni dipendenze (Dependabot, Trivy, pip-audit, npm audit) nel workflow CI e documentare il processo di remediation.
  * Stesura DPIA, Registro trattamenti e playbook incident response con esercitazione tabletop.

#### Metriche di successo

* 100% endpoint sensibili coperti da test autorizzazione automatici.
* ≥ 70% degli amministratori con MFA attivo entro due settimane dal rilascio.
* Nessun CVE alto aperto oltre 7 giorni.

**DoD**

* Matrice ruoli/permessi approvata, audit log arricchito e UI amministrativa in produzione con checklist ASVS L1 completata.

### M6 · Qualità automatizzata e resilienza

**Obiettivi principali**

* Consolidare copertura test e garantire resilienza degli scenari collaborativi (SSE, queue email, import massivi).

#### Task essenziali

* **Testing**
  * Portare coverage backend ≥ 85% includendo servizi `attachments`, `quotes` e `events` con casi di concorrenza.
  * Introdurre contract test generati da OpenAPI e test end-to-end Playwright multi-utente (aggiornamenti live, preventivi condivisi).
  * Automatizzare test axe-core e snapshot responsivi per pagine principali.
* **Performance & resilienza**
  * Stress test su import/export e generazione quote (k6) con monitoraggio p95 < 1s per API critiche.
  * Chaos testing leggero su coda RQ e storage S3 (timeout/retry) con alert Prometheus/Grafana.
  * Verifica disaster recovery: restore backup + ripristino allegati firmati.
* **Developer Experience**
  * Pipeline nightly con suite estese, badge qualità e report su docs/OPS.
  * Template PR arricchito con checklist sicurezza/tests e gating automatico per lint/format.

#### Metriche di successo

* Trend coverage positivo per 3 sprint consecutivi.
* 0 regressioni critiche individuate in staging durante due rilasci consecutivi.

**DoD**

* Pipeline CI/CD blocca merge privi di test, dashboard qualità condivisa con storico esecuzioni e run disaster-recovery documentato.

### M7 · Readiness operativa e localizzazione

**Obiettivi principali**

* Preparare il rollout controllato con supporto multilingua, osservabilità ampliata e playbook operativi.

#### Task essenziali

* **Prodotto & UX**
  * Estendere i18n (EN/IT) coprendo l'intero frontend e le email (`frontend/src/i18n`, `backend/app/templates/mail`).
  * Ottimizzare bundle React (code splitting, lazy loading), compressione asset e caching lato CDN.
  * Implementare knowledge base in-app (FAQ, tutorial video) e onboarding guidato.
* **Ops**
  * Cruscotti Grafana per eventi, preventivi, code email e storage; alerting su errori/latency.
  * Automazione backup con test restore programmati e retention documentata.
  * Helpdesk/ticketing collegato a incident response, con template comunicazioni verso i capi.

#### Metriche di successo

* LCP < 2.5s su `/structures` e `/events/:id` con dati realistici.
* ≥ 90% stringhe tradotte e validate da stakeholder.
* Playbook operativi approvati e simulazione on-call completata.

**DoD**

* Ambiente staging pubblico con monitoraggio attivo, guida utenti disponibile e prova restore eseguita con successo.

### M8 · UX evoluta e adoption

**Obiettivi principali**

* Allineare il design system, migliorare microinterazioni e facilitare l'adozione continua.

#### Task essenziali

* Design system centralizzato (Storybook con token condivisi) e dark mode opzionale.
* Revisione flussi chiave basata su test moderati con capi scout reali, includendo empty/error state raffinati.
* PWA con cache offline selettiva per consultare contatti e documenti in mobilità.
* Analisi funnel (PostHog/Matomo) e widget feedback rapidi in app.

#### Metriche di successo

* SUS ≥ 80 e Net Promoter Score positivo nei test pilota.
* Riduzione bounce rate del 20% nel flusso preventivi.

**DoD**

* Libreria UI versionata, risultati UX documentati e features mobile-ready distribuite.

### M9 · Ricerca e insight avanzati

**Obiettivi principali**

* Potenziare discovery e reporting basandosi sui dati raccolti.

#### Task essenziali

* Integrazione motore ricerca avanzato (Postgres FTS + sinonimi o ElasticSearch) con ranking personalizzato per strutture/eventi/preventivi.
* Ricerca globale nel frontend con suggerimenti, filtri dinamici e feedback di rilevanza.
* Dashboard insight (Looker Studio/Metabase) su utilizzo catalogo, conversioni shortlist→preventivi e saturazione strutture.
* Job di indicizzazione incrementale con monitoraggio e alert.

#### Metriche di successo

* ≥ 85% query con feedback positivo, riduzione del 50% delle ricerche “zero results”.
* Tempo risposta ricerca avanzata ≤ 700 ms p95.

**DoD**

* Pipeline indicizzazione attiva, dashboard insight condivisa e feedback loop utenti implementato.

## 7) Piano temporale suggerito (sprint 2 settimane)

* Sprint 1–6: M0–M4 ✅ (completati)
* Sprint 7–9: M5 (sicurezza) + audit DPIA
* Sprint 10–12: M6 (quality & resilienza)
* Sprint 13–15: M7 (readiness) con rollout pilota
* Sprint 16–18: M8 (UX/adoption)
* Sprint 19–20: M9 (ricerca & insight)

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

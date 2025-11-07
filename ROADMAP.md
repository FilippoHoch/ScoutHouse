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

## 7) Piano temporale suggerito (sprint 2 settimane)

* Sprint 1–6: M0–M4 ✅ (completati)
* Sprint 7–9: M5 (governance & compliance)
* Sprint 10–12: M6 (resilienza & osservabilità)
* Sprint 13–15: M7 (adozione & UX)
* Sprint 16–18: M8 (integrazioni & monetizzazione)

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

* Recensioni interne post-evento e badge qualità struttura.
* Automazioni ML su pricing e suggerimenti shortlist.
* Integrazione pagamenti digitali per caparre/utenze.
* App mobile nativa per sopralluoghi con foto offline.
* Partnership con reti scout internazionali e pacchetti traduzione extra lingue.

## 12) Rischi e mitigazioni

* **Complessità tariffaria** → modello v1 limitato + estensioni versionate.
* **Qualità dati** → import con validazione, ruoli revisori, audit.
* **Disponibilità reale** → regole di conflitto e lock per range date.
* **Adozione** → formazione, guide brevi, KPI di utilizzo, feedback loop.

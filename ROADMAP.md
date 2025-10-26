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

* Monorepo, Docker dev, CI lint+test.
* FastAPI “hello”, Vite React “hello”.
* Schema ER iniziale + Alembic baseline.
  **DoD**: `docker compose up` lancia FE/BE; test unit base verdi; README aggiornato.

### M1 · Catalogo minimo

* CRUD `Structure` con filtri base; calcolo distanza da “Gussago Piazza”.
* FE lista + card + dettaglio; ricerca; paginazione.
* Import/Export CSV/XLSX base.
  **DoD**: e2e ricerca e creazione struttura con Playwright; 80% coverage modelli.

### M2 · Dati ricchi struttura

* Availability stagionali, unità; CostOption complete.
* Modulo form struttura con validazioni; upload allegati su S3.
  **DoD**: preventivo “dry-run” per una struttura singola; accessibility check automatico.

### M3 · Eventi e workflow contatti

* Modelli `Event`, `EventStructureCandidate`, `EventContactTask`.
* Wizard evento; dashboard eventi; tabella contatti con stati.
* WebSocket/polling per aggiornamenti; audit log.
  **DoD**: due utenti vedono aggiornamenti in tempo reale sulla stessa pagina evento.

### M4 · Preventivazione

* Motore calcolo con scenari; versionamento `Quote`.
* Esportazione PDF/Excel; confronto per struttura.
  **DoD**: differenza tra preventivo calcolato e expected fixture < 5% su suite test.

### M5 · Accesso, ruoli, sicurezza

* Auth completa, reset, inviti, ruoli e permessi.
* Rate limiting, CSRF dove serve, MFA opzionale.
  **DoD**: test autorizzazioni su 10 endpoint critici; OWASP ASVS checklist L1.

### M6 · Rifiniture e release

* Performance (cache filtri, compressione, lazy immagini).
* Localizzazione pronta; guide utenti; monitoraggio e backup automazione.
  **DoD**: staging pubblico; runbook; prova ripristino DB riuscita.

### M7 · Rifinitura interfaccia e integrazione API

* Revisione del design system e dei componenti UI rispetto a requisiti e concept.
* Miglioramento UX per flussi chiave (catalogo, eventi, preventivi) valorizzando le API disponibili.
* Audit accessibilità e performance con ottimizzazione di layout, stati e messaggi di feedback.
  **DoD**: scenari end-to-end documentati con verifiche UX/API e checklist accessibilità aggiornata.

### M8 · Indicizzazione e ricerca avanzata

* Strategia di indicizzazione per strutture, eventi e preventivi con aggiornamenti incrementali.
* Integrazione motore di ricerca (PostgreSQL full-text/Elastic) e ottimizzazione del ranking.
* Monitoraggio qualità risultati con metriche di precision/recall e feedback utenti.
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
* Sprint 11+: M8 e hardening continuo

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

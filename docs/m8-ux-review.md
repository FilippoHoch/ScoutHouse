# M8 – UX refinement, API integration & accessibility audit

## End-to-end scenarios
- **Catalogo strutture**: filtro per provincia e fascia di costo, salvataggio stato, visualizzazione card con distanza/costi, apertura mappa esterna. Verificato aggiornamento query `/api/v1/structures` con parametri `province`, `cost_band`, `page_size` e paginazione accessibile.
- **Gestione eventi**: ricerca per titolo, filtro stato, creazione evento tramite wizard a tre step con suggerimenti candidati (API `/api/v1/events`, `/api/v1/events/{id}/suggestions`). Prefetch dettagli evento per navigazione rapida.
- **Preventivi eventi**: selezione struttura candidata, calcolo preventivo (`/api/v1/quotes/calc`), salvataggio scenario (`/api/v1/events/{id}/quotes`) ed export (`/api/v1/quotes/{id}/export`). Confronto scenari e override parametri confermati.

## UX & API verification
- Nuovo design system con pulsanti, superfici, toolbar e badge coerenti nei flussi principali.
- Stati caricamento/in errore annunciati con `aria-live` e scheletri visivi per richieste `react-query`.
- Chiamate API riutilizzano cache `react-query` e invalidazioni puntuali (`structures`, `events`, `quotes`).
- Navigazione principale aggiornata con `NavLink` per `aria-current`, skip link testato via tastiera.

## Accessibility & performance checklist
- Contrasto colori rivisto (palette basata su `--color-primary`/`--color-secondary`).
- Componenti interattivi con target minimo 44px, focus visibile, pulsanti secondari non solo colore.
- Tabelle responsive con wrapper scrollabile e intestazioni contestuali.
- Ridotti layout shift applicando skeleton e lazy-loading globale su immagini/iframe.
- Tutti i form dispongono di etichette associate; messaggi di errore annunciati tramite `InlineMessage` (`aria-live="polite"`).

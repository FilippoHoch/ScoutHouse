
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  addCandidate,
  createEvent,
  getEvents,
  getSuggestions
} from "../shared/api";
import { Event, EventBranch, EventSuggestion, EventStatus, EventCreateDto } from "../shared/types";

const branches: EventBranch[] = ["LC", "EG", "RS", "ALL"];
const statuses: EventStatus[] = ["draft", "planning", "booked", "archived"];

type WizardStep = 1 | 2 | 3;

interface WizardState {
  title: string;
  branch: EventBranch;
  start_date: string;
  end_date: string;
  participants: {
    lc: number;
    eg: number;
    rs: number;
    leaders: number;
  };
  budget_total: string;
  notes: string;
  status: EventStatus;
}

const defaultWizardState: WizardState = {
  title: "",
  branch: "LC",
  start_date: "",
  end_date: "",
  participants: { lc: 0, eg: 0, rs: 0, leaders: 0 },
  budget_total: "",
  notes: "",
  status: "draft"
};

interface EventWizardProps {
  onClose: () => void;
  onCreated: (event: Event) => void;
}

const EventWizard = ({ onClose, onCreated }: EventWizardProps) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [state, setState] = useState<WizardState>(defaultWizardState);
  const [error, setError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<Event | null>(null);
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [addedStructures, setAddedStructures] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (dto: EventCreateDto) => createEvent(dto),
    onSuccess: (event) => {
      setCreatedEvent(event);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    }
  });

  const addCandidateMutation = useMutation({
    mutationFn: ({ eventId, structureId }: { eventId: number; structureId: number }) =>
      addCandidate(eventId, { structure_id: structureId }),
    onSuccess: (_, variables) => {
      setAddedStructures((prev) => new Set(prev).add(variables.structureId));
      queryClient.invalidateQueries({ queryKey: ["event", variables.eventId] });
    }
  });

  const handleNextFromDetails = () => {
    if (!state.title.trim() || !state.start_date || !state.end_date) {
      setError("Compila tutti i campi obbligatori.");
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleCreateEvent = async () => {
    if (!state.start_date || !state.end_date) {
      setError("Seleziona le date dell'evento.");
      return;
    }
    setError(null);
    const dto: EventCreateDto = {
      title: state.title.trim(),
      branch: state.branch,
      start_date: state.start_date,
      end_date: state.end_date,
      participants: state.participants,
      status: state.status,
      notes: state.notes.trim() || undefined,
      budget_total: state.budget_total ? Number.parseFloat(state.budget_total) : undefined
    };

    try {
      const event = await createMutation.mutateAsync(dto);
      setCreatedEvent(event);
      setStep(3);
      setIsLoadingSuggestions(true);
      try {
        const items = await getSuggestions(event.id);
        setSuggestions(items);
      } finally {
        setIsLoadingSuggestions(false);
      }
    } catch (apiError) {
      setError(apiError instanceof ApiError ? apiError.message : "Impossibile creare l'evento.");
    }
  };

  const handleAddSuggestion = async (structureId: number) => {
    if (!createdEvent) {
      return;
    }
    try {
      await addCandidateMutation.mutateAsync({ eventId: createdEvent.id, structureId });
    } catch (apiError) {
      setError(apiError instanceof ApiError ? apiError.message : "Impossibile aggiungere la struttura.");
    }
  };

  const handleFinish = () => {
    if (createdEvent) {
      onCreated(createdEvent);
      setState(defaultWizardState);
      setStep(1);
      setSuggestions([]);
      setAddedStructures(new Set());
      setCreatedEvent(null);
    } else {
      onClose();
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <header className="modal-header">
          <h3>Nuovo evento</h3>
        </header>
        <div className="modal-body">
          {error && <p className="error">{error}</p>}
          {step === 1 && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleNextFromDetails();
              }}
              className="wizard-step"
            >
              <label>
                Titolo
                <input
                  type="text"
                  value={state.title}
                  onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </label>
              <label>
                Branca
                <select
                  value={state.branch}
                  onChange={(event) =>
                    setState((prev) => ({ ...prev, branch: event.target.value as EventBranch }))
                  }
                >
                  {branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </label>
              <div className="inline-fields">
                <label>
                  Inizio
                  <input
                    type="date"
                    value={state.start_date}
                    onChange={(event) =>
                      setState((prev) => ({ ...prev, start_date: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Fine
                  <input
                    type="date"
                    value={state.end_date}
                    onChange={(event) =>
                      setState((prev) => ({ ...prev, end_date: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={onClose}>
                  Annulla
                </button>
                <button type="submit">Continua</button>
              </div>
            </form>
          )}
          {step === 2 && (
            <form
              className="wizard-step"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateEvent();
              }}
            >
              <fieldset>
                <legend>Partecipanti</legend>
                {Object.entries(state.participants).map(([key, value]) => (
                  <label key={key}>
                    {key.toUpperCase()}
                    <input
                      type="number"
                      min={0}
                      value={value}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          participants: {
                            ...prev.participants,
                            [key]: Number.parseInt(event.target.value || "0", 10)
                          }
                        }))
                      }
                    />
                  </label>
                ))}
              </fieldset>
              <label>
                Budget totale (€)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={state.budget_total}
                  onChange={(event) => setState((prev) => ({ ...prev, budget_total: event.target.value }))}
                />
              </label>
              <label>
                Note
                <textarea
                  value={state.notes}
                  onChange={(event) => setState((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={3}
                />
              </label>
              <label>
                Stato iniziale
                <select
                  value={state.status}
                  onChange={(event) =>
                    setState((prev) => ({ ...prev, status: event.target.value as EventStatus }))
                  }
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => setStep(1)}>
                  Indietro
                </button>
                <button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creazione..." : "Crea evento"}
                </button>
              </div>
            </form>
          )}
          {step === 3 && createdEvent && (
            <div className="wizard-step">
              <p aria-live="polite">
                {`Evento ${createdEvent.title} creato con successo. Aggiungi una struttura candidata dalle proposte.`}
              </p>
              {isLoadingSuggestions && <p>Caricamento suggerimenti…</p>}
              {!isLoadingSuggestions && suggestions.length === 0 && (
                <p>Nessun suggerimento disponibile per ora.</p>
              )}
              <ul className="suggestions">
                {suggestions.map((suggestion) => {
                  const disabled = addedStructures.has(suggestion.structure_id);
                  return (
                    <li key={suggestion.structure_id}>
                      <div>
                        <strong>{suggestion.structure_name}</strong>
                        <p>{suggestion.distance_km != null ? `${suggestion.distance_km} km` : "Distanza n/d"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddSuggestion(suggestion.structure_id)}
                        disabled={disabled || addCandidateMutation.isPending}
                      >
                        {disabled ? "Aggiunta" : "Aggiungi candidato"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="modal-actions">
                <button type="button" onClick={handleFinish}>
                  Apri evento
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const EventsPage = () => {
  const [filters, setFilters] = useState<{ q: string; status: string }>({ q: "", status: "" });
  const [submittedFilters, setSubmittedFilters] = useState<{ q?: string; status?: EventStatus }>({});
  const [page] = useState(1);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const queryKey = ["events", submittedFilters, page];
  const eventsQuery = useQuery({
    queryKey,
    queryFn: () => getEvents({ ...submittedFilters, page, page_size: 20 }),
    keepPreviousData: true
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: { q?: string; status?: EventStatus } = {};
    if (filters.q.trim()) {
      next.q = filters.q.trim();
    }
    if (filters.status) {
      next.status = filters.status as EventStatus;
    }
    setSubmittedFilters(next);
  };

  const events = eventsQuery.data?.items ?? [];
  const hasError = eventsQuery.isError;

  const summaryMessage = useMemo(() => {
    if (!eventsQuery.data) {
      return "";
    }
    if (eventsQuery.data.total === 0) {
      return "Nessun evento trovato.";
    }
    return `${eventsQuery.data.total} eventi totali`;
  }, [eventsQuery.data]);

  const handleEventCreated = (event: Event) => {
    setIsWizardOpen(false);
    queryClient.invalidateQueries({ queryKey: ["events"] });
    navigate(`/events/${event.id}`);
  };

  return (
    <section>
      <div className="card">
        <header className="card-header">
          <h2>Eventi</h2>
          <button type="button" onClick={() => setIsWizardOpen(true)}>
            Nuovo evento
          </button>
        </header>
        <form className="filters" onSubmit={handleSubmit}>
          <label>
            Cerca
            <input
              type="search"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="Titolo o slug"
            />
          </label>
          <label>
            Stato
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">Tutti</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <div className="filters-actions">
            <button type="submit">Filtra</button>
            <button
              type="button"
              onClick={() => {
                setFilters({ q: "", status: "" });
                setSubmittedFilters({});
              }}
            >
              Reset
            </button>
          </div>
        </form>
        {eventsQuery.isLoading && <p>Caricamento eventi…</p>}
        {hasError && <p>Impossibile caricare gli eventi.</p>}
        {!eventsQuery.isLoading && !hasError && (
          <div className="event-list">
            <p className="summary">{summaryMessage}</p>
            <table>
              <thead>
                <tr>
                  <th>Titolo</th>
                  <th>Periodo</th>
                  <th>Branca</th>
                  <th>Stato</th>
                  <th>Partecipanti</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const participantsTotal = Object.values(event.participants).reduce(
                    (acc, value) => acc + value,
                    0
                  );
                  return (
                    <tr key={event.id}>
                      <td>
                        <Link to={`/events/${event.id}`}>{event.title}</Link>
                      </td>
                      <td>
                        {event.start_date} → {event.end_date}
                      </td>
                      <td>{event.branch}</td>
                      <td>{event.status}</td>
                      <td>{participantsTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {isWizardOpen && <EventWizard onClose={() => setIsWizardOpen(false)} onCreated={handleEventCreated} />}
    </section>
  );
};

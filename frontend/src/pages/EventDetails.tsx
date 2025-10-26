import { FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  addCandidate,
  addTask,
  getEvent,
  getEventSummary,
  getSuggestions,
  patchCandidate,
  patchTask
} from "../shared/api";
import {
  Event,
  EventCandidate,
  EventCandidateStatus,
  EventContactTask,
  EventContactTaskOutcome,
  EventContactTaskStatus,
  EventSuggestion,
  EventSummary
} from "../shared/types";
import { EventQuotesTab } from "./EventQuotesTab";

const candidateStatuses: EventCandidateStatus[] = [
  "to_contact",
  "contacting",
  "available",
  "unavailable",
  "followup",
  "confirmed",
  "option"
];

const taskStatuses: EventContactTaskStatus[] = ["todo", "in_progress", "done", "n_a"];
const taskOutcomes: EventContactTaskOutcome[] = ["pending", "positive", "negative"];

type CandidateSaveHandler = (candidateId: number, payload: { status: EventCandidateStatus; assigned_user: string | null }) => Promise<void>;

type TaskSaveHandler = (taskId: number, payload: { status: EventContactTaskStatus; outcome: EventContactTaskOutcome; assigned_user: string | null; notes: string | null }) => Promise<void>;

interface CandidateRowProps {
  candidate: EventCandidate;
  hasConflict: boolean;
  onSave: CandidateSaveHandler;
}

const CandidateRow = ({ candidate, hasConflict, onSave }: CandidateRowProps) => {
  const [assignedUser, setAssignedUser] = useState(candidate.assigned_user ?? "");
  const [status, setStatus] = useState<EventCandidateStatus>(candidate.status);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(candidate.id, {
        status,
        assigned_user: assignedUser.trim() ? assignedUser.trim() : null
      });
    } catch (apiError) {
      const statusCode = apiError instanceof ApiError ? apiError.status : (apiError as { status?: number })?.status;
      if (statusCode === 409) {
        setError("Conflitto di disponibilità rilevato.");
      } else {
        setError("Impossibile aggiornare la candidatura.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>
        {candidate.structure ? (
          <Link to={`/structures/${candidate.structure.slug}`}>{candidate.structure.name}</Link>
        ) : (
          "Struttura"
        )}
        {candidate.status === "confirmed" && hasConflict && <span className="badge">Conflitto</span>}
      </td>
      <td>
        <input
          type="text"
          value={assignedUser}
          onChange={(event) => setAssignedUser(event.target.value)}
          placeholder="Responsabile"
          aria-label="Assegnato a"
        />
      </td>
      <td>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as EventCandidateStatus)}
          aria-label="Stato"
        >
          {candidateStatuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </td>
      <td>{new Date(candidate.last_update).toLocaleString()}</td>
      <td>
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Salvataggio…" : "Salva"}
        </button>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
};

interface TaskRowProps {
  task: EventContactTask;
  onSave: TaskSaveHandler;
}

const TaskRow = ({ task, onSave }: TaskRowProps) => {
  const [status, setStatus] = useState<EventContactTaskStatus>(task.status);
  const [outcome, setOutcome] = useState<EventContactTaskOutcome>(task.outcome);
  const [assignedUser, setAssignedUser] = useState(task.assigned_user ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(task.id, {
        status,
        outcome,
        assigned_user: assignedUser.trim() ? assignedUser.trim() : null,
        notes: notes.trim() ? notes.trim() : null
      });
    } catch (apiError) {
      setError(apiError instanceof ApiError ? apiError.message : "Aggiornamento non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>{task.structure_id ?? "N/A"}</td>
      <td>
        <input
          type="text"
          value={assignedUser}
          placeholder="Incaricato"
          onChange={(event) => setAssignedUser(event.target.value)}
        />
      </td>
      <td>
        <select value={status} onChange={(event) => setStatus(event.target.value as EventContactTaskStatus)}>
          {taskStatuses.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={outcome} onChange={(event) => setOutcome(event.target.value as EventContactTaskOutcome)}>
          {taskOutcomes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </td>
      <td>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
      </td>
      <td>{new Date(task.updated_at).toLocaleString()}</td>
      <td>
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Salvataggio…" : "Salva"}
        </button>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
};

export const EventDetailsPage = () => {
  const { eventId } = useParams();
  const numericId = Number(eventId);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"candidature" | "attivita" | "preventivi">(
    "candidature"
  );
  const [candidateSlug, setCandidateSlug] = useState("");
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);

  const eventQuery = useQuery({
    queryKey: ["event", numericId],
    queryFn: () => getEvent(numericId, { include: ["candidates", "tasks"] }),
    enabled: Number.isFinite(numericId),
    refetchInterval: 15000
  });

  const summaryQuery = useQuery({
    queryKey: ["event-summary", numericId],
    queryFn: () => getEventSummary(numericId),
    enabled: Number.isFinite(numericId),
    refetchInterval: 15000
  });

  const addCandidateMutation = useMutation({
    mutationFn: (slug: string) => addCandidate(numericId, { structure_slug: slug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
      queryClient.invalidateQueries({ queryKey: ["event-summary", numericId] });
      setCandidateSlug("");
      setCandidateError(null);
    },
    onError: (error: unknown) => {
      setCandidateError(error instanceof ApiError ? error.message : "Impossibile aggiungere la struttura.");
    }
  });

  const patchCandidateMutation = useMutation({
    mutationFn: ({ candidateId, status, assigned_user }: { candidateId: number; status: EventCandidateStatus; assigned_user: string | null }) =>
      patchCandidate(numericId, candidateId, { status, assigned_user }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
      queryClient.invalidateQueries({ queryKey: ["event-summary", numericId] });
    }
  });

  const addTaskMutation = useMutation({
    mutationFn: (payload: { assigned_user?: string | null; notes?: string | null }) =>
      addTask(numericId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
    }
  });

  const patchTaskMutation = useMutation({
    mutationFn: ({ taskId, status, outcome, assigned_user, notes }: { taskId: number; status: EventContactTaskStatus; outcome: EventContactTaskOutcome; assigned_user: string | null; notes: string | null }) =>
      patchTask(numericId, taskId, { status, outcome, assigned_user, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
    }
  });

  const handleCandidateSave: CandidateSaveHandler = async (candidateId, payload) => {
    await patchCandidateMutation.mutateAsync({ candidateId, ...payload });
  };

  const handleTaskSave: TaskSaveHandler = async (taskId, payload) => {
    await patchTaskMutation.mutateAsync({ taskId, ...payload });
  };

  const handleAddCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!candidateSlug.trim()) {
      setCandidateError("Indica lo slug della struttura.");
      return;
    }
    await addCandidateMutation.mutateAsync(candidateSlug.trim());
  };

  const handleLoadSuggestions = async () => {
    if (!numericId) {
      return;
    }
    try {
      const result = await getSuggestions(numericId);
      setSuggestions(result);
    } catch (error) {
      setCandidateError("Impossibile caricare i suggerimenti.");
    }
  };

  const event = eventQuery.data as Event | undefined;
  const summary = summaryQuery.data as EventSummary | undefined;

  const participantsTotal = useMemo(() => {
    if (!event) {
      return 0;
    }
    return Object.values(event.participants).reduce((acc, value) => acc + value, 0);
  }, [event]);

  if (!Number.isFinite(numericId)) {
    return (
      <section>
        <div className="card">
          <p>Identificativo evento non valido.</p>
        </div>
      </section>
    );
  }

  if (eventQuery.isLoading) {
    return (
      <section>
        <div className="card">
          <p>Caricamento evento…</p>
        </div>
      </section>
    );
  }

  if (eventQuery.isError || !event) {
    return (
      <section>
        <div className="card">
          <p>Impossibile trovare l'evento richiesto.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <header className="card-header">
          <h2>{event.title}</h2>
          <div>
            <span>{event.branch}</span>
            <span>
              {event.start_date} → {event.end_date}
            </span>
            <span>{participantsTotal} partecipanti</span>
          </div>
        </header>
        {summary && (
          <div className="summary">
            <strong>Stato candidature</strong>
            <ul>
              {candidateStatuses.map((status) => (
                <li key={status}>
                  {status}: {summary.status_counts[status] ?? 0}
                </li>
              ))}
            </ul>
            {summary.has_conflicts && <p className="warning">Attenzione: conflitti di disponibilità presenti.</p>}
          </div>
        )}
        <nav className="tabs">
          <button
            type="button"
            className={activeTab === "candidature" ? "active" : ""}
            onClick={() => setActiveTab("candidature")}
          >
            Candidature
          </button>
          <button
            type="button"
            className={activeTab === "attivita" ? "active" : ""}
            onClick={() => setActiveTab("attivita")}
          >
            Attività
          </button>
          <button
            type="button"
            className={activeTab === "preventivi" ? "active" : ""}
            onClick={() => setActiveTab("preventivi")}
          >
            Preventivi
          </button>
        </nav>
        {activeTab === "candidature" && (
          <div className="tab-panel">
            <form className="inline-form" onSubmit={handleAddCandidate}>
              <label>
                Aggiungi struttura (slug)
                <input
                  type="text"
                  value={candidateSlug}
                  onChange={(event) => setCandidateSlug(event.target.value)}
                  placeholder="es. casa-inverno"
                />
              </label>
              <button type="submit" disabled={addCandidateMutation.isPending}>
                {addCandidateMutation.isPending ? "Aggiunta…" : "Aggiungi"}
              </button>
              <button type="button" onClick={handleLoadSuggestions}>
                Suggerimenti
              </button>
            </form>
            {candidateError && <p className="error">{candidateError}</p>}
            {suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.structure_id}>
                    <span>{suggestion.structure_name}</span>
                    <button
                      type="button"
                      onClick={() => addCandidateMutation.mutate(suggestion.structure_slug)}
                    >
                      Aggiungi
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <table>
              <thead>
                <tr>
                  <th>Struttura</th>
                  <th>Assegnato a</th>
                  <th>Stato</th>
                  <th>Aggiornato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {event.candidates?.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    hasConflict={summary?.has_conflicts ?? false}
                    onSave={handleCandidateSave}
                  />
                )) || (
                  <tr>
                    <td colSpan={5}>Nessuna candidatura inserita.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "attivita" && (
          <div className="tab-panel">
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                addTaskMutation.mutate({
                  assigned_user: null,
                  notes: null
                });
              }}
            >
              <p>Registra una nuova attività rapida:</p>
              <button type="submit" disabled={addTaskMutation.isPending}>
                {addTaskMutation.isPending ? "Creazione…" : "Nuova attività"}
              </button>
            </form>
            <table>
              <thead>
                <tr>
                  <th>Struttura</th>
                  <th>Assegnato</th>
                  <th>Stato</th>
                  <th>Esito</th>
                  <th>Note</th>
                  <th>Aggiornato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {event.tasks?.map((task) => (
                  <TaskRow key={task.id} task={task} onSave={handleTaskSave} />
                )) || (
                  <tr>
                    <td colSpan={7}>Nessuna attività registrata.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "preventivi" && (
          <div className="tab-panel">
            <EventQuotesTab event={event} />
          </div>
        )}
      </div>
    </section>
  );
};

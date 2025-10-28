import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  addCandidate,
  addEventMember,
  addTask,
  downloadEventIcal,
  getStructureContacts,
  getEvent,
  getEventMembers,
  getEventSummary,
  getSuggestions,
  patchCandidate,
  patchTask,
  removeEventMember,
  updateEventMember
} from "../shared/api";
import {
  Event,
  EventCandidate,
  EventCandidateStatus,
  EventContactTask,
  EventContactTaskOutcome,
  EventContactTaskStatus,
  EventMember,
  EventMemberRole,
  EventSuggestion,
  EventSummary,
  Contact
} from "../shared/types";
import { useAuth } from "../shared/auth";
import { useEventLive } from "../shared/live";
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

const roleLabels: Record<EventMemberRole, string> = {
  owner: "Responsabile",
  collab: "Collaboratore",
  viewer: "Osservatore"
};

type CandidateSavePayload = {
  status: EventCandidateStatus;
  assigned_user_id: string | null;
  contact_id: number | null;
};

type CandidateSaveHandler = (candidateId: number, payload: CandidateSavePayload) => Promise<void>;

type TaskSavePayload = {
  status: EventContactTaskStatus;
  outcome: EventContactTaskOutcome;
  assigned_user_id: string | null;
  notes: string | null;
};

type TaskSaveHandler = (taskId: number, payload: TaskSavePayload) => Promise<void>;

interface CandidateRowProps {
  candidate: EventCandidate;
  hasConflict: boolean;
  members: EventMember[];
  onSave: CandidateSaveHandler;
  eventTitle: string;
  eventStart: string;
  eventEnd: string;
}

const CandidateRow = ({
  candidate,
  hasConflict,
  members,
  onSave,
  eventTitle,
  eventStart,
  eventEnd
}: CandidateRowProps) => {
  const { t } = useTranslation();
  const [assignedUserId, setAssignedUserId] = useState(candidate.assigned_user_id ?? "");
  const [status, setStatus] = useState<EventCandidateStatus>(candidate.status);
  const [contactId, setContactId] = useState(candidate.contact_id ? String(candidate.contact_id) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAssignedUserId(candidate.assigned_user_id ?? "");
    setStatus(candidate.status);
    setContactId(candidate.contact_id ? String(candidate.contact_id) : "");
  }, [candidate.assigned_user_id, candidate.status, candidate.contact_id]);

  const {
    data: fetchedContacts,
    isLoading: contactsLoading,
    isError: contactsError,
  } = useQuery<Contact[], ApiError>({
    queryKey: ["structure-contacts", candidate.structure_id],
    queryFn: () => getStructureContacts(candidate.structure_id),
    enabled: Boolean(candidate.structure_id),
  });

  const contactOptions = useMemo(() => {
    const base = fetchedContacts ?? [];
    const withCandidate = candidate.contact
      ? base.some((item) => item.id === candidate.contact!.id)
        ? base
        : [...base, candidate.contact]
      : base;
    return [...withCandidate].sort((a, b) => {
      if (a.is_primary !== b.is_primary) {
        return a.is_primary ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [fetchedContacts, candidate.contact]);

  const selectedContact = contactOptions.find((item) => String(item.id) === contactId) ?? null;
  const emailSubject = selectedContact
    ? t("events.candidates.mail.subject", { title: eventTitle, start: eventStart, end: eventEnd })
    : "";
  const emailBody = selectedContact
    ? t("events.candidates.mail.body", {
        title: eventTitle,
        start: eventStart,
        end: eventEnd,
        structure: candidate.structure?.name ?? t("events.candidates.contact.unknownStructure"),
      })
    : "";
  const mailHref = selectedContact?.email
    ? `mailto:${selectedContact.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : null;
  const telHref = selectedContact?.phone
    ? `tel:${selectedContact.phone.replace(/\s+/g, "")}`
    : null;

  const handleSendEmail = () => {
    if (mailHref) {
      window.location.href = mailHref;
    }
  };

  const handleCall = () => {
    if (telHref) {
      window.location.href = telHref;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(candidate.id, {
        status,
        assigned_user_id: assignedUserId ? assignedUserId : null,
        contact_id: contactId ? Number(contactId) : null,
      });
    } catch (apiError) {
      const statusCode = apiError instanceof ApiError ? apiError.status : (apiError as { status?: number })?.status;
      if (statusCode === 409) {
        setError(t("events.candidates.errors.conflict"));
      } else if (statusCode === 403) {
        setError(t("events.candidates.errors.forbidden"));
      } else {
        setError(t("events.candidates.errors.updateFailed"));
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
          t("events.candidates.labels.structure")
        )}
        {candidate.status === "confirmed" && hasConflict && <span className="badge">{t("events.candidates.conflict")}</span>}
      </td>
      <td>
        {contactsLoading ? (
          <span>{t("events.candidates.contact.loading")}</span>
        ) : contactsError ? (
          <span className="error">{t("events.candidates.contact.error")}</span>
        ) : contactOptions.length === 0 ? (
          <span>{t("events.candidates.contact.none")}</span>
        ) : (
          <select
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            aria-label={t("events.candidates.contact.label")}
          >
            <option value="">{t("events.candidates.contact.unassigned")}</option>
            {contactOptions.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
                {contact.is_primary ? ` · ${t("events.candidates.contact.primaryFlag")}` : ""}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <div className="inline-actions" style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={handleSendEmail} disabled={!mailHref}>
            {t("events.candidates.actions.email")}
          </button>
          <button type="button" onClick={handleCall} disabled={!telHref}>
            {t("events.candidates.actions.call")}
          </button>
        </div>
      </td>
      <td>
        <select
          value={assignedUserId}
          onChange={(event) => setAssignedUserId(event.target.value)}
          aria-label={t("events.candidates.labels.assignee")}
        >
          <option value="">{t("events.candidates.labels.noAssignee")}</option>
          {members.map((member) => (
            <option key={member.id} value={member.user.id}>
              {member.user.name} ({roleLabels[member.role]})
            </option>
          ))}
        </select>
        {candidate.assigned_user_name && (
          <p className="muted">
            {t("events.candidates.labels.currentAssignee", { name: candidate.assigned_user_name })}
          </p>
        )}
      </td>
      <td>
        <select value={status} onChange={(event) => setStatus(event.target.value as EventCandidateStatus)} aria-label={t("events.candidates.labels.status")}>
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
          {saving ? t("events.candidates.actions.saving") : t("events.candidates.actions.save")}
        </button>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
};

interface TaskRowProps {
  task: EventContactTask;
  members: EventMember[];
  onSave: TaskSaveHandler;
}

const TaskRow = ({ task, members, onSave }: TaskRowProps) => {
  const [status, setStatus] = useState<EventContactTaskStatus>(task.status);
  const [outcome, setOutcome] = useState<EventContactTaskOutcome>(task.outcome);
  const [assignedUserId, setAssignedUserId] = useState(task.assigned_user_id ?? "");
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
        assigned_user_id: assignedUserId ? assignedUserId : null,
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
        <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} aria-label="Assegnato">
          <option value="">Non assegnato</option>
          {members.map((member) => (
            <option key={member.id} value={member.user.id}>
              {member.user.name} ({roleLabels[member.role]})
            </option>
          ))}
        </select>
        {task.assigned_user_name && <p className="muted">Attuale: {task.assigned_user_name}</p>}
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
  const { t } = useTranslation();
  const { eventId } = useParams();
  const auth = useAuth();
  const numericId = Number(eventId);
  const isValidEventId = Number.isFinite(numericId);
  const liveState = useEventLive(isValidEventId ? numericId : null);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"candidature" | "attivita" | "preventivi">("candidature");
  const [candidateSlug, setCandidateSlug] = useState("");
  const [candidateAssignee, setCandidateAssignee] = useState("");
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<EventMemberRole>("viewer");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [icalError, setIcalError] = useState<string | null>(null);
  const [icalDownloading, setIcalDownloading] = useState(false);

  const eventQuery = useQuery({
    queryKey: ["event", numericId],
    queryFn: () => getEvent(numericId, { include: ["candidates", "tasks"] }),
    enabled: isValidEventId
  });

  const summaryQuery = useQuery({
    queryKey: ["event-summary", numericId],
    queryFn: () => getEventSummary(numericId),
    enabled: isValidEventId
  });

  const membersQuery = useQuery({
    queryKey: ["event-members", numericId],
    queryFn: () => getEventMembers(numericId),
    enabled: isValidEventId,
    refetchInterval: 30000
  });

  const addCandidateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof addCandidate>[1]) => addCandidate(numericId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
      queryClient.invalidateQueries({ queryKey: ["event-summary", numericId] });
      setCandidateSlug("");
      setCandidateAssignee("");
      setCandidateError(null);
    },
    onError: (error: unknown) => {
      setCandidateError(error instanceof ApiError ? error.message : "Impossibile aggiungere la struttura.");
    }
  });

  const patchCandidateMutation = useMutation({
    mutationFn: ({ candidateId, payload }: { candidateId: number; payload: Parameters<typeof patchCandidate>[2] }) =>
      patchCandidate(numericId, candidateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
      queryClient.invalidateQueries({ queryKey: ["event-summary", numericId] });
    }
  });

  const addTaskMutation = useMutation({
    mutationFn: (payload: Parameters<typeof addTask>[1]) => addTask(numericId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
      setNewTaskAssignee("");
    }
  });

  const patchTaskMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: Parameters<typeof patchTask>[2] }) =>
      patchTask(numericId, taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
    }
  });

  const addMemberMutation = useMutation({
    mutationFn: (payload: Parameters<typeof addEventMember>[1]) => addEventMember(numericId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-members", numericId] });
      setInviteEmail("");
      setInviteRole("viewer");
      setMemberError(null);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && typeof error.body === "object" && error.body && "detail" in error.body
          ? String((error.body as { detail?: unknown }).detail ?? "Impossibile aggiungere il membro")
          : "Impossibile aggiungere il membro";
      setMemberError(message);
    }
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: EventMemberRole }) =>
      updateEventMember(numericId, memberId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-members", numericId] });
      setMemberError(null);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && typeof error.body === "object" && error.body && "detail" in error.body
          ? String((error.body as { detail?: unknown }).detail ?? "Impossibile aggiornare il ruolo")
          : "Impossibile aggiornare il ruolo";
      setMemberError(message);
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) => removeEventMember(numericId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-members", numericId] });
      setMemberError(null);
    },
    onError: () => {
      setMemberError("Impossibile rimuovere il membro.");
    }
  });

  const handleCandidateSave: CandidateSaveHandler = async (candidateId, payload) => {
    await patchCandidateMutation.mutateAsync({ candidateId, payload });
  };

  const handleTaskSave: TaskSaveHandler = async (taskId, payload) => {
    await patchTaskMutation.mutateAsync({ taskId, payload });
  };

  const handleAddCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!candidateSlug.trim()) {
      setCandidateError("Indica lo slug della struttura.");
      return;
    }
    await addCandidateMutation.mutateAsync({
      structure_slug: candidateSlug.trim(),
      assigned_user_id: candidateAssignee ? candidateAssignee : undefined
    });
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

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      setMemberError("Indica un indirizzo email.");
      return;
    }
    await addMemberMutation.mutateAsync({ email: inviteEmail.trim(), role: inviteRole });
  };

  const members = membersQuery.data ?? [];
  const myMembership = members.find((member) => member.user.id === auth.user?.id);
  const isOwner = myMembership?.role === "owner";

  const event = eventQuery.data as Event | undefined;
  const summary = summaryQuery.data as EventSummary | undefined;

  const participantsTotal = useMemo(() => {
    if (!event) {
      return 0;
    }
    return Object.values(event.participants).reduce((acc, value) => acc + value, 0);
  }, [event]);

  if (!isValidEventId) {
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
    const error = eventQuery.error;
    const isForbidden = error instanceof ApiError && error.status === 403;
    return (
      <section>
        <div className="card">
          <p>{isForbidden ? "Non hai accesso a questo evento." : "Impossibile trovare l'evento richiesto."}</p>
        </div>
      </section>
    );
  }

  const eventStartLabel = new Date(event.start_date).toLocaleDateString("it-IT");
  const eventEndLabel = new Date(event.end_date).toLocaleDateString("it-IT");

  const handleDownloadIcal = async () => {
    setIcalError(null);
    setIcalDownloading(true);
    try {
      const blob = await downloadEventIcal(event.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = event.slug ? `${event.slug}.ics` : `event-${event.id}.ics`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setIcalError(t("events.details.icalError"));
    } finally {
      setIcalDownloading(false);
    }
  };

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
            <span className="badge" aria-live="polite">
              {liveState.mode === "sse" ? "Live" : "Polling"}
            </span>
            <button
              type="button"
              className="button"
              onClick={handleDownloadIcal}
              disabled={icalDownloading}
            >
              {icalDownloading ? t("common.loading") : t("events.details.downloadIcal")}
            </button>
          </div>
        </header>
        {icalError && <p className="error">{icalError}</p>}
        <div className="team-section">
          <h3>Team</h3>
          {memberError && <p className="error">{memberError}</p>}
          {membersQuery.isLoading ? (
            <p>Caricamento membri…</p>
          ) : membersQuery.isError ? (
            <p className="error">Impossibile caricare i membri.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ruolo</th>
                  {isOwner && <th>Azioni</th>}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 3 : 2}>Nessun membro registrato.</td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.user.name}</strong>
                        <br />
                        <span className="muted">{member.user.email}</span>
                      </td>
                      <td>
                        {isOwner ? (
                          <select
                            value={member.role}
                            onChange={(event) =>
                              updateMemberMutation.mutate({
                                memberId: member.id,
                                role: event.target.value as EventMemberRole
                              })
                            }
                            aria-label={`Ruolo per ${member.user.name}`}
                            disabled={updateMemberMutation.isPending || (member.user.id === auth.user?.id && member.role === "owner")}
                          >
                            {Object.entries(roleLabels).map(([role, label]) => (
                              <option key={role} value={role}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge">{roleLabels[member.role]}</span>
                        )}
                      </td>
                      {isOwner && (
                        <td>
                          <button
                            type="button"
                            onClick={() => removeMemberMutation.mutate(member.id)}
                            disabled={removeMemberMutation.isPending || member.user.id === auth.user?.id}
                          >
                            Rimuovi
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {isOwner && (
            <form className="inline-form" onSubmit={handleInvite}>
              <label>
                Email
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="utente@example.com"
                  required
                />
              </label>
              <label>
                Ruolo
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as EventMemberRole)}>
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={addMemberMutation.isPending}>
                {addMemberMutation.isPending ? "Invio…" : "Invita"}
              </button>
            </form>
          )}
        </div>
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
          <button type="button" className={activeTab === "candidature" ? "active" : ""} onClick={() => setActiveTab("candidature")}>
            Candidature
          </button>
          <button type="button" className={activeTab === "attivita" ? "active" : ""} onClick={() => setActiveTab("attivita")}>
            Attività
          </button>
          <button type="button" className={activeTab === "preventivi" ? "active" : ""} onClick={() => setActiveTab("preventivi")}>
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
              <label>
                Assegna a
                <select value={candidateAssignee} onChange={(event) => setCandidateAssignee(event.target.value)}>
                  <option value="">Nessuno</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.user.id}>
                      {member.user.name}
                    </option>
                  ))}
                </select>
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
                      onClick={() =>
                        addCandidateMutation.mutate({
                          structure_slug: suggestion.structure_slug,
                          assigned_user_id: candidateAssignee ? candidateAssignee : undefined
                        })
                      }
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
                  <th>Contatto</th>
                  <th>Azioni rapide</th>
                  <th>Assegnato a</th>
                  <th>Stato</th>
                  <th>Aggiornato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {event.candidates?.length ? (
                  event.candidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      hasConflict={summary?.has_conflicts ?? false}
                      members={members}
                      onSave={handleCandidateSave}
                      eventTitle={event.title}
                      eventStart={eventStartLabel}
                      eventEnd={eventEndLabel}
                    />
                  ))
                ) : (
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
                  assigned_user_id: newTaskAssignee ? newTaskAssignee : undefined
                });
              }}
            >
              <label>
                Assegna a
                <select value={newTaskAssignee} onChange={(event) => setNewTaskAssignee(event.target.value)}>
                  <option value="">Nessuno</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.user.id}>
                      {member.user.name}
                    </option>
                  ))}
                </select>
              </label>
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
                {event.tasks?.length ? (
                  event.tasks.map((task) => (
                    <TaskRow key={task.id} task={task} members={members} onSave={handleTaskSave} />
                  ))
                ) : (
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

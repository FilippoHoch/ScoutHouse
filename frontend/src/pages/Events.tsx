
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  addCandidate,
  createEvent,
  getEvent,
  getEvents,
  getSuggestions
} from "../shared/api";
import {
  Event,
  EventBranch,
  EventSuggestion,
  EventStatus,
  EventCreateDto,
  EventListResponse,
  EventParticipants
} from "../shared/types";
import { FocusTrap } from "../shared/ui/FocusTrap";

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

const participantLabelKeys: Record<keyof WizardState["participants"], string> = {
  lc: "events.wizard.participants.labels.lc",
  eg: "events.wizard.participants.labels.eg",
  rs: "events.wizard.participants.labels.rs",
  leaders: "events.wizard.participants.labels.leaders"
};

interface EventWizardProps {
  onClose: () => void;
  onCreated: (event: Event) => void;
}

const EventWizard = ({ onClose, onCreated }: EventWizardProps) => {
  const { t } = useTranslation();
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
      setError(t("events.wizard.errors.required"));
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleCreateEvent = async () => {
    if (!state.start_date || !state.end_date) {
      setError(t("events.wizard.errors.dates"));
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
      setError(apiError instanceof ApiError ? apiError.message : t("events.wizard.errors.create"));
    }
  };

  const handleAddSuggestion = async (structureId: number) => {
    if (!createdEvent) {
      return;
    }
    try {
      await addCandidateMutation.mutateAsync({ eventId: createdEvent.id, structureId });
    } catch (apiError) {
      setError(apiError instanceof ApiError ? apiError.message : t("events.wizard.errors.addStructure"));
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
    <div className="modal" role="presentation">
      <FocusTrap>
        <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="event-wizard-title">
          <header className="modal-header">
            <h3 id="event-wizard-title">{t("events.wizard.title")}</h3>
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
                  {t("events.wizard.fields.title")}
                  <input
                    type="text"
                    value={state.title}
                    onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  {t("events.wizard.fields.branch")}
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
                    {t("events.wizard.fields.start")}
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
                    {t("events.wizard.fields.end")}
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
                    {t("events.wizard.actions.cancel")}
                  </button>
                  <button type="submit">{t("events.wizard.actions.next")}</button>
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
                  <legend>{t("events.wizard.participants.title")}</legend>
                  {Object.entries(state.participants).map(([key, value]) => {
                    const participantKey = key as keyof WizardState["participants"];
                    return (
                      <label key={key}>
                        {t(participantLabelKeys[participantKey])}
                        <input
                          type="number"
                          min={0}
                          value={value}
                          onChange={(event) =>
                            setState((prev) => ({
                              ...prev,
                              participants: {
                                ...prev.participants,
                                [participantKey]: Number.parseInt(event.target.value || "0", 10)
                              }
                            }))
                          }
                        />
                      </label>
                    );
                  })}
                </fieldset>
                <label>
                  {t("events.wizard.fields.budget")}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={state.budget_total}
                    onChange={(event) => setState((prev) => ({ ...prev, budget_total: event.target.value }))}
                  />
                </label>
                <label>
                  {t("events.wizard.fields.notes")}
                  <textarea
                    value={state.notes}
                    onChange={(event) => setState((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={3}
                  />
                </label>
                <label>
                  {t("events.wizard.fields.status")}
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
                    {t("events.wizard.actions.back")}
                  </button>
                  <button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending
                      ? t("events.wizard.actions.creating")
                      : t("events.wizard.actions.create")}
                  </button>
                </div>
              </form>
            )}
            {step === 3 && createdEvent && (
              <div className="wizard-step">
                <p aria-live="polite">
                  {t("events.wizard.summary.created", { title: createdEvent.title })}
                </p>
                {isLoadingSuggestions && <p>{t("events.wizard.suggestions.loading")}</p>}
                {!isLoadingSuggestions && suggestions.length === 0 && (
                  <p>{t("events.wizard.suggestions.empty")}</p>
                )}
                <ul className="suggestions">
                  {suggestions.map((suggestion) => {
                    const disabled = addedStructures.has(suggestion.structure_id);
                    return (
                      <li key={suggestion.structure_id}>
                        <div>
                          <strong>{suggestion.structure_name}</strong>
                          <p>
                            {suggestion.distance_km != null
                              ? t("events.wizard.suggestions.distance", { value: suggestion.distance_km })
                              : t("events.wizard.suggestions.distanceUnknown")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddSuggestion(suggestion.structure_id)}
                          disabled={disabled || addCandidateMutation.isPending}
                        >
                          {disabled
                            ? t("events.wizard.suggestions.added")
                            : t("events.wizard.suggestions.add")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="modal-actions">
                  <button type="button" onClick={handleFinish}>
                    {t("events.wizard.actions.open")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </FocusTrap>
    </div>
  );
};

export const EventsPage = () => {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<{ q: string; status: string }>({ q: "", status: "" });
  const [submittedFilters, setSubmittedFilters] = useState<{ q?: string; status?: EventStatus }>({});
  const [page] = useState(1);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const queryKey = ["events", submittedFilters, page];
  const eventsQuery = useQuery<EventListResponse, Error>({
    queryKey,
    queryFn: () => getEvents({ ...submittedFilters, page, page_size: 20 }),
    placeholderData: keepPreviousData
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
      return t("events.list.summary.empty");
    }
    return t("events.list.summary.total", { count: eventsQuery.data.total });
  }, [eventsQuery.data, t]);

  const handleEventCreated = (event: Event) => {
    setIsWizardOpen(false);
    queryClient.invalidateQueries({ queryKey: ["events"] });
    navigate(`/events/${event.id}`);
  };

  const prefetchEventDetails = (eventId: number) =>
    queryClient.prefetchQuery({
      queryKey: ["event", eventId],
      queryFn: () => getEvent(eventId, { include: ["candidates", "tasks"] })
    });

  return (
    <section>
      <div className="card">
        <header className="card-header">
          <h2>{t("events.title")}</h2>
          <button type="button" onClick={() => setIsWizardOpen(true)}>
            {t("events.actions.new")}
          </button>
        </header>
        <form className="filters" onSubmit={handleSubmit}>
          <label>
            {t("events.filters.search.label")}
            <input
              type="search"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder={t("events.filters.search.placeholder")}
            />
          </label>
          <label>
            {t("events.filters.status.label")}
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">{t("events.filters.status.all")}</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <div className="filters-actions">
            <button type="submit">{t("events.filters.apply")}</button>
            <button
              type="button"
              onClick={() => {
                setFilters({ q: "", status: "" });
                setSubmittedFilters({});
              }}
            >
              {t("events.filters.reset")}
            </button>
          </div>
        </form>
        {eventsQuery.isLoading && <p>{t("events.states.loading")}</p>}
        {hasError && <p>{t("events.states.error")}</p>}
        {!eventsQuery.isLoading && !hasError && (
          <div className="event-list">
            <p className="summary">{summaryMessage}</p>
            <table>
              <thead>
                <tr>
                  <th>{t("events.table.title")}</th>
                  <th>{t("events.table.period")}</th>
                  <th>{t("events.table.branch")}</th>
                  <th>{t("events.table.status")}</th>
                  <th>{t("events.table.participants")}</th>
                </tr>
              </thead>
              <tbody>
                  {events.map((event) => {
                    const participantValues = Object.values(event.participants) as Array<
                      EventParticipants[keyof EventParticipants]
                    >;
                    const participantsTotal = participantValues.reduce((acc, value) => acc + value, 0);
                  return (
                    <tr key={event.id}>
                      <td>
                        <Link
                          to={`/events/${event.id}`}
                          onMouseEnter={() => prefetchEventDetails(event.id)}
                          onFocus={() => prefetchEventDetails(event.id)}
                        >
                          {event.title}
                        </Link>
                      </td>
                      <td>
                        {t("events.list.period", { start: event.start_date, end: event.end_date })}
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

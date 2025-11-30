import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ApiError, getEvent, patchEvent } from "../shared/api";
import { EventBranch, EventStatus, EventUpdateDto } from "../shared/types";
import {
  InlineActions,
  InlineFields,
  InlineMessage,
  SectionHeader,
  Surface,
  Button,
} from "../shared/ui/designSystem";

const branchOptions: EventBranch[] = ["LC", "EG", "RS", "CC", "ALL"];
const statusOptions: EventStatus[] = ["draft", "planning", "booked", "archived"];

export const EventEditPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const numericId = Number(eventId);
  const isValidId = Number.isFinite(numericId);

  const [title, setTitle] = useState("");
  const [branch, setBranch] = useState<EventBranch>("LC");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<EventStatus>("draft");
  const [budget, setBudget] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const eventQuery = useQuery({
    queryKey: ["event", numericId],
    queryFn: () => getEvent(numericId),
    enabled: isValidId,
  });

  useEffect(() => {
    if (eventQuery.data) {
      setTitle(eventQuery.data.title);
      setBranch(eventQuery.data.branch);
      setStartDate(eventQuery.data.start_date);
      setEndDate(eventQuery.data.end_date);
      setStatus(eventQuery.data.status);
      setBudget(
        typeof eventQuery.data.budget_total === "number"
          ? String(eventQuery.data.budget_total)
          : "",
      );
      setNotes(eventQuery.data.notes ?? "");
    }
  }, [eventQuery.data]);

  const branchChoices = useMemo(
    () =>
      branchOptions.map((option) => ({
        value: option,
        label: t(`events.branches.${option}`, option),
      })),
    [t],
  );

  const statusChoices = useMemo(
    () =>
      statusOptions.map((option) => ({
        value: option,
        label: t(`events.status.${option}`, option),
      })),
    [t],
  );

  const updateMutation = useMutation({
    mutationFn: (dto: EventUpdateDto) => patchEvent(numericId, dto),
    onSuccess: (updatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ["event", numericId] });
      queryClient.invalidateQueries({ queryKey: ["event-summary", numericId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/events/${updatedEvent.id}`);
    },
    onError: (apiError: unknown) => {
      setError(
        apiError instanceof ApiError
          ? apiError.message
          : t("events.edit.saveError", "Impossibile aggiornare l'evento."),
      );
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidId) {
      return;
    }
    setError(null);
    const dto: EventUpdateDto = {
      title: title.trim(),
      branch,
      start_date: startDate,
      end_date: endDate,
      status,
      notes: notes.trim() || null,
      budget_total: budget ? Number.parseFloat(budget) : null,
    };
    updateMutation.mutate(dto);
  };

  if (!isValidId) {
    return (
      <Surface>
        <InlineMessage tone="danger">
          {t("events.details.errors.invalidId.message")}
        </InlineMessage>
      </Surface>
    );
  }

  if (eventQuery.isLoading) {
    return (
      <Surface>
        <InlineMessage>{t("events.details.states.loading")}</InlineMessage>
      </Surface>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <Surface>
        <InlineMessage tone="danger">
          {t("events.edit.loadError", "Impossibile caricare l'evento.")}
        </InlineMessage>
      </Surface>
    );
  }

  return (
    <Surface>
      <SectionHeader>
        <div>
          <h1>{t("events.edit.title", "Modifica evento")}</h1>
          <p className="helper-text">
            {t("events.edit.description", "Aggiorna le informazioni principali dell'evento.")}
          </p>
        </div>
        <InlineActions>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t("events.edit.cancel", "Annulla")}
          </Button>
          <Button type="submit" form="event-edit-form" disabled={updateMutation.isPending}>
            {updateMutation.isPending
              ? t("events.edit.submitting", "Salvataggio…")
              : t("events.edit.submit", "Salva modifiche")}
          </Button>
        </InlineActions>
      </SectionHeader>
      {error && <InlineMessage tone="danger">{error}</InlineMessage>}
      <form id="event-edit-form" className="stack" onSubmit={handleSubmit}>
        <label>
          {t("events.wizard.fields.title")}
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <InlineFields>
          <label>
            {t("events.wizard.fields.start")}
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </label>
          <label>
            {t("events.wizard.fields.end")}
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </label>
        </InlineFields>
        <InlineFields>
          <label>
            {t("events.wizard.details.branches.title")}
            <select
              value={branch}
              onChange={(event) => setBranch(event.target.value as EventBranch)}
              aria-label={t("events.wizard.details.branches.title")}
            >
              {branchChoices.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("events.wizard.fields.status")}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as EventStatus)}
              aria-label={t("events.wizard.fields.status")}
            >
              {statusChoices.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </InlineFields>
        <label>
          {t("events.wizard.fields.budget")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            aria-label={t("events.wizard.fields.budget")}
          />
        </label>
        <label>
          {t("events.wizard.fields.notes")}
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            aria-label={t("events.wizard.fields.notes")}
          />
        </label>
      </form>
    </Surface>
  );
};

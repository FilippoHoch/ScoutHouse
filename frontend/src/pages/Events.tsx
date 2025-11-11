import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getEvent, getEvents } from "../shared/api";
import {
  EventListResponse,
  EventParticipants,
  EventStatus,
} from "../shared/types";
import {
  Button,
  EmptyState,
  InlineMessage,
  LinkButton,
  Metric,
  StatusBadge,
  Surface,
  TableWrapper,
  ToolbarSection,
} from "../shared/ui/designSystem";

const statuses: EventStatus[] = ["draft", "planning", "booked", "archived"];

export const EventsPage = () => {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<{ q: string; status: string }>({
    q: "",
    status: "",
  });
  const [submittedFilters, setSubmittedFilters] = useState<{
    q?: string;
    status?: EventStatus;
  }>({});
  const [page] = useState(1);
  const queryClient = useQueryClient();

  const queryKey = ["events", submittedFilters, page];
  const eventsQuery = useQuery<EventListResponse, Error>({
    queryKey,
    queryFn: () => getEvents({ ...submittedFilters, page, page_size: 20 }),
    placeholderData: keepPreviousData,
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
  const statusOptions = useMemo(
    () =>
      statuses.map((status) => ({
        value: status,
        label: t(`events.status.${status}`, status),
      })),
    [t],
  );
  const statusMetrics = useMemo(
    () =>
      statuses.map((status) => ({
        status,
        count: eventsQuery.data
          ? eventsQuery.data.items.filter((item) => item.status === status)
              .length
          : null,
      })),
    [eventsQuery.data],
  );
  const totalEvents = eventsQuery.data?.total ?? null;
  const totalMetricHint = eventsQuery.isFetching
    ? t("events.metrics.refreshing")
    : eventsQuery.data
      ? t("events.metrics.pageHint", { count: events.length })
      : undefined;
  const isInitialLoading = eventsQuery.isLoading && !eventsQuery.data;

  const summaryMessage = useMemo(() => {
    if (!eventsQuery.data) {
      return null;
    }
    if (eventsQuery.data.total === 0) {
      return t("events.list.summary.empty");
    }
    return t("events.list.summary.total", { count: eventsQuery.data.total });
  }, [eventsQuery.data, t]);

  const prefetchEventDetails = (eventId: number) =>
    queryClient.prefetchQuery({
      queryKey: ["event", eventId],
      queryFn: () => getEvent(eventId, { include: ["candidates", "tasks"] }),
    });

  return (
    <section className="events-page">
      <div className="events-hero">
        <div className="events-hero__heading">
          <div className="events-hero__intro">
            <span className="events-hero__badge">{t("events.hero.badge")}</span>
            <h1>{t("events.title")}</h1>
            <p>{t("events.hero.subtitle")}</p>
          </div>
          <div className="events-hero__actions">
            <LinkButton to="/events/new" size="sm">
              {t("events.actions.new")}
            </LinkButton>
          </div>
        </div>
        <div className="inline-metrics events-hero__metrics" aria-live="polite">
          <Metric
            label={t("events.metrics.total")}
            value={totalEvents ?? "—"}
            hint={totalMetricHint}
          />
          {statusMetrics.map(({ status, count }) => (
            <Metric
              key={status}
              label={t(`events.status.${status}`, status)}
              value={count ?? "—"}
            />
          ))}
        </div>
      </div>
      <Surface className="events-panel" aria-busy={eventsQuery.isFetching}>
        <form className="toolbar events-toolbar" onSubmit={handleSubmit}>
          <ToolbarSection>
            <label>
              {t("events.filters.search.label")}
              <input
                type="search"
                value={filters.q}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, q: event.target.value }))
                }
                placeholder={t("events.filters.search.placeholder")}
              />
            </label>
            <label>
              {t("events.filters.status.label")}
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">{t("events.filters.status.all")}</option>
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="toolbar-actions">
              <Button type="submit" size="sm">
                {t("events.filters.apply")}
              </Button>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => {
                  setFilters({ q: "", status: "" });
                  setSubmittedFilters({});
                }}
              >
                {t("events.filters.reset")}
              </Button>
            </div>
          </ToolbarSection>
        </form>
        {summaryMessage && (
          <div className="events-panel__summary" aria-live="polite">
            <p className="events-panel__summary-text">{summaryMessage}</p>
            {eventsQuery.isFetching && (
              <span className="events-panel__summary-badge">
                {t("events.list.updating")}
              </span>
            )}
          </div>
        )}
        {isInitialLoading ? (
          <div className="events-panel__loading" aria-live="polite">
            <div className="loading-skeleton" style={{ width: "45%" }} />
            <div
              className="loading-skeleton"
              style={{ height: "140px", marginTop: "1.5rem" }}
            />
          </div>
        ) : hasError ? (
          <InlineMessage tone="danger">
            {t("events.states.error")}
          </InlineMessage>
        ) : events.length === 0 ? (
          <EmptyState
            title={t("events.list.summary.empty")}
            description={t("events.emptyHint")}
            action={
              <LinkButton to="/events/new" variant="secondary">
                {t("events.actions.new")}
              </LinkButton>
            }
          />
        ) : (
          <TableWrapper className="events-table-wrapper">
            <table className="data-table events-table">
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
                  const participantValues = Object.values(
                    event.participants,
                  ) as Array<EventParticipants[keyof EventParticipants]>;
                  const participantsTotal = participantValues.reduce(
                    (acc, value) => acc + value,
                    0,
                  );
                  const statusLabel = t(
                    `events.status.${event.status}`,
                    event.status,
                  );
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
                        {t("events.list.period", {
                          start: event.start_date,
                          end: event.end_date,
                        })}
                      </td>
                      <td>
                        <span className="tag">
                          {t(`events.branches.${event.branch}`, event.branch)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={event.status}>
                          {statusLabel}
                        </StatusBadge>
                      </td>
                      <td>{participantsTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </Surface>
    </section>
  );
};

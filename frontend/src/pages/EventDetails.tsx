import { FormEvent, useEffect, useId, useMemo, useState } from "react";
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
  previewMailTemplate,
  patchCandidate,
  patchTask,
  removeEventMember,
  updateEventMember
} from "../shared/api";
import {
  Event,
  EventAccommodation,
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
import { AttachmentsSection } from "../shared/ui/AttachmentsSection";
import { LogisticsSummary } from "../shared/ui/LogisticsSummary";
import {
  Button,
  EmptyState,
  InlineActions,
  InlineFields,
  InlineMessage,
  Metric,
  SectionHeader,
  Surface,
  TableWrapper,
  ToolbarSection,
} from "../shared/ui/designSystem";
import {
  NormalizedBranchSegment,
  computeAccommodationRequirements,
  computeParticipantTotals,
  computePeakParticipants
} from "../shared/eventUtils";

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

type EventDetailsTab = "candidature" | "attivita" | "preventivi" | "allegati";

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
  segmentsDescription: string;
}

const CandidateRow = ({
  candidate,
  hasConflict,
  members,
  onSave,
  eventTitle,
  eventStart,
  eventEnd,
  segmentsDescription,
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

  const roleLabels = useMemo(
    () => ({
      owner: t("events.members.roles.owner"),
      collab: t("events.members.roles.collab"),
      viewer: t("events.members.roles.viewer"),
    }),
    [t],
  );

  const statusOptions = useMemo(
    () =>
      candidateStatuses.map((item) => ({
        value: item,
        label: t(`events.candidates.status.${item}`),
      })),
    [t],
  );

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
        segments: segmentsDescription,
      })
    : "";
  const mailHref = selectedContact?.email
    ? `mailto:${selectedContact.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : null;
  const telHref = selectedContact?.phone ? `tel:${selectedContact.phone.replace(/\s+/g, "")}` : null;

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
        {candidate.status === "confirmed" && hasConflict && (
          <span className="badge">{t("events.candidates.conflict")}</span>
        )}
      </td>
      <td>
        {contactsLoading ? (
          <InlineMessage>{t("events.candidates.contact.loading")}</InlineMessage>
        ) : contactsError ? (
          <InlineMessage tone="danger">{t("events.candidates.contact.error")}</InlineMessage>
        ) : contactOptions.length === 0 ? (
          <InlineMessage>{t("events.candidates.contact.none")}</InlineMessage>
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
        <InlineActions>
          <Button type="button" size="sm" onClick={handleSendEmail} disabled={!mailHref}>
            {t("events.candidates.actions.email")}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleCall} disabled={!telHref}>
            {t("events.candidates.actions.call")}
          </Button>
        </InlineActions>
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
          <InlineMessage>
            {t("events.candidates.labels.currentAssignee", { name: candidate.assigned_user_name })}
          </InlineMessage>
        )}
      </td>
      <td>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as EventCandidateStatus)}
          aria-label={t("events.candidates.labels.status")}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <time dateTime={candidate.last_update}>
          {new Date(candidate.last_update).toLocaleString("it-IT")}
        </time>
      </td>
      <td>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? t("events.candidates.actions.saving") : t("events.candidates.actions.save")}
        </Button>
        {error && <InlineMessage tone="danger">{error}</InlineMessage>}
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
  const { t } = useTranslation();
  const [status, setStatus] = useState<EventContactTaskStatus>(task.status);
  const [outcome, setOutcome] = useState<EventContactTaskOutcome>(task.outcome);
  const [assignedUserId, setAssignedUserId] = useState(task.assigned_user_id ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabels = useMemo(
    () => ({
      owner: t("events.members.roles.owner"),
      collab: t("events.members.roles.collab"),
      viewer: t("events.members.roles.viewer"),
    }),
    [t],
  );

  const statusOptions = useMemo(
    () =>
      taskStatuses.map((value) => ({
        value,
        label: t(`events.tasks.status.${value}`),
      })),
    [t],
  );

  const outcomeOptions = useMemo(
    () =>
      taskOutcomes.map((value) => ({
        value,
        label: t(`events.tasks.outcome.${value}`),
      })),
    [t],
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(task.id, {
        status,
        outcome,
        assigned_user_id: assignedUserId ? assignedUserId : null,
        notes: notes.trim() ? notes.trim() : null,
      });
    } catch (apiError) {
      setError(
        apiError instanceof ApiError
          ? apiError.message
          : t("events.tasks.errors.updateFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>{task.structure_id ?? t("events.tasks.structureFallback")}</td>
      <td>
        <select
          value={assignedUserId}
          onChange={(event) => setAssignedUserId(event.target.value)}
          aria-label={t("events.tasks.assignee.label")}
        >
          <option value="">{t("events.tasks.assignee.none")}</option>
          {members.map((member) => (
            <option key={member.id} value={member.user.id}>
              {member.user.name} ({roleLabels[member.role]})
            </option>
          ))}
        </select>
        {task.assigned_user_name && (
          <InlineMessage>
            {t("events.tasks.assignee.current", { name: task.assigned_user_name })}
          </InlineMessage>
        )}
      </td>
      <td>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as EventContactTaskStatus)}
          aria-label={t("events.tasks.table.status")}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as EventContactTaskOutcome)}
          aria-label={t("events.tasks.table.outcome")}
        >
          {outcomeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          aria-label={t("events.tasks.table.notes")}
        />
      </td>
      <td>
        <time dateTime={task.updated_at}>{new Date(task.updated_at).toLocaleString("it-IT")}</time>
      </td>
      <td>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? t("events.tasks.actions.saving") : t("events.tasks.actions.save")}
        </Button>
        {error && <InlineMessage tone="danger">{error}</InlineMessage>}
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
  const [activeTab, setActiveTab] = useState<EventDetailsTab>("candidature");
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
  const [mailPreviewError, setMailPreviewError] = useState<string | null>(null);

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
      setCandidateError(
        error instanceof ApiError ? error.message : t("events.candidates.add.error"),
      );
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
      const fallback = t("events.details.team.invite.error");
      const message =
        error instanceof ApiError && typeof error.body === "object" && error.body && "detail" in error.body
          ? String((error.body as { detail?: unknown }).detail ?? fallback)
          : fallback;
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
      const fallback = t("events.details.team.roleUpdateError");
      const message =
        error instanceof ApiError && typeof error.body === "object" && error.body && "detail" in error.body
          ? String((error.body as { detail?: unknown }).detail ?? fallback)
          : fallback;
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
      setMemberError(t("events.details.team.removeError"));
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
      setCandidateError(t("events.candidates.add.missingSlug"));
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
      console.error(error);
      setCandidateError(t("events.candidates.suggestions.error"));
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      setMemberError(t("events.details.team.invite.missingEmail"));
      return;
    }
    await addMemberMutation.mutateAsync({ email: inviteEmail.trim(), role: inviteRole });
  };

  const members = membersQuery.data ?? [];
  const myMembership = members.find((member) => member.user.id === auth.user?.id);
  const isOwner = myMembership?.role === "owner";
  const canManageAttachments = Boolean(
    auth.user?.is_admin || myMembership?.role === "owner" || myMembership?.role === "collab"
  );
  const canViewAttachments = Boolean(auth.user?.is_admin || myMembership);

  const event = eventQuery.data as Event | undefined;
  const summary = summaryQuery.data as EventSummary | undefined;
  const tabPrefix = useId();
  const tabs = useMemo<Array<{ id: EventDetailsTab; label: string }>>(
    () => [
      { id: "candidature", label: t("events.details.tabs.candidates") },
      { id: "attivita", label: t("events.details.tabs.activities") },
      { id: "preventivi", label: t("events.details.tabs.quotes") },
      { id: "allegati", label: t("events.details.tabs.attachments") },
    ],
    [t],
  );
  const tabListId = `${tabPrefix}-tablist`;
  const numberFormatter = useMemo(() => new Intl.NumberFormat("it-IT"), []);
  const candidateStatusOptions = useMemo(
    () =>
      candidateStatuses.map((status) => ({
        value: status,
        label: t(`events.candidates.status.${status}`),
      })),
    [t],
  );
  const statusMetrics = useMemo(
    () =>
      candidateStatusOptions.map((option) => ({
        ...option,
        count: summary?.status_counts[option.value] ?? 0,
      })),
    [candidateStatusOptions, summary],
  );

  const branchSegments = useMemo(
    () => event?.branch_segments ?? [],
    [event?.branch_segments],
  );
  const normalizedSegments = useMemo<NormalizedBranchSegment[]>(
    () =>
      branchSegments.map((segment) => ({
        branch: segment.branch,
        startDate: segment.start_date,
        endDate: segment.end_date,
        youthCount: segment.youth_count,
        leadersCount: segment.leaders_count,
        kambusieriCount: segment.kambusieri_count,
        accommodation: segment.accommodation as EventAccommodation,
        notes: segment.notes ?? undefined,
      })),
    [branchSegments],
  );
  const segmentsTotals = useMemo(() => computeParticipantTotals(normalizedSegments), [normalizedSegments]);
  const accommodationSummary = useMemo(
    () => computeAccommodationRequirements(normalizedSegments),
    [normalizedSegments],
  );
  const peakParticipants = useMemo(
    () => computePeakParticipants(normalizedSegments),
    [normalizedSegments],
  );
  const fallbackParticipants = useMemo(
    () => ({
      lc: event?.participants?.lc ?? 0,
      lc_kambusieri: event?.participants?.lc_kambusieri ?? 0,
      eg: event?.participants?.eg ?? 0,
      eg_kambusieri: event?.participants?.eg_kambusieri ?? 0,
      rs: event?.participants?.rs ?? 0,
      rs_kambusieri: event?.participants?.rs_kambusieri ?? 0,
      leaders: event?.participants?.leaders ?? 0,
      detached_leaders: event?.participants?.detached_leaders ?? 0,
      detached_guests: event?.participants?.detached_guests ?? 0,
    }),
    [
      event?.participants?.detached_guests,
      event?.participants?.detached_leaders,
      event?.participants?.eg,
      event?.participants?.eg_kambusieri,
      event?.participants?.lc,
      event?.participants?.lc_kambusieri,
      event?.participants?.leaders,
      event?.participants?.rs,
      event?.participants?.rs_kambusieri,
    ],
  );
  const displayedParticipantsTotals = useMemo(
    () => (branchSegments.length > 0 ? segmentsTotals : fallbackParticipants),
    [branchSegments.length, fallbackParticipants, segmentsTotals],
  );
  const displayedTotalParticipants = useMemo(
    () => Object.values(displayedParticipantsTotals).reduce((acc, value) => acc + value, 0),
    [displayedParticipantsTotals],
  );
  const roleLabels = useMemo(
    () => ({
      owner: t("events.members.roles.owner"),
      collab: t("events.members.roles.collab"),
      viewer: t("events.members.roles.viewer"),
    }),
    [t],
  );
  const segmentsMailDescription = useMemo(() => {
    if (normalizedSegments.length === 0) {
      const lines: string[] = [];
      if (fallbackParticipants.lc > 0) {
        lines.push(
          t("events.candidates.mail.simpleBranch", {
            branch: t("events.branches.LC"),
            count: fallbackParticipants.lc,
          }),
        );
      }
      if (fallbackParticipants.lc_kambusieri > 0) {
        lines.push(
          t("events.candidates.mail.simpleKambusieri", {
            branch: t("events.branches.LC"),
            count: fallbackParticipants.lc_kambusieri,
          }),
        );
      }
      if (fallbackParticipants.eg > 0) {
        lines.push(
          t("events.candidates.mail.simpleBranch", {
            branch: t("events.branches.EG"),
            count: fallbackParticipants.eg,
          }),
        );
      }
      if (fallbackParticipants.eg_kambusieri > 0) {
        lines.push(
          t("events.candidates.mail.simpleKambusieri", {
            branch: t("events.branches.EG"),
            count: fallbackParticipants.eg_kambusieri,
          }),
        );
      }
      if (fallbackParticipants.rs > 0) {
        lines.push(
          t("events.candidates.mail.simpleBranch", {
            branch: t("events.branches.RS"),
            count: fallbackParticipants.rs,
          }),
        );
      }
      if (fallbackParticipants.rs_kambusieri > 0) {
        lines.push(
          t("events.candidates.mail.simpleKambusieri", {
            branch: t("events.branches.RS"),
            count: fallbackParticipants.rs_kambusieri,
          }),
        );
      }
      if (fallbackParticipants.leaders > 0) {
        lines.push(
          t("events.candidates.mail.simpleLeaders", { count: fallbackParticipants.leaders }),
        );
      }
      if (fallbackParticipants.detached_leaders > 0) {
        lines.push(
          t("events.candidates.mail.simpleDetachedLeaders", {
            count: fallbackParticipants.detached_leaders,
          }),
        );
      }
      if (fallbackParticipants.detached_guests > 0) {
        lines.push(
          t("events.candidates.mail.simpleDetachedGuests", {
            count: fallbackParticipants.detached_guests,
          }),
        );
      }
      if (lines.length === 0) {
        return t("events.candidates.mail.segmentsEmpty");
      }
      lines.push(t("events.candidates.mail.simpleTotal", { count: displayedTotalParticipants }));
      return [t("events.candidates.mail.segmentsHeading"), ...lines].join("\n");
    }
    const lines = normalizedSegments.map((segment) => {
      const branchLabel = t(`events.branches.${segment.branch}`, segment.branch);
      const period = t("events.list.period", { start: segment.startDate, end: segment.endDate });
      const baseParticipantsLabel = t("events.wizard.summary.segmentParticipants", {
        youth: segment.youthCount,
        leaders: segment.leadersCount,
      });
      const extraKambusieri =
        segment.kambusieriCount > 0
          ? t("events.wizard.summary.segmentKambusieri", {
              count: segment.kambusieriCount,
            })
          : null;
      const participantsLabel = extraKambusieri
        ? `${baseParticipantsLabel} · ${extraKambusieri}`
        : baseParticipantsLabel;
      const accommodationLabel = t(
        `events.wizard.segments.accommodation.options.${segment.accommodation}`,
      );
      return `- ${branchLabel} (${period}) · ${participantsLabel} · ${accommodationLabel}`;
    });
    if (peakParticipants > 0) {
      lines.push(t("events.candidates.mail.segmentsPeak", { count: peakParticipants }));
    }
    if (accommodationSummary.needsIndoor) {
      lines.push(t("events.wizard.segments.summaryIndoor", { count: accommodationSummary.indoorCapacity }));
    }
    if (accommodationSummary.needsTents) {
      lines.push(t("events.wizard.segments.summaryTents", { count: accommodationSummary.tentsCapacity }));
    }
    return [t("events.candidates.mail.segmentsHeading"), ...lines].join("\n");
  }, [
    accommodationSummary.indoorCapacity,
    accommodationSummary.needsIndoor,
    accommodationSummary.needsTents,
    accommodationSummary.tentsCapacity,
    displayedTotalParticipants,
    fallbackParticipants.eg,
    fallbackParticipants.eg_kambusieri,
    fallbackParticipants.lc,
    fallbackParticipants.lc_kambusieri,
    fallbackParticipants.leaders,
    fallbackParticipants.detached_leaders,
    fallbackParticipants.detached_guests,
    fallbackParticipants.rs,
    fallbackParticipants.rs_kambusieri,
    normalizedSegments,
    peakParticipants,
    t,
  ]);

  if (!isValidEventId) {
    return (
      <section aria-labelledby="event-details-error">
        <Surface>
          <SectionHeader>
            <h2 id="event-details-error">{t("events.details.errors.invalidId.title")}</h2>
          </SectionHeader>
          <InlineMessage tone="danger">{t("events.details.errors.invalidId.message")}</InlineMessage>
        </Surface>
      </section>
    );
  }

  if (eventQuery.isLoading) {
    return (
      <section aria-busy="true" aria-labelledby="event-details-loading">
        <Surface>
          <SectionHeader>
            <h2 id="event-details-loading">{t("events.details.states.title")}</h2>
          </SectionHeader>
          <InlineMessage>{t("events.details.states.loading")}</InlineMessage>
        </Surface>
      </section>
    );
  }

  if (eventQuery.isError || !event) {
    const error = eventQuery.error;
    const isForbidden = error instanceof ApiError && error.status === 403;
    return (
      <section aria-labelledby="event-details-error">
        <Surface>
          <SectionHeader>
            <h2 id="event-details-error">{t("events.details.errors.title")}</h2>
          </SectionHeader>
          <InlineMessage tone="danger">
            {isForbidden
              ? t("events.details.errors.forbidden")
              : t("events.details.errors.notFound")}
          </InlineMessage>
        </Surface>
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
      console.error(error);
      setIcalError(t("events.details.icalError"));
    } finally {
      setIcalDownloading(false);
    }
  };

  const handleMailPreview = async () => {
    setMailPreviewError(null);
    try {
      const preview = await previewMailTemplate("candidate_status_changed");
      const blob = new Blob([JSON.stringify(preview, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank", "noopener");
      if (!newWindow) {
        setMailPreviewError(t("events.details.mailPreviewError"));
      }
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch (error) {
      console.error(error);
      setMailPreviewError(t("events.details.mailPreviewError"));
    }
  };

  const branchLabel = t(`events.branches.${event.branch}`, event.branch);
  const liveMode = liveState.mode === "sse" ? "sse" : "polling";
  const liveModeLabel = t(`events.details.live.mode.${liveMode}`);
  const candidateFormSlugId = `${tabPrefix}-candidate-slug`;
  const candidateFormAssigneeId = `${tabPrefix}-candidate-assignee`;
  const inviteEmailId = `${tabPrefix}-invite-email`;
  const inviteRoleId = `${tabPrefix}-invite-role`;
  const taskAssigneeId = `${tabPrefix}-task-assignee`;

  return (
    <section aria-labelledby="event-details-title">
      <Surface>
        <SectionHeader className="event-details__header">
          <div>
            <h1 id="event-details-title">{event.title}</h1>
            <p className="helper-text">
              {t("events.details.branchSummary", { branch: branchLabel })}
            </p>
            <p className="helper-text">
              {t("events.details.period", { start: eventStartLabel, end: eventEndLabel })}
            </p>
          </div>
          <InlineActions>
            <span
              className="badge"
              aria-live="polite"
              aria-label={t("events.details.live.ariaLabel", { mode: liveModeLabel })}
            >
              {liveModeLabel}
            </span>
            <Button onClick={handleDownloadIcal} disabled={icalDownloading}>
              {icalDownloading ? t("common.loading") : t("events.details.downloadIcal")}
            </Button>
            {auth.user?.is_admin && (
              <Button variant="secondary" onClick={handleMailPreview}>
                {t("events.details.mailPreviewButton")}
              </Button>
            )}
          </InlineActions>
        </SectionHeader>
        {icalError && <InlineMessage tone="danger">{icalError}</InlineMessage>}
        {mailPreviewError && <InlineMessage tone="danger">{mailPreviewError}</InlineMessage>}
        <ToolbarSection aria-label={t("events.details.metrics.title")}>
          <Metric label={t("events.details.metrics.branch")} value={branchLabel} />
          <Metric
            label={t("events.details.metrics.total")}
            value={numberFormatter.format(displayedTotalParticipants)}
          />
          {peakParticipants > 0 && (
            <Metric
              label={t("events.details.metrics.peak")}
              value={numberFormatter.format(peakParticipants)}
            />
          )}
          {accommodationSummary.needsIndoor && (
            <Metric
              label={t("events.details.metrics.indoor")}
              value={numberFormatter.format(accommodationSummary.indoorCapacity)}
            />
          )}
          {accommodationSummary.needsTents && (
            <Metric
              label={t("events.details.metrics.tents")}
              value={numberFormatter.format(accommodationSummary.tentsCapacity)}
            />
          )}
        </ToolbarSection>
        {summary && (
          <ToolbarSection aria-label={t("events.details.summary.title")}>
            {statusMetrics.map((metric) => (
              <Metric
                key={metric.value}
                label={metric.label}
                value={numberFormatter.format(metric.count)}
              />
            ))}
          </ToolbarSection>
        )}
        {summary?.has_conflicts && (
          <InlineMessage tone="danger">{t("events.details.summary.hasConflicts")}</InlineMessage>
        )}
      </Surface>

      <Surface>
        <SectionHeader>
          <div>
            <h2>{t("events.details.segments.title")}</h2>
            <p className="helper-text">
              {t("events.details.segments.subtitle", {
                total: numberFormatter.format(displayedTotalParticipants),
              })}
            </p>
          </div>
        </SectionHeader>
        <ToolbarSection className="branch-segments__summary">
          <div>
            <h3>{t("events.details.segments.summaryTitle")}</h3>
            <ul>
              <li>
                {t("events.wizard.segments.summaryResolvedBranch", {
                  branch: branchLabel,
                })}
              </li>
              {displayedParticipantsTotals.lc > 0 && (
                <li>
                  {t("events.wizard.segments.summaryBranch", {
                    branch: t("events.branches.LC"),
                    count: displayedParticipantsTotals.lc,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.lc_kambusieri > 0 && (
                <li>
                  {t("events.wizard.segments.summaryKambusieri", {
                    branch: t("events.branches.LC"),
                    count: displayedParticipantsTotals.lc_kambusieri,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.eg > 0 && (
                <li>
                  {t("events.wizard.segments.summaryBranch", {
                    branch: t("events.branches.EG"),
                    count: displayedParticipantsTotals.eg,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.eg_kambusieri > 0 && (
                <li>
                  {t("events.wizard.segments.summaryKambusieri", {
                    branch: t("events.branches.EG"),
                    count: displayedParticipantsTotals.eg_kambusieri,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.rs > 0 && (
                <li>
                  {t("events.wizard.segments.summaryBranch", {
                    branch: t("events.branches.RS"),
                    count: displayedParticipantsTotals.rs,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.rs_kambusieri > 0 && (
                <li>
                  {t("events.wizard.segments.summaryKambusieri", {
                    branch: t("events.branches.RS"),
                    count: displayedParticipantsTotals.rs_kambusieri,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.leaders > 0 && (
                <li>
                  {t("events.wizard.segments.summaryLeaders", {
                    count: displayedParticipantsTotals.leaders,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.detached_leaders > 0 && (
                <li>
                  {t("events.wizard.segments.summaryDetachedLeaders", {
                    count: displayedParticipantsTotals.detached_leaders,
                  })}
                </li>
              )}
              {displayedParticipantsTotals.detached_guests > 0 && (
                <li>
                  {t("events.wizard.segments.summaryDetachedGuests", {
                    count: displayedParticipantsTotals.detached_guests,
                  })}
                </li>
              )}
              <li>
                {t("events.wizard.segments.summaryTotal", {
                  count: displayedTotalParticipants,
                })}
              </li>
              {branchSegments.length > 0 && peakParticipants > 0 && (
                <li>
                  {t("events.wizard.segments.summaryPeak", { count: peakParticipants })}
                </li>
              )}
              {branchSegments.length > 0 && accommodationSummary.needsIndoor && (
                <li>
                  {t("events.wizard.segments.summaryIndoor", {
                    count: accommodationSummary.indoorCapacity,
                  })}
                </li>
              )}
              {branchSegments.length > 0 && accommodationSummary.needsTents && (
                <li>
                  {t("events.wizard.segments.summaryTents", {
                    count: accommodationSummary.tentsCapacity,
                  })}
                </li>
              )}
            </ul>
          </div>
          <LogisticsSummary
            accommodation={accommodationSummary}
            peakParticipants={peakParticipants}
          />
        </ToolbarSection>
        {branchSegments.length === 0 ? (
          <EmptyState
            title={t("events.details.segments.emptyTitle")}
            description={t("events.details.segments.empty")}
          />
        ) : (
          <ul className="branch-segments__list">
            {branchSegments.map((segment) => {
              const segmentBranchLabel = t(`events.branches.${segment.branch}`, segment.branch);
              const periodLabel = t("events.list.period", {
                start: segment.start_date,
                end: segment.end_date,
              });
              const baseParticipantsLabel = t("events.wizard.summary.segmentParticipants", {
                youth: segment.youth_count,
                leaders: segment.leaders_count,
              });
              const extraKambusieri =
                segment.kambusieri_count > 0
                  ? t("events.wizard.summary.segmentKambusieri", {
                      count: segment.kambusieri_count,
                    })
                  : null;
              const participantsLabel = extraKambusieri
                ? `${baseParticipantsLabel} · ${extraKambusieri}`
                : baseParticipantsLabel;
              const accommodationLabel = t(
                `events.wizard.segments.accommodation.options.${segment.accommodation}`,
              );
              return (
                <li key={segment.id}>
                  <div className="branch-segments__list-info">
                    <strong>{segmentBranchLabel}</strong>
                    <span>{periodLabel}</span>
                            <span>{participantsLabel}</span>
                    <span>{accommodationLabel}</span>
                  </div>
                  {segment.notes && (
                    <p className="branch-segments__list-notes">
                      <strong>{t("events.details.segments.notesLabel")} </strong>
                      {segment.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      <Surface>
        <SectionHeader>
          <div>
            <h2>{t("events.details.team.title")}</h2>
          </div>
        </SectionHeader>
        {memberError && <InlineMessage tone="danger">{memberError}</InlineMessage>}
        {membersQuery.isLoading ? (
          <InlineMessage>{t("events.details.team.loading")}</InlineMessage>
        ) : membersQuery.isError ? (
          <InlineMessage tone="danger">{t("events.details.team.error")}</InlineMessage>
        ) : members.length === 0 ? (
          <EmptyState
            title={t("events.details.team.emptyTitle")}
            description={t("events.details.team.emptyDescription")}
          />
        ) : (
          <TableWrapper>
            <table>
              <thead>
                <tr>
                  <th>{t("events.details.team.table.name")}</th>
                  <th>{t("events.details.team.table.role")}</th>
                  {isOwner && <th>{t("events.details.team.table.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
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
                              role: event.target.value as EventMemberRole,
                            })
                          }
                          aria-label={t("events.details.team.roleSelect", { name: member.user.name })}
                          disabled={
                            updateMemberMutation.isPending ||
                            (member.user.id === auth.user?.id && member.role === "owner")
                          }
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
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeMemberMutation.mutate(member.id)}
                          disabled={removeMemberMutation.isPending || member.user.id === auth.user?.id}
                        >
                          {t("events.details.team.remove")}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
        {isOwner && (
          <form onSubmit={handleInvite}>
            <InlineFields>
              <label htmlFor={inviteEmailId}>
                {t("events.details.team.invite.email")}
                <input
                  id={inviteEmailId}
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="utente@example.com"
                  required
                />
              </label>
              <label htmlFor={inviteRoleId}>
                {t("events.details.team.invite.role")}
                <select
                  id={inviteRoleId}
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as EventMemberRole)}
                >
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </InlineFields>
            <InlineActions>
              <Button type="submit" disabled={addMemberMutation.isPending}>
                {addMemberMutation.isPending
                  ? t("events.details.team.invite.pending")
                  : t("events.details.team.invite.submit")}
              </Button>
            </InlineActions>
          </form>
        )}
      </Surface>
      <Surface>
        <div
          className="tabs"
          role="tablist"
          aria-label={t("events.details.tabs.ariaLabel")}
          id={tabListId}
        >
          {tabs.map((tab) => {
            const tabId = `${tabPrefix}-${tab.id}`;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={tabId}
                aria-selected={activeTab === tab.id}
                aria-controls={`${tabId}-panel`}
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {activeTab === "candidature" && (
          <div
            role="tabpanel"
            id={`${tabPrefix}-candidature-panel`}
            aria-labelledby={`${tabPrefix}-candidature`}
          >
            <form onSubmit={handleAddCandidate}>
              <InlineFields>
                <label htmlFor={candidateFormSlugId}>
                  {t("events.candidates.add.label")}
                  <input
                    id={candidateFormSlugId}
                    type="text"
                    value={candidateSlug}
                    onChange={(event) => setCandidateSlug(event.target.value)}
                    placeholder={t("events.candidates.add.placeholder")}
                  />
                </label>
                <label htmlFor={candidateFormAssigneeId}>
                  {t("events.candidates.add.assignee")}
                  <select
                    id={candidateFormAssigneeId}
                    value={candidateAssignee}
                    onChange={(event) => setCandidateAssignee(event.target.value)}
                  >
                    <option value="">{t("events.candidates.labels.noAssignee")}</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.user.id}>
                        {member.user.name}
                      </option>
                    ))}
                  </select>
                </label>
              </InlineFields>
              <InlineActions>
                <Button type="submit" disabled={addCandidateMutation.isPending}>
                  {addCandidateMutation.isPending
                    ? t("events.candidates.add.submitting")
                    : t("events.candidates.add.submit")}
                </Button>
                <Button type="button" variant="secondary" onClick={handleLoadSuggestions}>
                  {t("events.candidates.suggestions.action")}
                </Button>
              </InlineActions>
            </form>
            {candidateError && <InlineMessage tone="danger">{candidateError}</InlineMessage>}
            {suggestions.length > 0 && (
              <div className="event-details__suggestions">
                <h3>{t("events.candidates.suggestions.title")}</h3>
                <ul>
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.structure_id}>
                      <span>{suggestion.structure_name}</span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          addCandidateMutation.mutate({
                            structure_slug: suggestion.structure_slug,
                            assigned_user_id: candidateAssignee ? candidateAssignee : undefined,
                          })
                        }
                      >
                        {t("events.candidates.suggestions.add")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <TableWrapper>
              <table>
                <thead>
                  <tr>
                    <th>{t("events.candidates.table.structure")}</th>
                    <th>{t("events.candidates.table.contact")}</th>
                    <th>{t("events.candidates.table.quickActions")}</th>
                    <th>{t("events.candidates.table.assignee")}</th>
                    <th>{t("events.candidates.table.status")}</th>
                    <th>{t("events.candidates.table.updated")}</th>
                    <th>{t("events.candidates.table.actions")}</th>
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
                        segmentsDescription={segmentsMailDescription}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>{t("events.candidates.table.empty")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrapper>
          </div>
        )}
        {activeTab === "attivita" && (
          <div
            role="tabpanel"
            id={`${tabPrefix}-attivita-panel`}
            aria-labelledby={`${tabPrefix}-attivita`}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addTaskMutation.mutate({
                  assigned_user_id: newTaskAssignee ? newTaskAssignee : undefined,
                });
              }}
            >
              <InlineFields>
                <label htmlFor={taskAssigneeId}>
                  {t("events.tasks.form.assignee")}
                  <select
                    id={taskAssigneeId}
                    value={newTaskAssignee}
                    onChange={(event) => setNewTaskAssignee(event.target.value)}
                  >
                    <option value="">{t("events.tasks.assignee.none")}</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.user.id}>
                        {member.user.name}
                      </option>
                    ))}
                  </select>
                </label>
              </InlineFields>
              <InlineActions>
                <Button type="submit" disabled={addTaskMutation.isPending}>
                  {addTaskMutation.isPending
                    ? t("events.tasks.actions.creating")
                    : t("events.tasks.actions.create")}
                </Button>
              </InlineActions>
            </form>
            <TableWrapper>
              <table>
                <thead>
                  <tr>
                    <th>{t("events.tasks.table.structure")}</th>
                    <th>{t("events.tasks.table.assignee")}</th>
                    <th>{t("events.tasks.table.status")}</th>
                    <th>{t("events.tasks.table.outcome")}</th>
                    <th>{t("events.tasks.table.notes")}</th>
                    <th>{t("events.tasks.table.updated")}</th>
                    <th>{t("events.tasks.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {event.tasks?.length ? (
                    event.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} members={members} onSave={handleTaskSave} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>{t("events.tasks.table.empty")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrapper>
          </div>
        )}
        {activeTab === "preventivi" && (
          <div
            role="tabpanel"
            id={`${tabPrefix}-preventivi-panel`}
            aria-labelledby={`${tabPrefix}-preventivi`}
          >
            <EventQuotesTab event={event} />
          </div>
        )}
        {activeTab === "allegati" && (
          <div
            role="tabpanel"
            id={`${tabPrefix}-allegati-panel`}
            aria-labelledby={`${tabPrefix}-allegati`}
          >
            {!canViewAttachments ? (
              <InlineMessage tone="danger">{t("attachments.state.forbidden")}</InlineMessage>
            ) : (
              <AttachmentsSection
                ownerType="event"
                ownerId={event.id}
                canUpload={canManageAttachments}
                canDelete={canManageAttachments}
              />
            )}
          </div>
        )}
      </Surface>
    </section>
  );
};

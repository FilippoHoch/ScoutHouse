import { useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  addCandidate,
  createEvent,
  getSuggestions,
} from "../shared/api";
import {
  Event,
  EventAccommodation,
  EventBranch,
  EventSuggestion,
  EventStatus,
  EventCreateDto,
  EventParticipants,
} from "../shared/types";
import { LogisticsSummary } from "../shared/ui/LogisticsSummary";
import {
  Button,
  InlineActions,
  InlineFields,
  InlineMessage,
  Surface,
} from "../shared/ui/designSystem";
import {
  NormalizedBranchSegment,
  computeAccommodationRequirements,
  computeParticipantTotals,
  computePeakParticipants,
} from "../shared/eventUtils";

const branches: EventBranch[] = ["LC", "EG", "RS", "ALL"];
const statuses: EventStatus[] = ["draft", "planning", "booked", "archived"];

type WizardStep = 1 | 2 | 3;

type PlanningMode = "simple" | "segments";

type BranchSegmentFormValue = {
  id: string;
  branch: EventBranch;
  startDate: string;
  endDate: string;
  youthCount: string;
  leadersCount: string;
  kambusieriCount: string;
  accommodation: EventAccommodation;
  notes: string;
};

type ParticipantsFormValue = {
  lc: string;
  lcKambusieri: string;
  eg: string;
  egKambusieri: string;
  rs: string;
  leaders: string;
  detachedLeaders: string;
  detachedGuests: string;
};

interface WizardState {
  title: string;
  branch: EventBranch;
  start_date: string;
  end_date: string;
  budget_total: string;
  notes: string;
  status: EventStatus;
  planningMode: PlanningMode;
  branchSegments: BranchSegmentFormValue[];
  participants: ParticipantsFormValue;
  branchSelection: EventBranch[];
}

const defaultWizardState: WizardState = {
  title: "",
  branch: "LC",
  start_date: "",
  end_date: "",
  budget_total: "",
  notes: "",
  status: "draft",
  planningMode: "simple",
  branchSegments: [],
  participants: {
    lc: "",
    lcKambusieri: "",
    eg: "",
    egKambusieri: "",
    rs: "",
    leaders: "",
    detachedLeaders: "",
    detachedGuests: "",
  },
  branchSelection: ["LC"],
};

const generateSegmentId = (): string => Math.random().toString(36).slice(2, 10);

const orderedBranches: EventBranch[] = ["LC", "EG", "RS"];

const resolveBranchFromSelection = (
  selection: EventBranch[],
  fallback: EventBranch,
): EventBranch => {
  if (selection.length === 0) {
    return fallback;
  }
  if (selection.includes("ALL")) {
    return "ALL";
  }
  if (selection.length === 1) {
    return selection[0];
  }
  return "ALL";
};

const isMultiBranchSelection = (selection: EventBranch[]): boolean => {
  if (selection.includes("ALL")) {
    return true;
  }
  return selection.filter((branch) => branch !== "ALL").length > 1;
};

const resolveSegmentBranchesFromSelection = (
  selection: EventBranch[],
): EventBranch[] => {
  if (selection.length === 0) {
    return [];
  }
  if (selection.includes("ALL")) {
    return orderedBranches;
  }
  return selection.filter((branch) => branch !== "ALL");
};

const defaultAccommodationForBranch = (
  branch: EventBranch,
): EventAccommodation => {
  if (branch === "LC") {
    return "indoor";
  }
  if (branch === "EG" || branch === "RS") {
    return "tents";
  }
  return "indoor";
};

interface EventCreateWizardProps {
  onClose: () => void;
  onCreated: (event: Event) => void;
}

const EventCreateWizard = ({ onClose, onCreated }: EventCreateWizardProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<WizardStep>(1);
  const [state, setState] = useState<WizardState>(defaultWizardState);
  const [error, setError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<Event | null>(null);
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [addedStructures, setAddedStructures] = useState<Set<number>>(
    new Set(),
  );
  const planningModeIdPrefix = useId();
  const planningModeSimpleId = `${planningModeIdPrefix}-simple`;
  const planningModeSegmentsId = `${planningModeIdPrefix}-segments`;
  const planningModeSimpleLabelId = `${planningModeSimpleId}-label`;
  const planningModeSegmentsLabelId = `${planningModeSegmentsId}-label`;
  const queryClient = useQueryClient();
  const wizardSteps: Array<{ id: WizardStep; label: string }> = [
    { id: 1, label: t("events.wizard.steps.details") },
    { id: 2, label: t("events.wizard.steps.branches") },
    { id: 3, label: t("events.wizard.steps.review") },
  ];
  const branchOptions = useMemo(
    () =>
      branches.map((branch) => ({
        value: branch,
        label: t(`events.branches.${branch}`, branch),
      })),
    [t],
  );
  const branchSelectionOptions = useMemo(() => {
    const branchesWithAll: EventBranch[] = [...orderedBranches, "ALL"];
    return branchesWithAll.map((branch) => ({
      value: branch,
      label: t(`events.branches.${branch}`, branch),
      description: t(
        `events.wizard.details.branches.options.${branch}.description`,
        "",
      ),
      hint: t(`events.wizard.details.branches.options.${branch}.hint`, ""),
    }));
  }, [t]);
  const statusOptions = useMemo(
    () =>
      statuses.map((status) => ({
        value: status,
        label: t(`events.status.${status}`, status),
      })),
    [t],
  );
  const detailHighlights = useMemo(
    () =>
      t("events.wizard.details.introHighlights", {
        returnObjects: true,
      }) as string[],
    [t],
  );

  const segmentBranchOptions = useMemo(
    () => branchOptions.filter((option) => option.value !== "ALL"),
    [branchOptions],
  );
  const accommodationOptions = useMemo(
    () => [
      {
        value: "indoor",
        label: t("events.wizard.segments.accommodation.options.indoor"),
      },
      {
        value: "tents",
        label: t("events.wizard.segments.accommodation.options.tents"),
      },
    ],
    [t],
  );

  const parseCount = (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  };

  const normalizedSegments = useMemo<NormalizedBranchSegment[]>(
    () =>
      state.branchSegments.map((segment) => ({
        branch: segment.branch,
        startDate: segment.startDate,
        endDate: segment.endDate,
        youthCount: parseCount(segment.youthCount),
        leadersCount: parseCount(segment.leadersCount),
        kambusieriCount:
          segment.branch === "RS" ? 0 : parseCount(segment.kambusieriCount),
        accommodation: segment.accommodation,
        notes: segment.notes.trim() ? segment.notes.trim() : undefined,
      })),
    [state.branchSegments],
  );

  const simpleParticipants = useMemo<EventParticipants>(
    () => ({
      lc: parseCount(state.participants.lc),
      lc_kambusieri: parseCount(state.participants.lcKambusieri),
      eg: parseCount(state.participants.eg),
      eg_kambusieri: parseCount(state.participants.egKambusieri),
      rs: parseCount(state.participants.rs),
      rs_kambusieri: 0,
      leaders: parseCount(state.participants.leaders),
      detached_leaders: parseCount(state.participants.detachedLeaders),
      detached_guests: parseCount(state.participants.detachedGuests),
    }),
    [
      state.participants.detachedGuests,
      state.participants.detachedLeaders,
      state.participants.eg,
      state.participants.egKambusieri,
      state.participants.lc,
      state.participants.lcKambusieri,
      state.participants.leaders,
      state.participants.rs,
    ],
  );

  const peakParticipants = useMemo(
    () =>
      state.planningMode === "segments"
        ? computePeakParticipants(normalizedSegments)
        : 0,
    [normalizedSegments, state.planningMode],
  );

  const resolvedBranch = useMemo<EventBranch>(() => {
    if (state.planningMode !== "segments") {
      return state.branch;
    }
    const uniqueBranches = Array.from(
      new Set(normalizedSegments.map((segment) => segment.branch)),
    );
    if (uniqueBranches.length === 0) {
      return state.branch;
    }
    if (uniqueBranches.length === 1) {
      const onlyBranch = uniqueBranches[0];
      if (!onlyBranch) {
        return state.branch;
      }
      return state.branch === "ALL" ? state.branch : onlyBranch;
    }
    return "ALL";
  }, [normalizedSegments, state.branch, state.planningMode]);

  const branchResolutionMessage = useMemo(() => {
    if (state.planningMode !== "segments") {
      return null;
    }
    if (state.branchSegments.length === 0) {
      return null;
    }
    if (resolvedBranch === state.branch) {
      return null;
    }
    if (resolvedBranch === "ALL") {
      return t("events.wizard.segments.branchAutoAll");
    }
    return t("events.wizard.segments.branchAutoSingle", {
      branch: t(`events.branches.${resolvedBranch}`, resolvedBranch),
    });
  }, [
    resolvedBranch,
    state.branch,
    state.branchSegments.length,
    state.planningMode,
    t,
  ]);

  const showPlanningSummary =
    state.planningMode === "segments" ? state.branchSegments.length > 0 : true;

  const branchSelectionSummary = useMemo(() => {
    if (state.branchSelection.includes("ALL")) {
      return t("events.wizard.details.branches.summaryAll");
    }
    const selected = state.branchSelection.filter((branch) => branch !== "ALL");
    if (selected.length === 0) {
      return t("events.wizard.details.branches.summaryEmpty");
    }
    if (selected.length === 1) {
      return t("events.wizard.details.branches.summarySingle", {
        branch: t(`events.branches.${selected[0]}`, selected[0]),
      });
    }
    const labelList = selected
      .map((branch) => t(`events.branches.${branch}`, branch))
      .join(", ");
    return t("events.wizard.details.branches.summaryMultiple", {
      count: selected.length,
      branches: labelList,
    });
  }, [state.branchSelection, t]);

  const segmentsTotals = useMemo(
    () => computeParticipantTotals(normalizedSegments),
    [normalizedSegments],
  );
  const segmentsWithExtras = useMemo(
    () => ({
      ...segmentsTotals,
      detached_leaders: parseCount(state.participants.detachedLeaders),
      detached_guests: parseCount(state.participants.detachedGuests),
    }),
    [
      segmentsTotals,
      state.participants.detachedGuests,
      state.participants.detachedLeaders,
    ],
  );
  const participantsTotals =
    state.planningMode === "segments" ? segmentsWithExtras : simpleParticipants;
  const accommodationSummary = useMemo(
    () =>
      state.planningMode === "segments"
        ? computeAccommodationRequirements(normalizedSegments)
        : {
            needsIndoor: false,
            needsTents: false,
            indoorCapacity: 0,
            tentsCapacity: 0,
          },
    [normalizedSegments, state.planningMode],
  );
  const totalParticipants = useMemo(
    () =>
      Object.values(participantsTotals).reduce((acc, value) => acc + value, 0),
    [participantsTotals],
  );

  const createdNormalizedSegments = useMemo<NormalizedBranchSegment[]>(() => {
    if (!createdEvent) {
      return [];
    }
    return (createdEvent.branch_segments ?? []).map((segment) => ({
      branch: segment.branch,
      startDate: segment.start_date,
      endDate: segment.end_date,
      youthCount: segment.youth_count,
      leadersCount: segment.leaders_count,
      kambusieriCount: segment.kambusieri_count,
      accommodation: segment.accommodation as EventAccommodation,
      notes: segment.notes ?? undefined,
    }));
  }, [createdEvent]);
  const createdSegmentsTotals = useMemo(
    () => computeParticipantTotals(createdNormalizedSegments),
    [createdNormalizedSegments],
  );
  const createdPeakParticipants = useMemo(
    () => computePeakParticipants(createdNormalizedSegments),
    [createdNormalizedSegments],
  );
  const createdAccommodationSummary = useMemo(
    () => computeAccommodationRequirements(createdNormalizedSegments),
    [createdNormalizedSegments],
  );
  const createdParticipantsTotals = useMemo(
    () =>
      createdNormalizedSegments.length > 0
        ? createdSegmentsTotals
        : (createdEvent?.participants ?? {
            lc: 0,
            lc_kambusieri: 0,
            eg: 0,
            eg_kambusieri: 0,
            rs: 0,
            rs_kambusieri: 0,
            leaders: 0,
            detached_leaders: 0,
            detached_guests: 0,
          }),
    [createdEvent, createdNormalizedSegments.length, createdSegmentsTotals],
  );
  const createdTotalParticipants = useMemo(
    () =>
      Object.values(createdParticipantsTotals).reduce(
        (acc, value) => acc + value,
        0,
      ),
    [createdParticipantsTotals],
  );

  const createMutation = useMutation({
    mutationFn: (dto: EventCreateDto) => createEvent(dto),
    onSuccess: (event) => {
      setCreatedEvent(event);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const addCandidateMutation = useMutation({
    mutationFn: ({
      eventId,
      structureId,
    }: {
      eventId: number;
      structureId: number;
    }) => addCandidate(eventId, { structure_id: structureId }),
    onSuccess: (_, variables) => {
      setAddedStructures((prev) => new Set(prev).add(variables.structureId));
      queryClient.invalidateQueries({ queryKey: ["event", variables.eventId] });
    },
  });

  const handleNextFromDetails = () => {
    if (!state.title.trim() || !state.start_date || !state.end_date) {
      setError(t("events.wizard.errors.required"));
      return;
    }
    if (state.branchSelection.length === 0) {
      setError(t("events.wizard.errors.branchSelection"));
      return;
    }
    setState((prev) => {
      const selection = prev.branchSelection;
      const nextBranch = resolveBranchFromSelection(selection, prev.branch);
      const shouldForceSegments = isMultiBranchSelection(selection);
      return {
        ...prev,
        branch: nextBranch,
        planningMode: shouldForceSegments ? "segments" : prev.planningMode,
      };
    });
    setError(null);
    setStep(2);
  };

  const toggleBranchSelection = (branch: EventBranch) => {
    setState((prev) => {
      let nextSelection: EventBranch[];
      if (branch === "ALL") {
        if (prev.branchSelection.includes("ALL")) {
          nextSelection = ["LC"];
        } else {
          nextSelection = ["ALL"];
        }
      } else {
        const withoutAll = prev.branchSelection.filter(
          (value) => value !== "ALL",
        );
        if (withoutAll.includes(branch)) {
          const filtered = withoutAll.filter((value) => value !== branch);
          if (filtered.length === 0) {
            return prev;
          }
          nextSelection = filtered;
        } else {
          nextSelection = [...withoutAll, branch];
        }
      }
      const nextBranch = resolveBranchFromSelection(nextSelection, prev.branch);
      const forceSegments = isMultiBranchSelection(nextSelection);
      return {
        ...prev,
        branchSelection: nextSelection,
        branch: nextBranch,
        planningMode: forceSegments ? "segments" : prev.planningMode,
      };
    });
  };

  const updateSegment = (
    id: string,
    partial: Partial<BranchSegmentFormValue>,
  ) => {
    setState((prev) => ({
      ...prev,
      branchSegments: prev.branchSegments.map((segment) =>
        segment.id === id ? { ...segment, ...partial } : segment,
      ),
    }));
  };

  const handleAddSegment = () => {
    const preferredBranches = resolveSegmentBranchesFromSelection(
      state.branchSelection,
    );
    const fallbackBranch =
      preferredBranches[0] ??
      (segmentBranchOptions[0]?.value as EventBranch | undefined) ??
      "LC";
    const defaultAccommodation = defaultAccommodationForBranch(fallbackBranch);
    setState((prev) => ({
      ...prev,
      branchSegments: [
        ...prev.branchSegments,
        {
          id: generateSegmentId(),
          branch: fallbackBranch,
          startDate: prev.start_date,
          endDate: prev.end_date,
          youthCount: "",
          leadersCount: "",
          kambusieriCount: "",
          accommodation: defaultAccommodation,
          notes: "",
        },
      ],
    }));
  };

  const handleRemoveSegment = (id: string) => {
    setState((prev) => ({
      ...prev,
      branchSegments: prev.branchSegments.filter(
        (segment) => segment.id !== id,
      ),
    }));
  };

  useEffect(() => {
    if (step !== 2) {
      return;
    }
    setState((prev) => {
      if (prev.planningMode !== "segments") {
        return prev;
      }
      const targetBranches = resolveSegmentBranchesFromSelection(
        prev.branchSelection,
      );
      if (targetBranches.length === 0) {
        return prev;
      }
      const segmentsByBranch = new Map(
        prev.branchSegments.map((segment) => [segment.branch, segment]),
      );
      const nextSegments = targetBranches.map((branch) => {
        const existing = segmentsByBranch.get(branch);
        if (existing) {
          return existing;
        }
        return {
          id: generateSegmentId(),
          branch,
          startDate: prev.start_date,
          endDate: prev.end_date,
          youthCount: "",
          leadersCount: "",
          kambusieriCount: "",
          accommodation: defaultAccommodationForBranch(branch),
          notes: "",
        };
      });
      const hasChange =
        nextSegments.length !== prev.branchSegments.length ||
        nextSegments.some(
          (segment, index) => segment !== prev.branchSegments[index],
        );
      if (!hasChange) {
        return prev;
      }
      return {
        ...prev,
        branchSegments: nextSegments,
      };
    });
  }, [
    step,
    state.branchSelection,
    state.planningMode,
    state.branchSegments,
    state.start_date,
    state.end_date,
  ]);

  const validateSimpleParticipants = (): string | null => {
    const totals = simpleParticipants;
    if (Object.values(totals).every((value) => value === 0)) {
      return t("events.wizard.errors.simpleParticipants");
    }
    return null;
  };

  const validateSegments = (): string | null => {
    if (state.branchSegments.length === 0) {
      return t("events.wizard.errors.segmentsRequired");
    }
    if (!state.start_date || !state.end_date) {
      return t("events.wizard.errors.dates");
    }
    const eventStart = new Date(state.start_date);
    const eventEnd = new Date(state.end_date);
    if (
      Number.isNaN(eventStart.getTime()) ||
      Number.isNaN(eventEnd.getTime())
    ) {
      return t("events.wizard.errors.dates");
    }
    for (const segment of state.branchSegments) {
      if (segment.branch === "ALL") {
        return t("events.wizard.errors.segmentBranch");
      }
      if (!segment.startDate || !segment.endDate) {
        return t("events.wizard.errors.segmentDates");
      }
      const start = new Date(segment.startDate);
      const end = new Date(segment.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return t("events.wizard.errors.segmentDates");
      }
      if (end < start) {
        return t("events.wizard.errors.segmentOrder");
      }
      if (start < eventStart || end > eventEnd) {
        return t("events.wizard.errors.segmentRange");
      }
    }
    return null;
  };

  const handleCreateEvent = async () => {
    if (!state.start_date || !state.end_date) {
      setError(t("events.wizard.errors.dates"));
      return;
    }
    setError(null);
    let participantsPayload: EventParticipants | undefined;
    let branchSegmentsPayload: EventCreateDto["branch_segments"] | undefined;
    let targetBranch = state.branch;

    if (state.planningMode === "segments") {
      const segmentError = validateSegments();
      if (segmentError) {
        setError(segmentError);
        return;
      }
      const segmentPayload = state.branchSegments.map((segment, index) => {
        const normalized = normalizedSegments[index];
        return {
          branch: normalized.branch,
          start_date: segment.startDate,
          end_date: segment.endDate,
          youth_count: normalized.youthCount,
          leaders_count: normalized.leadersCount,
          kambusieri_count: normalized.kambusieriCount,
          accommodation: normalized.accommodation,
          notes: normalized.notes,
        };
      });
      participantsPayload = segmentsWithExtras;
      branchSegmentsPayload = segmentPayload;
      targetBranch = resolvedBranch;
    } else {
      const participantsError = validateSimpleParticipants();
      if (participantsError) {
        setError(participantsError);
        return;
      }
      participantsPayload = simpleParticipants;
      branchSegmentsPayload = undefined;
      targetBranch = state.branch;
    }

    const dto: EventCreateDto = {
      title: state.title.trim(),
      branch: targetBranch,
      start_date: state.start_date,
      end_date: state.end_date,
      participants: participantsPayload,
      status: state.status,
      notes: state.notes.trim() || undefined,
      budget_total: state.budget_total
        ? Number.parseFloat(state.budget_total)
        : undefined,
      branch_segments: branchSegmentsPayload,
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
      setError(
        apiError instanceof ApiError
          ? apiError.message
          : t("events.wizard.errors.create"),
      );
    }
  };

  const handleAddSuggestion = async (structureId: number) => {
    if (!createdEvent) {
      return;
    }
    try {
      await addCandidateMutation.mutateAsync({
        eventId: createdEvent.id,
        structureId,
      });
    } catch (apiError) {
      setError(
        apiError instanceof ApiError
          ? apiError.message
          : t("events.wizard.errors.addStructure"),
      );
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
    <div className="event-create-wizard" aria-live="polite">
      <header className="event-create-wizard__header">
        <h2>{t("events.wizard.title")}</h2>
        <p>
          {t(
            "events.wizard.pageSubtitle",
            "Organizza ogni dettaglio in tre passaggi chiari.",
          )}
        </p>
      </header>
      <div
        className="wizard-steps"
        role="list"
        aria-label={t("events.wizard.steps.label")}
      >
        {wizardSteps.map((wizardStep) => (
          <span
            key={wizardStep.id}
            className="wizard-step-pill"
            data-active={(wizardStep.id === step).toString()}
          >
            {wizardStep.id}. {wizardStep.label}
          </span>
        ))}
      </div>
      {error && <InlineMessage tone="danger">{error}</InlineMessage>}
      {step === 1 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleNextFromDetails();
          }}
          className="wizard-step wizard-step--details"
        >
          <div className="wizard-details__grid">
            <section className="wizard-details__intro">
              <h4>{t("events.wizard.details.introTitle")}</h4>
              <p>{t("events.wizard.details.introDescription")}</p>
              {detailHighlights.length > 0 && (
                <ul className="wizard-details__highlights">
                  {detailHighlights
                    .filter(
                      (item) =>
                        typeof item === "string" && item.trim().length > 0,
                    )
                    .map((item, index) => (
                      <li key={`${item}-${index}`}>{item}</li>
                    ))}
                </ul>
              )}
            </section>
            <section className="wizard-details__form">
              <fieldset className="wizard-details__basics">
                <legend>{t("events.wizard.details.basicsTitle")}</legend>
                <label>
                  {t("events.wizard.fields.title")}
                  <input
                    type="text"
                    value={state.title}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <InlineFields>
                  <label>
                    {t("events.wizard.fields.start")}
                    <input
                      type="date"
                      value={state.start_date}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          start_date: event.target.value,
                        }))
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
                        setState((prev) => ({
                          ...prev,
                          end_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </InlineFields>
              </fieldset>
              <fieldset className="wizard-details__branches">
                <legend>{t("events.wizard.details.branches.title")}</legend>
                <p className="wizard-details__hint">
                  {t("events.wizard.details.branches.hint")}
                </p>
                <div className="branch-selector">
                  {branchSelectionOptions.map((option) => {
                    const isSelected = state.branchSelection.includes(
                      option.value,
                    );
                    return (
                      <label
                        key={option.value}
                        className="branch-selector__option"
                        data-active={isSelected.toString()}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => toggleBranchSelection(option.value)}
                        />
                        <span className="branch-selector__title">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="branch-selector__description">
                            {option.description}
                          </span>
                        )}
                        {option.hint && (
                          <span className="branch-selector__hint">
                            {option.hint}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="branch-selector__summary" aria-live="polite">
                  {branchSelectionSummary}
                </p>
              </fieldset>
            </section>
          </div>
          <InlineActions>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("events.wizard.actions.cancel")}
            </Button>
            <Button type="submit">{t("events.wizard.actions.next")}</Button>
          </InlineActions>
        </form>
      )}
      {step === 2 && (
        <form
          className="wizard-step wizard-step--planning"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreateEvent();
          }}
        >
          <div className="event-wizard__layout">
            <div className="event-wizard__main">
              <fieldset className="planning-mode">
                <legend>{t("events.wizard.mode.title")}</legend>
                <div className="planning-mode__options" role="radiogroup">
                  <label
                    className="planning-mode__option"
                    htmlFor={planningModeSimpleId}
                    aria-labelledby={planningModeSimpleLabelId}
                  >
                    <input
                      type="radio"
                      name="planning-mode"
                      value="simple"
                      id={planningModeSimpleId}
                      checked={state.planningMode === "simple"}
                      onChange={() =>
                        setState((prev) => ({
                          ...prev,
                          planningMode: "simple",
                        }))
                      }
                    />
                    <span id={planningModeSimpleLabelId}>
                      <strong>{t("events.wizard.mode.simple.title")}</strong>
                      <small>
                        {t("events.wizard.mode.simple.description")}
                      </small>
                    </span>
                  </label>
                  <label
                    className="planning-mode__option"
                    htmlFor={planningModeSegmentsId}
                    aria-labelledby={planningModeSegmentsLabelId}
                  >
                    <input
                      type="radio"
                      name="planning-mode"
                      value="segments"
                      id={planningModeSegmentsId}
                      checked={state.planningMode === "segments"}
                      onChange={() =>
                        setState((prev) => ({
                          ...prev,
                          planningMode: "segments",
                        }))
                      }
                    />
                    <span id={planningModeSegmentsLabelId}>
                      <strong>{t("events.wizard.mode.segments.title")}</strong>
                      <small>
                        {t("events.wizard.mode.segments.description")}
                      </small>
                    </span>
                  </label>
                </div>
              </fieldset>
              {state.planningMode === "segments" ? (
                <fieldset className="branch-segments">
                  <legend>{t("events.wizard.segments.title")}</legend>
                  {state.branchSegments.length === 0 ? (
                    <p className="branch-segments__empty">
                      {t("events.wizard.segments.empty")}
                    </p>
                  ) : (
                    state.branchSegments.map((segment, index) => (
                      <div key={segment.id} className="branch-segment">
                        <div className="branch-segment__header">
                          <h4>
                            {t("events.wizard.segments.segmentLabel", {
                              index: index + 1,
                            })}
                          </h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSegment(segment.id)}
                          >
                            {t("events.wizard.segments.remove")}
                          </Button>
                        </div>
                        <InlineFields>
                          <label>
                            {t("events.wizard.segments.branch")}
                            <select
                              value={segment.branch}
                              onChange={(event) => {
                                const nextBranch = event.target
                                  .value as EventBranch;
                                updateSegment(segment.id, {
                                  branch: nextBranch,
                                  ...(nextBranch === "RS"
                                    ? { kambusieriCount: "" }
                                    : {}),
                                });
                              }}
                            >
                              {segmentBranchOptions.map((branch) => (
                                <option key={branch.value} value={branch.value}>
                                  {branch.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            {t("events.wizard.segments.accommodation.label")}
                            <select
                              value={segment.accommodation}
                              onChange={(event) =>
                                updateSegment(segment.id, {
                                  accommodation: event.target
                                    .value as EventAccommodation,
                                })
                              }
                            >
                              {accommodationOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </InlineFields>
                        <InlineFields>
                          <label>
                            {t("events.wizard.fields.start")}
                            <input
                              type="date"
                              value={segment.startDate}
                              min={state.start_date || undefined}
                              max={state.end_date || undefined}
                              onChange={(event) =>
                                updateSegment(segment.id, {
                                  startDate: event.target.value,
                                })
                              }
                              required
                            />
                          </label>
                          <label>
                            {t("events.wizard.fields.end")}
                            <input
                              type="date"
                              value={segment.endDate}
                              min={state.start_date || undefined}
                              max={state.end_date || undefined}
                              onChange={(event) =>
                                updateSegment(segment.id, {
                                  endDate: event.target.value,
                                })
                              }
                              required
                            />
                          </label>
                        </InlineFields>
                        <InlineFields>
                          <label>
                            {t("events.wizard.segments.youthCount")}
                            <input
                              type="number"
                              min={0}
                              value={segment.youthCount}
                              onChange={(event) =>
                                updateSegment(segment.id, {
                                  youthCount: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            {t("events.wizard.segments.leadersCount")}
                            <input
                              type="number"
                              min={0}
                              value={segment.leadersCount}
                              onChange={(event) =>
                                updateSegment(segment.id, {
                                  leadersCount: event.target.value,
                                })
                              }
                            />
                          </label>
                          {segment.branch !== "RS" && (
                            <label>
                              {t("events.wizard.segments.kambusieriCount")}
                              <input
                                type="number"
                                min={0}
                                value={segment.kambusieriCount}
                                onChange={(event) =>
                                  updateSegment(segment.id, {
                                    kambusieriCount: event.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                        </InlineFields>
                        <label>
                          {t("events.wizard.segments.notes")}
                          <textarea
                            value={segment.notes}
                            onChange={(event) =>
                              updateSegment(segment.id, {
                                notes: event.target.value,
                              })
                            }
                            rows={2}
                          />
                        </label>
                      </div>
                    ))
                  )}
                  <div className="branch-segments__actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAddSegment}
                    >
                      {t("events.wizard.segments.add")}
                    </Button>
                  </div>
                </fieldset>
              ) : (
                <fieldset className="simple-participants">
                  <legend>{t("events.wizard.simple.title")}</legend>
                  <p className="planning-mode__helper">
                    {t("events.wizard.simple.description")}
                  </p>
                  <div className="simple-participants__grid">
                    <section className="simple-participants__group">
                      <h5>{t("events.branches.LC")}</h5>
                      <InlineFields className="simple-participants__fields">
                        <label>
                          {t("events.wizard.simple.fields.lc")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.lc}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  lc: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          {t("events.wizard.simple.fields.lcKambusieri")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.lcKambusieri}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  lcKambusieri: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </InlineFields>
                    </section>
                    <section className="simple-participants__group">
                      <h5>{t("events.branches.EG")}</h5>
                      <InlineFields className="simple-participants__fields">
                        <label>
                          {t("events.wizard.simple.fields.eg")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.eg}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  eg: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          {t("events.wizard.simple.fields.egKambusieri")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.egKambusieri}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  egKambusieri: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </InlineFields>
                    </section>
                    <section className="simple-participants__group">
                      <h5>{t("events.branches.RS")}</h5>
                      <InlineFields className="simple-participants__fields">
                        <label>
                          {t("events.wizard.simple.fields.rs")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.rs}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  rs: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </InlineFields>
                    </section>
                    <section className="simple-participants__group simple-participants__group--staff">
                      <div className="simple-participants__group-header">
                        <h5>{t("events.wizard.simple.groups.staff")}</h5>
                        <p>{t("events.wizard.simple.groups.staffHint")}</p>
                      </div>
                      <InlineFields className="simple-participants__fields">
                        <label>
                          {t("events.wizard.simple.fields.leaders")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.leaders}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  leaders: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          {t("events.wizard.simple.fields.detachedLeaders")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.detachedLeaders}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  detachedLeaders: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          {t("events.wizard.simple.fields.detachedGuests")}
                          <input
                            type="number"
                            min={0}
                            value={state.participants.detachedGuests}
                            onChange={(event) =>
                              setState((prev) => ({
                                ...prev,
                                participants: {
                                  ...prev.participants,
                                  detachedGuests: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </InlineFields>
                    </section>
                  </div>
                </fieldset>
              )}
              {branchResolutionMessage && state.planningMode === "segments" && (
                <InlineMessage tone="info">
                  {branchResolutionMessage}
                </InlineMessage>
              )}
              <div className="event-wizard__meta">
                <div className="event-wizard__meta-grid">
                  <label>
                    {t("events.wizard.fields.budget")}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={state.budget_total}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          budget_total: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {t("events.wizard.fields.status")}
                    <select
                      value={state.status}
                      onChange={(event) =>
                        setState((prev) => ({
                          ...prev,
                          status: event.target.value as EventStatus,
                        }))
                      }
                    >
                      {statusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="event-wizard__notes">
                  {t("events.wizard.fields.notes")}
                  <textarea
                    value={state.notes}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                    rows={3}
                  />
                </label>
              </div>
            </div>
            {showPlanningSummary && (
              <aside className="event-wizard__summary" aria-live="polite">
                <div className="branch-segments__summary">
                  <h4>{t("events.wizard.segments.summaryTitle")}</h4>
                  <ul>
                    <li>
                      {t("events.wizard.segments.summaryResolvedBranch", {
                        branch: t(
                          `events.branches.${state.planningMode === "segments" ? resolvedBranch : state.branch}`,
                          state.planningMode === "segments"
                            ? resolvedBranch
                            : state.branch,
                        ),
                      })}
                    </li>
                    {participantsTotals.lc > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryBranch", {
                          branch: t("events.branches.LC"),
                          count: participantsTotals.lc,
                        })}
                      </li>
                    )}
                    {participantsTotals.lc_kambusieri > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryKambusieri", {
                          branch: t("events.branches.LC"),
                          count: participantsTotals.lc_kambusieri,
                        })}
                      </li>
                    )}
                    {participantsTotals.eg > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryBranch", {
                          branch: t("events.branches.EG"),
                          count: participantsTotals.eg,
                        })}
                      </li>
                    )}
                    {participantsTotals.eg_kambusieri > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryKambusieri", {
                          branch: t("events.branches.EG"),
                          count: participantsTotals.eg_kambusieri,
                        })}
                      </li>
                    )}
                    {participantsTotals.rs > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryBranch", {
                          branch: t("events.branches.RS"),
                          count: participantsTotals.rs,
                        })}
                      </li>
                    )}
                    {participantsTotals.leaders > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryLeaders", {
                          count: participantsTotals.leaders,
                        })}
                      </li>
                    )}
                    {participantsTotals.detached_leaders > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryDetachedLeaders", {
                          count: participantsTotals.detached_leaders,
                        })}
                      </li>
                    )}
                    {participantsTotals.detached_guests > 0 && (
                      <li>
                        {t("events.wizard.segments.summaryDetachedGuests", {
                          count: participantsTotals.detached_guests,
                        })}
                      </li>
                    )}
                    <li>
                      {t("events.wizard.segments.summaryTotal", {
                        count: totalParticipants,
                      })}
                    </li>
                    {state.planningMode === "segments" &&
                      peakParticipants > 0 && (
                        <li>
                          {t("events.wizard.segments.summaryPeak", {
                            count: peakParticipants,
                          })}
                        </li>
                      )}
                    {state.planningMode === "segments" &&
                      accommodationSummary.needsIndoor && (
                        <li>
                          {t("events.wizard.segments.summaryIndoor", {
                            count: accommodationSummary.indoorCapacity,
                          })}
                        </li>
                      )}
                    {state.planningMode === "segments" &&
                      accommodationSummary.needsTents && (
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
              </aside>
            )}
          </div>
          <InlineActions>
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              {t("events.wizard.actions.back")}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? t("events.wizard.actions.creating")
                : t("events.wizard.actions.create")}
            </Button>
          </InlineActions>
        </form>
      )}
      {step === 3 && createdEvent && (
        <div className="wizard-step" aria-live="polite">
          <p>
            {t("events.wizard.summary.created", { title: createdEvent.title })}
          </p>
          <div className="branch-segments__summary">
            <h4>{t("events.wizard.summary.requirementsTitle")}</h4>
            <ul>
              <li>
                {t("events.wizard.segments.summaryResolvedBranch", {
                  branch: t(
                    `events.branches.${createdEvent.branch}`,
                    createdEvent.branch,
                  ),
                })}
              </li>
              {createdParticipantsTotals.lc > 0 && (
                <li>
                  {t("events.wizard.segments.summaryBranch", {
                    branch: t("events.branches.LC"),
                    count: createdParticipantsTotals.lc,
                  })}
                </li>
              )}
              {createdParticipantsTotals.lc_kambusieri > 0 && (
                <li>
                  {t("events.wizard.segments.summaryKambusieri", {
                    branch: t("events.branches.LC"),
                    count: createdParticipantsTotals.lc_kambusieri,
                  })}
                </li>
              )}
              {createdParticipantsTotals.eg > 0 && (
                <li>
                  {t("events.wizard.segments.summaryBranch", {
                    branch: t("events.branches.EG"),
                    count: createdParticipantsTotals.eg,
                  })}
                </li>
              )}
              {createdParticipantsTotals.eg_kambusieri > 0 && (
                <li>
                  {t("events.wizard.segments.summaryKambusieri", {
                    branch: t("events.branches.EG"),
                    count: createdParticipantsTotals.eg_kambusieri,
                  })}
                </li>
              )}
              {createdParticipantsTotals.rs > 0 && (
                <li>
                  {t("events.wizard.segments.summaryBranch", {
                    branch: t("events.branches.RS"),
                    count: createdParticipantsTotals.rs,
                  })}
                </li>
              )}
              {createdParticipantsTotals.leaders > 0 && (
                <li>
                  {t("events.wizard.segments.summaryLeaders", {
                    count: createdParticipantsTotals.leaders,
                  })}
                </li>
              )}
              {createdParticipantsTotals.detached_leaders > 0 && (
                <li>
                  {t("events.wizard.segments.summaryDetachedLeaders", {
                    count: createdParticipantsTotals.detached_leaders,
                  })}
                </li>
              )}
              {createdParticipantsTotals.detached_guests > 0 && (
                <li>
                  {t("events.wizard.segments.summaryDetachedGuests", {
                    count: createdParticipantsTotals.detached_guests,
                  })}
                </li>
              )}
              <li>
                {t("events.wizard.segments.summaryTotal", {
                  count: createdTotalParticipants,
                })}
              </li>
              {createdNormalizedSegments.length > 0 &&
                createdPeakParticipants > 0 && (
                  <li>
                    {t("events.wizard.segments.summaryPeak", {
                      count: createdPeakParticipants,
                    })}
                  </li>
                )}
              {createdNormalizedSegments.length > 0 &&
                createdAccommodationSummary.needsIndoor && (
                  <li>
                    {t("events.wizard.segments.summaryIndoor", {
                      count: createdAccommodationSummary.indoorCapacity,
                    })}
                  </li>
                )}
              {createdNormalizedSegments.length > 0 &&
                createdAccommodationSummary.needsTents && (
                  <li>
                    {t("events.wizard.segments.summaryTents", {
                      count: createdAccommodationSummary.tentsCapacity,
                    })}
                  </li>
                )}
            </ul>
          </div>
          {createdEvent.branch_segments &&
          createdEvent.branch_segments.length > 0 ? (
            <ul className="branch-segments__list">
              {createdEvent.branch_segments.map((segment) => {
                const branchLabel = t(
                  `events.branches.${segment.branch}`,
                  segment.branch,
                );
                const accommodationLabel = t(
                  `events.wizard.segments.accommodation.options.${segment.accommodation}`,
                );
                const participantsLabel = t(
                  "events.wizard.summary.segmentParticipants",
                  {
                    youth: segment.youth_count,
                    leaders: segment.leaders_count,
                  },
                );
                const extraKambusieri =
                  segment.kambusieri_count > 0
                    ? t("events.wizard.summary.segmentKambusieri", {
                        count: segment.kambusieri_count,
                      })
                    : null;
                return (
                  <li key={segment.id}>
                    <div className="branch-segments__list-info">
                      <strong>{branchLabel}</strong>
                      <span>
                        {t("events.list.period", {
                          start: segment.start_date,
                          end: segment.end_date,
                        })}
                      </span>
                      <span>
                        {extraKambusieri
                          ? `${participantsLabel} · ${extraKambusieri}`
                          : participantsLabel}
                      </span>
                      <span>{accommodationLabel}</span>
                    </div>
                    {segment.notes && (
                      <p className="branch-segments__list-notes">
                        {segment.notes}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="branch-segments__empty">
              {t("events.wizard.summary.noSegments")}
            </p>
          )}
          <LogisticsSummary
            accommodation={createdAccommodationSummary}
            peakParticipants={createdPeakParticipants}
          />
          {isLoadingSuggestions && (
            <InlineMessage>
              {t("events.wizard.suggestions.loading")}
            </InlineMessage>
          )}
          {!isLoadingSuggestions && suggestions.length === 0 && (
            <InlineMessage>
              {t("events.wizard.suggestions.empty")}
            </InlineMessage>
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
                        ? t("events.wizard.suggestions.distance", {
                            value: suggestion.distance_km,
                          })
                        : t("events.wizard.suggestions.distanceUnknown")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={disabled ? "subtle" : "secondary"}
                    size="sm"
                    onClick={() => handleAddSuggestion(suggestion.structure_id)}
                    disabled={disabled || addCandidateMutation.isPending}
                  >
                    {disabled
                      ? t("events.wizard.suggestions.added")
                      : t("events.wizard.suggestions.add")}
                  </Button>
                </li>
              );
            })}
          </ul>
          <InlineActions>
            <Button type="button" onClick={handleFinish}>
              {t("events.wizard.actions.open")}
            </Button>
          </InlineActions>
        </div>
      )}
    </div>
  );
};

export const EventCreatePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="event-create-page">
      <div className="event-create-hero">
        <div className="event-create-hero__content">
          <span className="event-create-hero__badge">
            {t("events.wizard.pageBadge", t("events.hero.badge"))}
          </span>
          <h1>{t("events.wizard.title")}</h1>
          <p>
            {t(
              "events.wizard.pageSubtitle",
              "Organizza ogni dettaglio in tre passaggi chiari.",
            )}
          </p>
        </div>
        <div className="event-create-hero__actions">
          <Button
            type="button"
            variant="subtle"
            onClick={() => navigate("/events")}
          >
            {t("events.wizard.actions.cancel")}
          </Button>
        </div>
      </div>
      <Surface className="event-create-panel">
        <EventCreateWizard
          onClose={() => navigate("/events")}
          onCreated={(event) => {
            navigate(`/events/${event.id}`);
          }}
        />
      </Surface>
    </section>
  );
};

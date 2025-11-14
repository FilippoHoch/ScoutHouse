import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import {
  ApiError,
  calcQuote,
  createQuote,
  exportQuote,
  getQuotes
} from "../shared/api";
import type {
  Event,
  EventCandidate,
  EventParticipants,
  QuoteBreakdownEntry,
  QuoteCalcResponse,
  QuoteListItem,
  QuoteOverrides,
  QuoteScenario
} from "../shared/types";
import {
  Button,
  EmptyState,
  InlineActions,
  InlineMessage,
  Metric,
  SectionHeader,
  Surface,
  TableWrapper,
  ToolbarSection,
} from "../shared/ui/designSystem";

interface EventQuotesTabProps {
  event: Event;
}

const scenarioOrder: QuoteScenario[] = ["best", "realistic", "worst"];

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);

const getMetadataBoolean = (
  metadata: Record<string, unknown>,
  key: string,
): boolean => metadata[key] === true;

const getMetadataNumber = (
  metadata: Record<string, unknown>,
  key: string,
): number | null => {
  const value = metadata[key];
  return typeof value === "number" ? value : null;
};

const getMetadataNotes = (
  entry: QuoteBreakdownEntry,
  currency: string,
  translate: TFunction<"translation", undefined>,
): string[] => {
  const metadata = entry.metadata;
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const metadataRecord = metadata as Record<string, unknown>;
  const notes: string[] = [];
  const forfaitApplied = getMetadataBoolean(metadataRecord, "forfait_trigger_applied");
  const forfaitTotal = getMetadataNumber(metadataRecord, "forfait_trigger_total");
  if (forfaitApplied && forfaitTotal !== null) {
    notes.push(
      translate("events.quotes.breakdown.metadata.forfaitTrigger", {
        value: formatCurrency(forfaitTotal, currency),
      }),
    );
  }

  return notes;
};

function computeNights(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 0);
}

function getCandidateStructures(candidates: EventCandidate[] | null | undefined) {
  if (!candidates) {
    return [];
  }
  return candidates
    .filter((candidate) => candidate.structure)
    .map((candidate) => ({
      id: candidate.structure!.id,
      name: candidate.structure!.name,
      slug: candidate.structure!.slug
    }));
}

export const EventQuotesTab = ({ event }: EventQuotesTabProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const structures = useMemo(() => getCandidateStructures(event.candidates), [event.candidates]);
  const [explicitStructureId, setExplicitStructureId] = useState<number | null>(null);
  const [participantOverrides, setParticipantOverrides] = useState<Partial<EventParticipants>>({});
  const [daysOverride, setDaysOverride] = useState<string>("");
  const [nightsOverride, setNightsOverride] = useState<string>("");
  const [calcResult, setCalcResult] = useState<QuoteCalcResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<QuoteScenario>("realistic");
  const [explicitQuoteId, setExplicitQuoteId] = useState<number | null>(null);
  const [comparisonIds, setComparisonIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const baseNights = useMemo(
    () => computeNights(event.start_date, event.end_date),
    [event.start_date, event.end_date]
  );
  const baseDays = baseNights + 1;

  const quotesQuery = useQuery({
    queryKey: ["quotes", event.id],
    queryFn: () => getQuotes(event.id)
  });

  const quotes = useMemo(() => quotesQuery.data ?? [], [quotesQuery.data]);

  const participantOrder: (keyof EventParticipants)[] = useMemo(
    () => [
      "lc",
      "lc_kambusieri",
      "eg",
      "eg_kambusieri",
      "rs",
      "rs_kambusieri",
      "leaders",
      "detached_leaders",
      "detached_guests",
    ],
    [],
  );

  const participantLabels = useMemo(
    () => ({
      lc: t("events.wizard.simple.fields.lc"),
      lc_kambusieri: t("events.wizard.simple.fields.lcKambusieri"),
      eg: t("events.wizard.simple.fields.eg"),
      eg_kambusieri: t("events.wizard.simple.fields.egKambusieri"),
      rs: t("events.wizard.simple.fields.rs"),
      rs_kambusieri: t("events.wizard.simple.fields.rsKambusieri"),
      leaders: t("events.wizard.simple.fields.leaders"),
      detached_leaders: t("events.wizard.simple.fields.detachedLeaders"),
      detached_guests: t("events.wizard.simple.fields.detachedGuests"),
    }),
    [t],
  );

  const selectedStructureId = useMemo(() => {
    if (
      explicitStructureId !== null &&
      structures.some((structure) => structure.id === explicitStructureId)
    ) {
      return explicitStructureId;
    }
    return structures[0]?.id ?? null;
  }, [explicitStructureId, structures]);

  const selectedQuoteId = useMemo(() => {
    if (explicitQuoteId !== null && quotes.some((quote) => quote.id === explicitQuoteId)) {
      return explicitQuoteId;
    }
    return quotes[0]?.id ?? null;
  }, [explicitQuoteId, quotes]);

  const calcMutation = useMutation({
    mutationFn: calcQuote,
    onSuccess: (data) => {
      setCalcResult(data);
      setError(null);
    },
    onError: (apiError: unknown) => {
      const message =
        apiError instanceof ApiError && apiError.body && typeof apiError.body === "object"
          ? (apiError.body as { detail?: string }).detail ?? "Impossibile calcolare il preventivo."
          : "Impossibile calcolare il preventivo.";
      setError(message);
    }
  });

  const saveMutation = useMutation({
    mutationFn: (payload: QuoteOverrides) =>
      createQuote(event.id, {
        structure_id: selectedStructureId!,
        scenario: selectedScenario,
        overrides: Object.keys(payload).length ? payload : undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes", event.id] });
      setError(null);
    },
    onError: () => {
      setError("Impossibile salvare il preventivo.");
    }
  });

  const handleOverrideChange = (key: keyof EventParticipants, value: string) => {
    setParticipantOverrides((prev) => ({
      ...prev,
      [key]: value === "" ? undefined : Number(value)
    }));
  };

  const buildOverrides = (): QuoteOverrides | undefined => {
    const overrides: QuoteOverrides = {};
    const filteredParticipants = Object.fromEntries(
      Object.entries(participantOverrides).filter(([, value]) => value !== undefined && value !== null)
    );
    if (Object.keys(filteredParticipants).length > 0) {
      overrides.participants = filteredParticipants;
    }
    if (daysOverride.trim()) {
      overrides.days = Number(daysOverride);
    }
    if (nightsOverride.trim()) {
      overrides.nights = Number(nightsOverride);
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
  };

  const handleCalculate = async () => {
    if (!selectedStructureId) {
      setError("Seleziona una struttura candidata.");
      return;
    }
    setError(null);
    const overrides = buildOverrides();
    await calcMutation.mutateAsync({
      event_id: event.id,
      structure_id: selectedStructureId,
      overrides
    });
  };

  const handleSave = async () => {
    if (!selectedStructureId) {
      setError("Seleziona una struttura candidata.");
      return;
    }
    const overrides = buildOverrides();
    await saveMutation.mutateAsync(overrides ?? {});
  };

  const handleToggleComparison = (quoteId: number) => {
    setComparisonIds((prev) => {
      if (prev.includes(quoteId)) {
        return prev.filter((id) => id !== quoteId);
      }
      if (prev.length >= 2) {
        return [prev[1], quoteId];
      }
      return [...prev, quoteId];
    });
  };

  const handleExport = async (format: "xlsx" | "html") => {
    if (!selectedQuoteId) {
      setError("Seleziona un preventivo salvato da esportare.");
      return;
    }
    try {
      const result = await exportQuote(selectedQuoteId, format);
      if (format === "xlsx") {
        const blob = result as Blob;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `preventivo-${selectedQuoteId}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const newWindow = window.open("", "_blank");
        if (newWindow) {
          newWindow.document.write(result as string);
          newWindow.document.close();
        }
      }
      setError(null);
    } catch (apiError) {
      console.error(apiError);
      setError("Impossibile esportare il preventivo.");
    }
  };

  const comparisonQuotes: QuoteListItem[] = comparisonIds
    .map((id) => quotes.find((item) => item.id === id))
    .filter((item): item is QuoteListItem => Boolean(item));

  return (
    <div className="quotes-tab">
      <Surface>
        <SectionHeader>
          <h3>{t("events.quotes.structureTitle")}</h3>
        </SectionHeader>
        {structures.length === 0 ? (
          <EmptyState
            title={t("events.quotes.structureEmpty")}
            description={t("events.quotes.structureHint")}
          />
        ) : (
          <>
            <label>
              <span className="helper-text">{t("events.quotes.structureSelect")}</span>
              <select
                value={selectedStructureId ?? ""}
                onChange={(event) => setExplicitStructureId(Number(event.target.value))}
              >
                {structures.map((structure) => (
                  <option key={structure.id} value={structure.id}>
                    {structure.name}
                  </option>
                ))}
              </select>
            </label>
            <form
              className="toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCalculate();
              }}
            >
              <ToolbarSection>
                {participantOrder
                  .filter((key) => key in event.participants)
                  .map((key) => (
                    <label key={key}>
                      {participantLabels[key]}
                    <input
                      type="number"
                      min={0}
                      value={participantOverrides[key] ?? ""}
                      placeholder={String(event.participants[key])}
                      onChange={(event) =>
                        handleOverrideChange(key, event.target.value)
                      }
                    />
                    </label>
                  ))}
                <label>
                  {t("events.quotes.daysOverride", { value: baseDays })}
                  <input
                    type="number"
                    min={1}
                    value={daysOverride}
                    placeholder={String(baseDays)}
                    onChange={(event) => setDaysOverride(event.target.value)}
                  />
                </label>
                <label>
                  {t("events.quotes.nightsOverride", { value: baseNights })}
                  <input
                    type="number"
                    min={1}
                    value={nightsOverride}
                    placeholder={String(baseNights)}
                    onChange={(event) => setNightsOverride(event.target.value)}
                  />
                </label>
              </ToolbarSection>
              <InlineActions>
                <Button type="submit" disabled={calcMutation.isPending}>
                  {calcMutation.isPending
                    ? t("events.quotes.actions.calculating")
                    : t("events.quotes.actions.calculate")}
                </Button>
              </InlineActions>
            </form>
            {error && <InlineMessage tone="danger">{error}</InlineMessage>}
          </>
        )}
      </Surface>

      {calcResult && (
        <Surface>
          <SectionHeader>
            <h3>{t("events.quotes.resultTitle")}</h3>
          </SectionHeader>
          <TableWrapper>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("events.quotes.breakdown.item")}</th>
                  <th>{t("events.quotes.breakdown.quantity")}</th>
                  <th>{t("events.quotes.breakdown.unit")}</th>
                  <th>{t("events.quotes.breakdown.total")}</th>
                </tr>
              </thead>
              <tbody>
                {calcResult.breakdown.map((entry, index) => {
                  const metadataNotes = getMetadataNotes(entry, calcResult.currency, t);
                  return (
                    <tr key={`${entry.type}-${entry.option_id ?? index}`}>
                      <td>
                        <div className="quote-breakdown__description">
                          <span>{entry.description}</span>
                          {metadataNotes.length > 0 && (
                            <ul className="quote-breakdown__notes">
                              {metadataNotes.map((note, noteIndex) => (
                                <li key={`${entry.type}-${noteIndex}`}>{note}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </td>
                    <td>{entry.quantity ?? "-"}</td>
                    <td>{entry.unit_amount ?? "-"}</td>
                    <td>{entry.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
          <div className="inline-metrics">
            <Metric
              label={t("events.quotes.totals.subtotal")}
              value={calcResult.totals.subtotal.toFixed(2)}
            />
            <Metric
              label={t("events.quotes.totals.utilities")}
              value={calcResult.totals.utilities.toFixed(2)}
            />
            <Metric
              label={t("events.quotes.totals.cityTax")}
              value={calcResult.totals.city_tax.toFixed(2)}
            />
            <Metric
              label={t("events.quotes.totals.deposit")}
              value={calcResult.totals.deposit.toFixed(2)}
            />
            <Metric
              label={t("events.quotes.totals.total")}
              value={calcResult.totals.total.toFixed(2)}
            />
          </div>
          <div className="quote-grid">
            {scenarioOrder.map((scenario) => (
              <div
                key={scenario}
                className={`quote-card${selectedScenario === scenario ? " selected" : ""}`}
              >
                <h3>{t(`events.quotes.scenarios.${scenario}`)}</h3>
                <p className="quote-value">€{calcResult.scenarios[scenario].toFixed(2)}</p>
                <label className="helper-text">
                  <input
                    type="radio"
                    name="scenario"
                    value={scenario}
                    checked={selectedScenario === scenario}
                    onChange={() => setSelectedScenario(scenario)}
                  />
                  {t("events.quotes.scenarios.saveLabel")}
                </label>
              </div>
            ))}
          </div>
          <InlineActions>
            <Button type="button" onClick={() => void handleSave()} disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? t("events.quotes.actions.saving")
                : t("events.quotes.actions.save")}
            </Button>
          </InlineActions>
        </Surface>
      )}

      <Surface>
        <SectionHeader>
          <h3>{t("events.quotes.savedTitle")}</h3>
        </SectionHeader>
        {quotes.length === 0 ? (
          <EmptyState
            title={t("events.quotes.savedEmpty")}
            description={t("events.quotes.savedHint")}
          />
        ) : (
          <TableWrapper>
            <table className="data-table">
              <thead>
                <tr>
                  <th aria-label={t("events.quotes.table.selectLabel")} />
                  <th>{t("events.quotes.table.date")}</th>
                  <th>{t("events.quotes.table.structure")}</th>
                  <th>{t("events.quotes.table.scenario")}</th>
                  <th>{t("events.quotes.table.total")}</th>
                  <th>{t("events.quotes.table.compare")}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <input
                        type="radio"
                        name="selectedQuote"
                        checked={selectedQuoteId === quote.id}
                        onChange={() => setExplicitQuoteId(quote.id)}
                      />
                    </td>
                    <td>{new Date(quote.created_at).toLocaleString()}</td>
                    <td>{quote.structure_name ?? quote.structure_id}</td>
                    <td>{quote.scenario}</td>
                    <td>{quote.total.toFixed(2)}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={comparisonIds.includes(quote.id)}
                        onChange={() => handleToggleComparison(quote.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
        <InlineActions>
          <Button type="button" variant="ghost" onClick={() => void handleExport("xlsx")}>
            {t("events.quotes.actions.exportXlsx")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void handleExport("html")}>
            {t("events.quotes.actions.exportHtml")}
          </Button>
        </InlineActions>
      </Surface>

      {comparisonQuotes.length === 2 && (
        <Surface>
          <SectionHeader>
            <h3>{t("events.quotes.compareTitle")}</h3>
          </SectionHeader>
          <TableWrapper>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("events.quotes.compareScenario")}</th>
                  <th>{comparisonQuotes[0].scenario}</th>
                  <th>{comparisonQuotes[1].scenario}</th>
                  <th>{t("events.quotes.compareDelta")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t("events.quotes.table.total")}</td>
                  <td>{comparisonQuotes[0].total.toFixed(2)}</td>
                  <td>{comparisonQuotes[1].total.toFixed(2)}</td>
                  <td>{(comparisonQuotes[1].total - comparisonQuotes[0].total).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </TableWrapper>
        </Surface>
      )}
    </div>
  );
};

export default EventQuotesTab;

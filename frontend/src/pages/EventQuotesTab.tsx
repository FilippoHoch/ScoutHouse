import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  QuoteCalcResponse,
  QuoteListItem,
  QuoteOverrides,
  QuoteScenario
} from "../shared/types";

interface EventQuotesTabProps {
  event: Event;
}

const scenarioOrder: QuoteScenario[] = ["best", "realistic", "worst"];

function computeNights(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
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
  const queryClient = useQueryClient();
  const structures = useMemo(() => getCandidateStructures(event.candidates), [event.candidates]);
  const [selectedStructureId, setSelectedStructureId] = useState<number | null>(
    structures.length ? structures[0].id : null
  );
  const [participantOverrides, setParticipantOverrides] = useState<Partial<EventParticipants>>({});
  const [daysOverride, setDaysOverride] = useState<string>("");
  const [nightsOverride, setNightsOverride] = useState<string>("");
  const [calcResult, setCalcResult] = useState<QuoteCalcResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<QuoteScenario>("realistic");
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
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

  useEffect(() => {
    if (structures.length > 0 && selectedStructureId === null) {
      setSelectedStructureId(structures[0].id);
    }
  }, [structures, selectedStructureId]);

  useEffect(() => {
    if (quotesQuery.data && quotesQuery.data.length > 0) {
      setSelectedQuoteId((current) => current ?? quotesQuery.data![0].id);
    }
  }, [quotesQuery.data]);

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
      setError("Impossibile esportare il preventivo.");
    }
  };

  const quotes = quotesQuery.data ?? [];

  const comparisonQuotes: QuoteListItem[] = comparisonIds
    .map((id) => quotes.find((item) => item.id === id))
    .filter((item): item is QuoteListItem => Boolean(item));

  return (
    <div className="quotes-tab">
      <section className="card">
        <h3>Struttura candidata</h3>
        {structures.length === 0 ? (
          <p>Nessuna struttura candidata disponibile.</p>
        ) : (
          <select
            value={selectedStructureId ?? ""}
            onChange={(event) => setSelectedStructureId(Number(event.target.value))}
          >
            {structures.map((structure) => (
              <option key={structure.id} value={structure.id}>
                {structure.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="card">
        <h3>Parametri</h3>
        <div className="grid overrides">
          {Object.entries(event.participants).map(([key, value]) => (
            <label key={key}>
              {key.toUpperCase()}
              <input
                type="number"
                min={0}
                value={participantOverrides[key as keyof EventParticipants] ?? ""}
                placeholder={String(value)}
                onChange={(event) => handleOverrideChange(key as keyof EventParticipants, event.target.value)}
              />
            </label>
          ))}
          <label>
            Giorni (default {baseDays})
            <input
              type="number"
              min={1}
              value={daysOverride}
              placeholder={String(baseDays)}
              onChange={(event) => setDaysOverride(event.target.value)}
            />
          </label>
          <label>
            Notti (default {baseNights})
            <input
              type="number"
              min={1}
              value={nightsOverride}
              placeholder={String(baseNights)}
              onChange={(event) => setNightsOverride(event.target.value)}
            />
          </label>
        </div>
        <button type="button" onClick={handleCalculate} disabled={calcMutation.isPending}>
          {calcMutation.isPending ? "Calcolo…" : "Calcola"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {calcResult && (
        <section className="card">
          <h3>Risultato preventivo</h3>
          <table className="breakdown">
            <thead>
              <tr>
                <th>Voce</th>
                <th>Quantità</th>
                <th>Unitario</th>
                <th>Totale</th>
              </tr>
            </thead>
            <tbody>
              {calcResult.breakdown.map((entry, index) => (
                <tr key={`${entry.type}-${entry.option_id ?? index}`}>
                  <td>{entry.description}</td>
                  <td>{entry.quantity ?? "-"}</td>
                  <td>{entry.unit_amount ?? "-"}</td>
                  <td>{entry.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <p>Subtotale: {calcResult.totals.subtotal.toFixed(2)}</p>
            <p>Utenze: {calcResult.totals.utilities.toFixed(2)}</p>
            <p>Tassa di soggiorno: {calcResult.totals.city_tax.toFixed(2)}</p>
            <p>Totale: {calcResult.totals.total.toFixed(2)}</p>
            <p>Caparre: {calcResult.totals.deposit.toFixed(2)}</p>
          </div>
          <div className="scenarios">
            {scenarioOrder.map((scenario) => (
              <div
                key={scenario}
                className={`scenario-card ${selectedScenario === scenario ? "selected" : ""}`}
              >
                <h4>{scenario}</h4>
                <p>{calcResult.scenarios[scenario].toFixed(2)}</p>
                <label>
                  <input
                    type="radio"
                    name="scenario"
                    value={scenario}
                    checked={selectedScenario === scenario}
                    onChange={() => setSelectedScenario(scenario)}
                  />
                  Scenario da salvare
                </label>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvataggio…" : "Salva versione"}
          </button>
        </section>
      )}

      <section className="card">
        <h3>Preventivi salvati</h3>
        {quotes.length === 0 ? (
          <p>Nessun preventivo salvato.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Data</th>
                <th>Struttura</th>
                <th>Scenario</th>
                <th>Totale</th>
                <th>Confronto</th>
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
                      onChange={() => setSelectedQuoteId(quote.id)}
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
        )}
        <div className="actions">
          <button type="button" onClick={() => handleExport("xlsx")}>Esporta XLSX</button>
          <button type="button" onClick={() => handleExport("html")}>Stampa (HTML)</button>
        </div>
      </section>

      {comparisonQuotes.length === 2 && (
        <section className="card">
          <h3>Confronto</h3>
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>{comparisonQuotes[0].scenario}</th>
                <th>{comparisonQuotes[1].scenario}</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Totale</td>
                <td>{comparisonQuotes[0].total.toFixed(2)}</td>
                <td>{comparisonQuotes[1].total.toFixed(2)}</td>
                <td>
                  {(comparisonQuotes[1].total - comparisonQuotes[0].total).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};

export default EventQuotesTab;

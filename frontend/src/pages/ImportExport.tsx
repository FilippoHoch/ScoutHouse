import { ChangeEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  importStructures,
  exportStructures,
  exportEvents,
  ApiError,
  ExportFormat
} from "../shared/api";
import {
  StructureImportDryRunResponse,
  StructureImportError,
  StructureImportResult,
  StructureImportSourceFormat,
  StructureType,
  Season,
  Unit,
  CostBand
} from "../shared/types";
import { useAuth } from "../shared/auth";

interface ParsedError {
  message: string;
  errors: StructureImportError[];
  sourceFormat: StructureImportSourceFormat;
}

function normaliseErrors(
  errors: unknown,
  fallbackFormat: StructureImportSourceFormat
): StructureImportError[] {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors
    .filter((item): item is StructureImportError => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const entry = item as Record<string, unknown>;
      return (
        typeof entry.row === "number" &&
        typeof entry.field === "string" &&
        typeof entry.msg === "string"
      );
    })
    .map((item) => {
      const entry = item as StructureImportError;
      const format =
        entry.source_format === "csv" || entry.source_format === "xlsx"
          ? entry.source_format
          : fallbackFormat;
      return { ...entry, source_format: format };
    });
}

function useImportErrors() {
  const { t } = useTranslation();

  return useCallback(
    (error: unknown, fallbackFormat: StructureImportSourceFormat): ParsedError => {
      if (error instanceof ApiError) {
        const body = error.body as Record<string, unknown> | null;
        if (body && typeof body === "object") {
          if (typeof body.detail === "string") {
            return { message: body.detail, errors: [], sourceFormat: fallbackFormat };
          }
          if (body.detail && typeof body.detail === "object") {
            const detail = body.detail as Record<string, unknown>;
            const message =
              typeof detail.message === "string" ? detail.message : error.message;
            const detailFormat =
              detail.source_format === "csv" || detail.source_format === "xlsx"
                ? (detail.source_format as StructureImportSourceFormat)
                : fallbackFormat;
            const errors = normaliseErrors(detail.errors, detailFormat);
            return { message, errors, sourceFormat: detailFormat };
          }
        }
        if (typeof error.message === "string" && error.message) {
          return { message: error.message, errors: [], sourceFormat: fallbackFormat };
        }
      }
      return {
        message: t("importExport.errors.generic"),
        errors: [],
        sourceFormat: fallbackFormat,
      };
    },
    [t]
  );
}

function summariseErrors(errors: StructureImportError[]): number {
  return new Set(errors.map((error) => error.row)).size;
}

function inferSourceFormatFromFile(
  file: File | null
): StructureImportSourceFormat {
  if (!file?.name) {
    return "xlsx";
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "csv" ? "csv" : "xlsx";
}

const structureTypeOptions: StructureType[] = ["house", "land", "mixed"];
const seasonOptions: Season[] = ["winter", "spring", "summer", "autumn"];
const unitOptions: Unit[] = ["LC", "EG", "RS", "ALL"];
const costBandOptions: CostBand[] = ["cheap", "medium", "expensive"];

export const ImportExportPage = () => {
  const { t } = useTranslation();
  const auth = useAuth();
  const parseError = useImportErrors();

  const [structureFilters, setStructureFilters] = useState({
    q: "",
    province: "",
    type: "" as "" | StructureType,
    season: "" as "" | Season,
    unit: "" as "" | Unit,
    cost_band: "" as "" | CostBand
  });
  const [eventFilters, setEventFilters] = useState({ from: "", to: "" });
  const [structureExportStatus, setStructureExportStatus] = useState<string | null>(null);
  const [structureExportError, setStructureExportError] = useState<string | null>(null);
  const [structureExportLoading, setStructureExportLoading] = useState(false);
  const [eventsExportStatus, setEventsExportStatus] = useState<string | null>(null);
  const [eventsExportError, setEventsExportError] = useState<string | null>(null);
  const [eventsExportLoading, setEventsExportLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StructureImportDryRunResponse | null>(null);
  const [importResult, setImportResult] = useState<StructureImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasBlockingErrors = useMemo(() => {
    if (!preview) {
      return false;
    }
    return preview.invalid_rows > 0;
  }, [preview]);

  const clearStructureExportMessages = () => {
    setStructureExportError(null);
    setStructureExportStatus(null);
  };

  const clearEventsExportMessages = () => {
    setEventsExportError(null);
    setEventsExportStatus(null);
  };

  const handleStructureFilterChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setStructureFilters((previous) => ({ ...previous, [name]: value }));
  };

  const handleEventFilterChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setEventFilters((previous) => ({ ...previous, [name]: value }));
  };

  const parseExportError = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        const body = error.body;
        if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
          return body.detail;
        }
        if (typeof error.message === "string" && error.message) {
          return error.message;
        }
      }
      return t("importExport.export.status.error");
    },
    [t]
  );

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleStructureExport = useCallback(
    async (format: ExportFormat) => {
      clearStructureExportMessages();
      setStructureExportLoading(true);
      try {
        const filtersPayload = Object.fromEntries(
          Object.entries(structureFilters).filter(([, value]) => value !== "" && value !== null)
        );
        const blob = await exportStructures(format, filtersPayload);
        triggerDownload(blob, `structures.${format}`);
        setStructureExportStatus(
          t("importExport.export.status.success", { format: format.toUpperCase() })
        );
      } catch (error) {
        setStructureExportError(parseExportError(error));
      } finally {
        setStructureExportLoading(false);
      }
    },
    [structureFilters, parseExportError, t]
  );

  const handleEventsExport = useCallback(
    async (format: ExportFormat) => {
      clearEventsExportMessages();
      setEventsExportLoading(true);
      try {
        const params = Object.fromEntries(
          Object.entries(eventFilters).filter(([, value]) => value !== "")
        );
        const blob = await exportEvents(format, params);
        triggerDownload(blob, `events.${format}`);
        setEventsExportStatus(
          t("importExport.export.status.success", { format: format.toUpperCase() })
        );
      } catch (error) {
        setEventsExportError(parseExportError(error));
      } finally {
        setEventsExportLoading(false);
      }
    },
    [eventFilters, parseExportError, t]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0] ?? null;
      setFile(selectedFile);
      setImportResult(null);
      setErrorMessage(null);
      setPreview(null);

      if (!selectedFile) {
        return;
      }

      const fallbackFormat = inferSourceFormatFromFile(selectedFile);
      setLoading(true);
      try {
        const result = await importStructures(selectedFile, { dryRun: true });
        setPreview(result);
      } catch (error) {
        const parsed = parseError(error, fallbackFormat);
        setErrorMessage(parsed.message);
        setPreview({
          valid_rows: 0,
          invalid_rows: summariseErrors(parsed.errors),
          errors: parsed.errors,
          preview: [],
          source_format: parsed.sourceFormat,
        });
      } finally {
        setLoading(false);
      }
    },
    [parseError]
  );

  const handleImport = useCallback(async () => {
    if (!file) {
      return;
    }
    const fallbackFormat = inferSourceFormatFromFile(file);
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await importStructures(file, { dryRun: false });
      setImportResult(response);
    } catch (error) {
      const parsed = parseError(error, fallbackFormat);
      setErrorMessage(parsed.message);
      setImportResult(null);
      setPreview((previous) => {
        if (previous) {
          return {
            ...previous,
            invalid_rows: summariseErrors(parsed.errors),
            errors: parsed.errors,
            source_format: parsed.sourceFormat,
          };
        }
        return {
          valid_rows: 0,
          invalid_rows: summariseErrors(parsed.errors),
          errors: parsed.errors,
          preview: [],
          source_format: parsed.sourceFormat,
        };
      });
    } finally {
      setLoading(false);
    }
  }, [file, parseError]);

  return (
    <section>
      <div className="card">
        <h1>{t("importExport.pageTitle")}</h1>

        <section aria-labelledby="export-section-title" className="export-section">
          <h2 id="export-section-title">{t("importExport.export.title")}</h2>
          <div className="export-block">
            <h3>{t("importExport.export.structures.title")}</h3>
            <p>{t("importExport.export.structures.description")}</p>
            <div className="grid">
              <label>
                <span>{t("importExport.export.structures.filters.q")}</span>
                <input
                  type="text"
                  name="q"
                  value={structureFilters.q}
                  onChange={handleStructureFilterChange}
                />
              </label>
              <label>
                <span>{t("importExport.export.structures.filters.province")}</span>
                <input
                  type="text"
                  name="province"
                  value={structureFilters.province}
                  onChange={handleStructureFilterChange}
                  maxLength={2}
                />
              </label>
              <label>
                <span>{t("importExport.export.structures.filters.type")}</span>
                <select
                  name="type"
                  value={structureFilters.type}
                  onChange={handleStructureFilterChange}
                >
                  <option value="">{t("importExport.export.structures.filters.any")}</option>
                  {structureTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("importExport.export.structures.filters.season")}</span>
                <select
                  name="season"
                  value={structureFilters.season}
                  onChange={handleStructureFilterChange}
                >
                  <option value="">{t("importExport.export.structures.filters.any")}</option>
                  {seasonOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("importExport.export.structures.filters.unit")}</span>
                <select
                  name="unit"
                  value={structureFilters.unit}
                  onChange={handleStructureFilterChange}
                >
                  <option value="">{t("importExport.export.structures.filters.any")}</option>
                  {unitOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("importExport.export.structures.filters.costBand")}</span>
                <select
                  name="cost_band"
                  value={structureFilters.cost_band}
                  onChange={handleStructureFilterChange}
                >
                  <option value="">{t("importExport.export.structures.filters.any")}</option>
                  {costBandOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {structureExportError && <p className="error">{structureExportError}</p>}
            {structureExportStatus && <p className="success">{structureExportStatus}</p>}
            <div className="actions">
              <button
                type="button"
                onClick={() => handleStructureExport("csv")}
                disabled={structureExportLoading}
              >
                {structureExportLoading
                  ? t("common.loading")
                  : t("importExport.export.structures.actions.csv")}
              </button>
              <button
                type="button"
                onClick={() => handleStructureExport("xlsx")}
                disabled={structureExportLoading}
              >
                {structureExportLoading
                  ? t("common.loading")
                  : t("importExport.export.structures.actions.xlsx")}
              </button>
              <button
                type="button"
                onClick={() => handleStructureExport("json")}
                disabled={structureExportLoading}
              >
                {structureExportLoading
                  ? t("common.loading")
                  : t("importExport.export.structures.actions.json")}
              </button>
            </div>
          </div>
          <div className="export-block">
            <h3>{t("importExport.export.events.title")}</h3>
            <p>{t("importExport.export.events.description")}</p>
            <div className="grid">
              <label>
                <span>{t("importExport.export.events.filters.from")}</span>
                <input
                  type="date"
                  name="from"
                  value={eventFilters.from}
                  onChange={handleEventFilterChange}
                />
              </label>
              <label>
                <span>{t("importExport.export.events.filters.to")}</span>
                <input
                  type="date"
                  name="to"
                  value={eventFilters.to}
                  onChange={handleEventFilterChange}
                />
              </label>
            </div>
            {eventsExportError && <p className="error">{eventsExportError}</p>}
            {eventsExportStatus && <p className="success">{eventsExportStatus}</p>}
            <div className="actions">
              <button
                type="button"
                onClick={() => handleEventsExport("csv")}
                disabled={eventsExportLoading}
              >
                {eventsExportLoading
                  ? t("common.loading")
                  : t("importExport.export.events.actions.csv")}
              </button>
              <button
                type="button"
                onClick={() => handleEventsExport("xlsx")}
                disabled={eventsExportLoading}
              >
                {eventsExportLoading
                  ? t("common.loading")
                  : t("importExport.export.events.actions.xlsx")}
              </button>
              <button
                type="button"
                onClick={() => handleEventsExport("json")}
                disabled={eventsExportLoading}
              >
                {eventsExportLoading
                  ? t("common.loading")
                  : t("importExport.export.events.actions.json")}
              </button>
            </div>
          </div>
        </section>

        {auth.user?.is_admin ? (
          <section aria-labelledby="import-section-title" className="import-section">
            <h2 id="import-section-title">{t("importExport.title")}</h2>
            <p>{t("importExport.description")}</p>
            <div className="actions">
              <a href="/api/v1/templates/structures.xlsx" className="button" download>
                {t("importExport.downloadTemplateXlsx")}
              </a>
              <a href="/api/v1/templates/structures.csv" className="button" download>
                {t("importExport.downloadTemplateCsv")}
              </a>
            </div>
            <label className="file-input">
              <span>{t("importExport.fileLabel")}</span>
              <input type="file" accept=".xlsx,.csv" onChange={handleFileChange} />
            </label>
            {loading && <p>{t("importExport.loading")}</p>}
            {errorMessage && <p className="error">{errorMessage}</p>}
            {preview && (
              <div className="import-preview">
                <p>
                  {t("importExport.summary", {
                    valid: preview.valid_rows,
                    invalid: preview.invalid_rows,
                  })}
                </p>
                {preview.errors.length > 0 && (
                  <div>
                    <h3>{t("importExport.errors.title")}</h3>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t("importExport.errors.row")}</th>
                          <th scope="col">{t("importExport.errors.field")}</th>
                          <th scope="col">{t("importExport.errors.message")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.errors.map((error) => (
                          <tr key={`${error.row}-${error.field}`}>
                            <td>{error.row}</td>
                            <td>{error.field}</td>
                            <td>{error.msg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {preview.preview.length > 0 && (
                  <div>
                    <h3>{t("importExport.preview.title")}</h3>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t("importExport.preview.slug")}</th>
                          <th scope="col">{t("importExport.preview.action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((item) => (
                          <tr key={item.slug}>
                            <td>{item.slug}</td>
                            <td>{t(`importExport.preview.actions.${item.action}`)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!file || hasBlockingErrors || loading}
                >
                  {loading ? t("common.loading") : t("importExport.actions.import")}
                </button>
              </div>
            )}
            {importResult && (
              <p className="success">
                {t("importExport.success", {
                  created: importResult.created,
                  updated: importResult.updated,
                  skipped: importResult.skipped,
                })}
              </p>
            )}
          </section>
        ) : (
          <p className="muted">{t("importExport.importOnlyAdmin")}</p>
        )}
      </div>
    </section>
  );
};

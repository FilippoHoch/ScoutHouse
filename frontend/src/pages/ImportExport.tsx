import { ChangeEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  importStructures,
  ApiError,
} from "../shared/api";
import {
  StructureImportDryRunResponse,
  StructureImportError,
  StructureImportResult,
  StructureImportSourceFormat
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

export const ImportExportPage = () => {
  const { t } = useTranslation();
  const auth = useAuth();
  const parseError = useImportErrors();

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

  if (!auth.user?.is_admin) {
    return (
      <section>
        <div className="card">
          <h1>{t("importExport.title")}</h1>
          <p>{t("importExport.errors.forbidden")}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h1>{t("importExport.title")}</h1>
        <p>{t("importExport.description")}</p>
        <p>
          <a href="/api/v1/templates/structures.xlsx">
            {t("importExport.downloadTemplateXlsx")}
          </a>
          {" · "}
          <a href="/api/v1/templates/structures.csv">
            {t("importExport.downloadTemplateCsv")}
          </a>
        </p>
        <div>
          <label htmlFor="structures-file" className="label">
            {t("importExport.fileLabel")}
          </label>
          <input
            id="structures-file"
            type="file"
            accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
          />
        </div>

        {loading && (
          <p role="status" aria-live="polite">
            {t("importExport.loading")}
          </p>
        )}

        {errorMessage && (
          <div role="alert" className="alert alert-error">
            {errorMessage}
          </div>
        )}

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
                <h2>{t("importExport.errors.title")}</h2>
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
                <h2>{t("importExport.preview.title")}</h2>
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
              className="button"
              onClick={handleImport}
              disabled={hasBlockingErrors || !file || loading}
            >
              {t("importExport.actions.import")}
            </button>
          </div>
        )}

        {importResult && (
          <div className="import-result" role="status" aria-live="polite">
            {t("importExport.success", {
              created: importResult.created,
              updated: importResult.updated,
              skipped: importResult.skipped,
            })}
          </div>
        )}
      </div>
    </section>
  );
};

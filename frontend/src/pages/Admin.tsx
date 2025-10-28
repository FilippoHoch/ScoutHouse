import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { previewMailTemplate, sendTestMail } from "../shared/api";
import { useAuth } from "../shared/auth";
import type { MailTemplate } from "../shared/types";

const templateValues: MailTemplate[] = [
  "reset_password",
  "task_assigned",
  "candidate_status_changed"
];

export const AdminPage = () => {
  const { t } = useTranslation();
  const auth = useAuth();
  const [selectedTemplate, setSelectedTemplate] = useState<MailTemplate>("reset_password");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const templates = useMemo(
    () =>
      templateValues.map((value) => ({
        value,
        label: t(`admin.notifications.templates.${value}`)
      })),
    [t]
  );

  const handlePreview = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const preview = await previewMailTemplate(selectedTemplate);
      const blob = new Blob([JSON.stringify(preview, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url, "_blank", "noopener");
      if (!newWindow) {
        setErrorMessage(t("admin.notifications.previewError"));
      }
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch (error) {
      setErrorMessage(t("admin.notifications.previewError"));
    }
  };

  const handleSendTest = async () => {
    if (!auth.user?.email) {
      setErrorMessage(t("admin.notifications.testError"));
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setSending(true);
    try {
      const response = await sendTestMail(auth.user.email, selectedTemplate);
      setStatusMessage(
        t("admin.notifications.testSuccess", { provider: response.provider })
      );
    } catch (error) {
      setErrorMessage(t("admin.notifications.testError"));
    } finally {
      setSending(false);
    }
  };

  if (!auth.user?.is_admin) {
    return (
      <section>
        <div className="card">
          <p>{t("admin.forbidden")}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h2>{t("admin.notifications.title")}</h2>
        <p>{t("admin.notifications.description")}</p>
        <label>
          <span>{t("admin.notifications.templateLabel")}</span>
          <select
            value={selectedTemplate}
            onChange={(event) => setSelectedTemplate(event.target.value as MailTemplate)}
          >
            {templates.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {errorMessage && <p className="error">{errorMessage}</p>}
        {statusMessage && <p className="success">{statusMessage}</p>}
        <div className="actions">
          <button type="button" onClick={handlePreview} className="button secondary">
            {t("admin.notifications.preview")}
          </button>
          <button type="button" onClick={handleSendTest} className="button" disabled={sending}>
            {sending ? t("common.loading") : t("admin.notifications.test")}
          </button>
        </div>
      </div>
    </section>
  );
};

export default AdminPage;

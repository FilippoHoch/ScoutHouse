import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getDefaultUserPreferences,
  resetUserPreferences,
  saveUserPreferences,
  useUserPreferences
} from "../shared/preferences";
import type { UserPreferences } from "../shared/preferences";
import type { EventBranch } from "../shared/types";
import { Button, InlineActions, InlineMessage, SectionHeader, Surface } from "../shared/ui/designSystem";

const branchOptions: Array<"" | EventBranch> = ["", "LC", "EG", "RS", "ALL"];

export const SettingsPage = () => {
  const { t } = useTranslation();
  const preferences = useUserPreferences();
  const [formState, setFormState] = useState<UserPreferences>(preferences);
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setFormState(preferences);
  }, [preferences]);

  const hasChanges = useMemo(() => {
    return (
      formState.homeLocation !== preferences.homeLocation ||
      formState.defaultBranch !== preferences.defaultBranch ||
      formState.pricePreferences.cheap !== preferences.pricePreferences.cheap ||
      formState.pricePreferences.medium !== preferences.pricePreferences.medium ||
      formState.pricePreferences.expensive !== preferences.pricePreferences.expensive
    );
  }, [formState, preferences]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveUserPreferences(formState);
    setStatus("saved");
  };

  const handleReset = () => {
    const defaults = getDefaultUserPreferences();
    setFormState(defaults);
    resetUserPreferences();
    setStatus("idle");
  };

  const handleChange = <Key extends keyof UserPreferences>(key: Key, value: UserPreferences[Key]) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value
    }));
    setStatus("idle");
  };

  const handlePriceChange = (key: keyof UserPreferences["pricePreferences"], value: boolean) => {
    setFormState((prev) => ({
      ...prev,
      pricePreferences: {
        ...prev.pricePreferences,
        [key]: value
      }
    }));
    setStatus("idle");
  };

  return (
    <section className="settings-page">
      <header className="page-header">
        <h1>{t("settings.title")}</h1>
        <p className="helper-text">{t("settings.description")}</p>
      </header>
      <Surface>
        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-section">
            <SectionHeader>
              <div>
                <h2>{t("settings.sections.general.title")}</h2>
                <p className="helper-text">{t("settings.sections.general.description")}</p>
              </div>
            </SectionHeader>
            <div className="settings-fields">
              <label>
                {t("settings.fields.homeLocation.label")}
                <input
                  type="text"
                  value={formState.homeLocation}
                  onChange={(event) => handleChange("homeLocation", event.target.value)}
                  placeholder={t("settings.fields.homeLocation.placeholder")}
                />
                <span className="helper-text">{t("settings.fields.homeLocation.helper")}</span>
              </label>
              <label>
                {t("settings.fields.defaultBranch.label")}
                <select
                  value={formState.defaultBranch}
                  onChange={(event) => handleChange("defaultBranch", event.target.value as "" | EventBranch)}
                >
                  {branchOptions.map((branch) => (
                    <option key={branch || "none"} value={branch}>
                      {branch ? t(`settings.fields.defaultBranch.options.${branch}`) : t("settings.fields.defaultBranch.none")}
                    </option>
                  ))}
                </select>
                <span className="helper-text">{t("settings.fields.defaultBranch.helper")}</span>
              </label>
            </div>
          </div>

          <div className="settings-section">
            <SectionHeader>
              <div>
                <h2>{t("settings.sections.pricing.title")}</h2>
                <p className="helper-text">{t("settings.sections.pricing.description")}</p>
              </div>
            </SectionHeader>
            <fieldset className="settings-fieldset">
              <legend>{t("settings.fields.pricePreferences.label")}</legend>
              <p className="helper-text">{t("settings.fields.pricePreferences.helper")}</p>
              <div className="settings-options">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={formState.pricePreferences.cheap}
                    onChange={(event) => handlePriceChange("cheap", event.target.checked)}
                  />
                  <span>{t("settings.fields.pricePreferences.options.cheap")}</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={formState.pricePreferences.medium}
                    onChange={(event) => handlePriceChange("medium", event.target.checked)}
                  />
                  <span>{t("settings.fields.pricePreferences.options.medium")}</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={formState.pricePreferences.expensive}
                    onChange={(event) => handlePriceChange("expensive", event.target.checked)}
                  />
                  <span>{t("settings.fields.pricePreferences.options.expensive")}</span>
                </label>
              </div>
            </fieldset>
          </div>

          {status === "saved" && (
            <InlineMessage>{t("settings.actions.saved")}</InlineMessage>
          )}

          <InlineActions>
            <Button type="submit" disabled={!hasChanges}>
              {t("settings.actions.save")}
            </Button>
            <Button type="button" variant="subtle" onClick={handleReset}>
              {t("settings.actions.reset")}
            </Button>
          </InlineActions>
        </form>
      </Surface>
    </section>
  );
};

export default SettingsPage;
